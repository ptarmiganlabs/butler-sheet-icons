#!/bin/sh
#
# Refresh the GitNexus knowledge-graph index after git changes the working tree.
#
# Why a hook rather than documentation: CLAUDE.md already tells agents to re-index
# when the index goes stale, and it still goes stale — the index sat three commits
# behind `main` while this was being written. An instruction is a backstop; the hook
# is the mechanism.
#
# Wired up through .pre-commit-config.yaml rather than husky. butler-sos uses husky
# for the same job, but husky works by pointing core.hooksPath at .husky/_, which
# takes .git/hooks out of the picture entirely — and that is where this repo's
# ggshield secret scan lives. Porting husky here would have traded a working secret
# scan for auto-reindexing without anyone noticing. The pre-commit framework already
# in use supports the same four hook types natively, so it costs no new dependency.
#
# This runs SYNCHRONOUSLY because an incremental index is fast. Running it in the
# background would buy little and risks concurrent writers corrupting KuzuDB.
#
# It never blocks a git operation: every failure path exits 0.

set -u

# --- post-checkout: only branch checkouts are worth re-indexing --------------
#
# git passes post-checkout three positional arguments; pre-commit forwards them as
# environment variables instead, so butler-sos's `[ "${3:-0}" = "1" ]` test does not
# port across unchanged. PRE_COMMIT_CHECKOUT_TYPE is "1" for a branch checkout and
# "0" for a file checkout, and re-indexing on every `git checkout -- <file>` would be
# pure noise. Only post-checkout sets the variable, so the guard is inert elsewhere.
if [ -n "${PRE_COMMIT_CHECKOUT_TYPE:-}" ]; then
    [ "$PRE_COMMIT_CHECKOUT_TYPE" = "1" ] || exit 0

    # Same commit on both sides (e.g. `git checkout -b` from HEAD) changes nothing.
    [ "${PRE_COMMIT_FROM_REF:-}" != "${PRE_COMMIT_TO_REF:-}" ] || exit 0
fi

# --- act only in the checkout that owns the index ----------------------------
#
# Linked worktrees share .git, and git resolves hooks through the shared .git/hooks,
# so these hooks fire from worktrees too. A linked worktree never carries its own
# .gitnexus/: the index lives in the canonical checkout and describes *that*
# checkout's files, which a commit made in a worktree does not touch. Re-indexing
# from here would be a no-op that still costs a KuzuDB write and can lose the lock
# race against a running MCP server. The work reaches the index when the branch is
# merged in the canonical checkout, where post-merge fires.
#
# In the canonical checkout --git-dir and --git-common-dir resolve to the same path;
# in a linked worktree the former is .git/worktrees/<name>. Directory containment
# cannot substitute for this test — worktrees created under .claude/worktrees/ live
# *inside* the canonical root.
git_dir=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null) || exit 0
common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
[ -n "$common_dir" ] || exit 0
[ "$git_dir" = "$common_dir" ] || exit 0

# Hooks already run from the top of the working tree; every path below depends on
# that, so make it explicit rather than inherited.
cd "$(dirname "$common_dir")" || exit 0

# A missing index means a FULL build, which is far too slow to run inside a hook.
# Leave it to the developer and say so once.
if [ ! -d ".gitnexus" ]; then
    echo "gitnexus: no index in this checkout — run 'npm run gitnexus:refresh' to build one." >&2
    exit 0
fi

# node runs the wrapper, npx runs GitNexus itself. Both are checked, and both exit
# silently: an environment without them cannot act on any advice we could print.
command -v node >/dev/null 2>&1 || exit 0
command -v npx >/dev/null 2>&1 || exit 0

# The pinned version, the analyze flags and the npx invocation all live in
# scripts/gitnexus.js — one definition shared by this hook and the gitnexus:* npm
# scripts, so there is no second copy to keep in sync.
#
# The wrapper is absent from every commit made before it was introduced, and
# post-checkout fires on exactly those. That is not the same as GitNexus being
# missing, so it does not get the same message: `npm run gitnexus:install` would not
# fix it, and telling someone to run it wastes their time.
if [ ! -f scripts/gitnexus.js ]; then
    echo "gitnexus: scripts/gitnexus.js not in this checkout — skipping re-index." >&2
    exit 0
fi

# `check` probes for an already-installed copy without fetching one. Nothing on this
# path may download: a hook that installed and executed a package after every commit
# would be a supply-chain surface (SonarCloud shell:S6505, and a fair point). GitNexus
# is not a devDependency either — ~40 MB unpacked with native tree-sitter builds is a
# lot to add to every CI install for a local developer convenience — so it is fetched
# once, deliberately, by `npm run gitnexus:install`.
if ! node scripts/gitnexus.js check >/dev/null 2>&1; then
    echo "gitnexus: not installed — run 'npm run gitnexus:install' to enable auto-reindexing." >&2
    exit 0
fi

# Retried once: the KuzuDB index is held open by the GitNexus MCP server when an
# agent session is running, and a write from here can lose that lock race. A silent
# stale index defeats the whole point, so give it a second chance before giving up.
reindex() {
    node scripts/gitnexus.js index >/dev/null 2>&1
}

if ! reindex; then
    sleep 2
    if ! reindex; then
        echo "gitnexus: index refresh failed twice; run 'npm run gitnexus:index' manually." >&2
        exit 0
    fi
fi

exit 0
