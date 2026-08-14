# README.gitnexus.md

How GitNexus is run in this repository, and the one command you must not use.

This mirrors the setup in [butler-sos](https://github.com/ptarmiganlabs/butler-sos); keep the two in step when changing either — with one deliberate divergence, the hook mechanism, explained under [Automatic re-indexing](#automatic-re-indexing).

## Never run a bare `npx gitnexus analyze`

Including where the generated GitNexus block in `CLAUDE.md` / `AGENTS.md` suggests it.

A bare `analyze` rewrites that managed block. Without `--skip-agents-md` it churns both files on every run, leaving them dirty in unrelated work — which has already broken a `gh pr merge` partway through, after the remote merge had succeeded but before the local cleanup step. And without `--skills` it does not merely regenerate the block but *reduces* it: in butler-sos a bare `analyze` deleted the entire generated-skills table from both files, orphaning skill files that were still on disk.

Re-index only through the `npm run gitnexus:*` scripts below. They route through `scripts/gitnexus.js`, which supplies the right flags.

The read-only subcommands — `impact`, `context`, `query`, `detect-changes` — are safe to run directly. They never write to the managed block.

## One-time setup

GitNexus is deliberately **not** a devDependency: ~40 MB unpacked with native tree-sitter builds is too much to add to every CI install for a local developer tool. Fetch it once per clone:

```bash
npm run gitnexus:install
```

This is the only command allowed to download the package. Everything else runs under `npx --no-install`, which executes an already-present copy and never fetches one.

Then install the git hooks, which is what keeps the index current afterwards:

```bash
pre-commit install
```

Both are per-clone. Until the first is run the hooks are inert by design; until the second is run nothing fires at all — including this repo's ggshield secret scan, which is installed by the same command.

## Commands

| Command | What it does |
|---|---|
| `npm run gitnexus:install` | One-time setup. Fetches the pinned GitNexus |
| `npm run gitnexus:status` | Reports index freshness |
| `npm run gitnexus:index` | Incremental re-index. Omits embeddings, which are the slow part, and preserves any already in the index |
| `npm run gitnexus:refresh` | Full re-index including embeddings, and regenerates the skill files under `.claude/skills/generated/` |

Extra arguments are forwarded, so `npm run gitnexus:index -- --embeddings` works.

There is also an internal `check` subcommand that reports through its exit code and prints nothing. `scripts/gitnexus-reindex.sh` uses it to tell "GitNexus is not installed in this clone" apart from "the re-index failed".

## Everything routes through `scripts/gitnexus.js`

The pinned version and the analyze flags are defined there exactly once, so there is no second copy to keep in sync:

```js
const GITNEXUS_VERSION = '1.6.9';
const ANALYZE_FLAGS = ['--no-stats', '--skip-agents-md'];
```

`--skip-agents-md` is load-bearing, not cosmetic. See the top of this file for what happens without it.

## The MCP tools run a different install

The wrapper governs *indexing*. It does not govern the `gitnexus_*` tools an agent calls: those are served by a **globally installed** GitNexus, registered in `~/.claude.json` as

```json
"gitnexus": { "command": "/Users/<user>/.nvm/versions/node/<version>/bin/gitnexus", "args": ["mcp"] }
```

Claude Code spawns one of those per session, with the session's working directory. Two consequences:

- **The pin and the MCP server drift independently.** Bumping `GITNEXUS_VERSION` changes what `npm run gitnexus:*` runs and nothing else — the tools keep running whatever is installed globally. Upgrade both together. The global install is per nvm node version, and the path in `~/.claude.json` names the one that actually matters.
- **A pin the global install cannot satisfy breaks the npm scripts outright.** GitNexus is in no `node_modules`, so with nothing in the npx cache `npx --no-install gitnexus@<pin>` resolves the copy on `PATH` — the global one — and only when its version matches the pin, which the wrapper writes as an exact spec. Bump the pin past the global install and every `npm run gitnexus:*` dies with `npx canceled due to missing packages`; the re-index hook then prints its "not installed" line and skips, so the index quietly stops being maintained without any command failing. Upgrade the global install alongside the pin, or run `npm run gitnexus:install` to cache the pinned version explicitly.
- **A global upgrade needs `--allow-scripts=@ladybugdb/core`**, for the same reason the npx path does. npm 12 blocks install scripts by default, and without that one `gitnexus --version` still prints a version while every real query dies with `LadybugDB native binary (lbugjs.node) is missing`. The binary ships in the tarball; only the step that moves it into place is blocked, so an install that already went wrong is repaired without re-downloading anything:

    ```bash
    node <prefix>/lib/node_modules/gitnexus/node_modules/@ladybugdb/core/install.js
    ```

    The other blocked scripts do not matter here. The tree-sitter grammars and `onnxruntime-node` ship prebuilt binaries for this platform, and GitNexus's own postinstall only activates vendored grammars for languages this repo does not contain.

Like the hook fix below, this is machine-local: another machine needs the same treatment.

## The managed block is now hand-maintained

Because `--skip-agents-md` is always passed, the block between `<!-- gitnexus:start -->` and `<!-- gitnexus:end -->` in `CLAUDE.md` and `AGENTS.md` is no longer regenerated. Edit it by hand when it needs to change.

That is why the block no longer quotes symbol and relationship counts: they would be frozen at whatever they were when last written, and stale numbers in an instruction file are worse than no numbers. Read `gitnexus://repo/butler-sheet-icons/context` for live statistics instead.

Anything written **after** the `gitnexus:end` marker is outside the managed region and is safe regardless.

The skills table inside the block no longer quotes per-area symbol counts either, for the same reason. Add a row by hand when `gitnexus:refresh` produces a new area under `.claude/skills/generated/`.

## What is still generated, and cannot be hand-edited

Two directories under `.claude/skills/` are regenerated by `gitnexus:refresh` (`--skills`), and hand edits to them are silently overwritten:

- `.claude/skills/generated/` — per-area skills derived from the graph. Expected to change as the code changes; commit the regenerated files.
- `.claude/skills/gitnexus/` — the tool's own skill documentation.

That second one is worth knowing about: those files still tell agents to run a bare `npx gitnexus analyze` when the index is stale, and **the advice cannot be corrected here** — a `refresh` restores the original text. This was verified by editing all six occurrences and watching `gitnexus:refresh` revert every one. butler-sos has the same unfixed advice in its copy.

Until that is fixed upstream, the authoritative instruction is the one in this file and in the managed block: re-index through the npm scripts.

## The Claude Code hook is a separate case, and *has* been corrected

The paragraph above applies to the generated skill files only. The Claude Code hook is not generated and is not reverted, so the same bad advice there was fixable — and has been fixed.

The hook lives at `~/.claude/hooks/gitnexus/gitnexus-hook.cjs`, wired up in `~/.claude/settings.json`. It began as a copy of `hooks/claude/gitnexus-hook.cjs` from the GitNexus package, but is now a hand-maintained fork: it adds `hook-lock.cjs` and `hook-db-lock-probe.cjs` — two files that do not exist in the package at all — to keep the hook off the database while the MCP server owns it. Nothing regenerates it; `gitnexus:refresh` does not touch it.

On a stale index after a `git commit`, `merge`, `rebase`, `cherry-pick` or `pull`, it used to tell the agent to run a bare `npx gitnexus analyze` — the one command this file forbids, recommended to the agent by the tooling itself. It now recommends `npm run gitnexus:index` whenever the repository's `package.json` exposes a `gitnexus:index` script, and falls back to the generic command everywhere else. Detection is by that script's presence rather than by repository name, so butler-sos is covered by the same logic with nothing to keep in sync.

It is also worktree-aware. A linked worktree under `.claude/worktrees/` never carries its own `.gitnexus/`, so the hook resolves the index to the canonical checkout — and therefore reads `HEAD` from that checkout too, not from the worktree. Comparing a worktree branch's `HEAD` against an index built from the canonical checkout marked the index stale on every commit made on a branch, and re-indexing would not have cleared it, because the index describes the canonical checkout either way. The warning now fires when the index is genuinely behind what it indexes, and names the canonical directory so the suggested command is runnable as written.

**This fix is machine-local.** The hook sits outside the repository, so a fresh clone on another machine gets a stock hook and the old advice with it. Re-apply it there, or set `GITNEXUS_HOOK_CLI_PATH` and copy the fork across.

## Worktrees

Most agent work in this repo happens in a linked worktree under `.claude/worktrees/`. GitNexus is usable there, but three things behave differently and none of them announce themselves. `CLAUDE.md` and `AGENTS.md` carry the short version; this is the reasoning.

A fourth thing looks like a worktree problem and is not: `Multiple repositories indexed` fails identically in the canonical checkout. GitNexus resolves the repository from the `repo` parameter alone — never from the working directory — so every tool call has to name it. That is one line in the managed block, not a worktree issue.

**The graph describes the canonical checkout.** A linked worktree carries no `.gitnexus/` of its own, and the re-index hook skips it deliberately — see [Automatic re-indexing](#automatic-re-indexing). So `impact`, `context` and `query` answer as of `main` at its last index: the right answer for the blast radius of changing existing code, the wrong one for code the branch has just added. The work reaches the index when the branch is merged.

**`detect_changes` needed GitNexus ≥ 1.6.6.** Before that it ran `git diff` in the indexed repo root — the canonical checkout — regardless of where it was called from. Since agents work in worktrees and the canonical checkout is normally clean, the answer was "No changes detected", and the managed block mandates that check before every commit. A required safety check that always passes is worse than no check at all, which is why the pin moved to 1.6.9. Upstream fixed it in 1.6.6 with `resolveWorktreeCwd`.

**`rename` still has that shape as of 1.6.9.** It resolves every path against the indexed repo root — for the reads, for the ripgrep sweep, and for the final `writeFile`. Called with `dry_run: false` from a worktree it edits the canonical checkout instead of your branch. Use `dry_run: true` for the reference list and apply the edits by hand until upstream extends `resolveWorktreeCwd` to cover it.

## Version pinning

The version is pinned deliberately. An unpinned `npx gitnexus` executes whatever the registry serves at that moment — a new major, or a compromised release — with no repository change and no review. That matters more now that re-indexing runs from a git hook.

Bump `GITNEXUS_VERSION` in `scripts/gitnexus.js`, and bump butler-sos to match.

## Automatic re-indexing

Four git hooks — `post-commit`, `post-merge`, `post-rewrite` and `post-checkout` — run `scripts/gitnexus-reindex.sh`, which re-indexes incrementally. Between them they cover every routine way the working tree changes. They are declared in `.pre-commit-config.yaml` and installed by `pre-commit install`.

The script never blocks a git operation: every failure path exits 0.

### Why pre-commit and not husky

butler-sos does this with husky, and porting that here would have been a mistake. husky works by pointing `core.hooksPath` at `.husky/_`, which takes `.git/hooks` out of the picture entirely — and that is where this repo's ggshield secret scan lives. The result would have been auto-reindexing bought at the price of a silently disabled secret scan, with nothing to announce the trade.

That is not hypothetical. In butler-sos `core.hooksPath` is `.husky/_`, `.git/hooks` holds no non-sample hooks, and there is no `.husky/pre-commit`, so nothing runs at commit time. It cost that repo nothing only because its `.pre-commit-config.yaml` had been dead since 2022. Ours is current.

The pre-commit framework supports the same four hook types natively, so this needed no new dependency, no `prepare` script and no devDependency — just a `repo: local` entry.

### What the script decides, and why

- **Inert until `npm run gitnexus:install`.** A hook that downloaded and executed a package after every commit would be a supply-chain surface. The download stays opt-in per clone; `node scripts/gitnexus.js check` probes for an already-present copy without fetching one.
- **A missing index is left alone.** A full build is far too slow for a hook, so an absent `.gitnexus/` gets one line of advice rather than a blocked commit.
- **A lost lock race is retried once.** The MCP server holds the KuzuDB index open during an agent session, and a write from the hook can lose that race. Silently accepting a stale index would defeat the point.
- **Linked worktrees are skipped.** Worktrees share `.git`, so git fires these hooks there too — but a worktree has no `.gitnexus/` of its own. The index lives in, and describes, the canonical checkout, which a commit made in a worktree does not touch; re-indexing from there would be a no-op that still costs a write and can lose the lock race. The work reaches the index when the branch is merged in the canonical checkout, where `post-merge` fires.
- **Only branch checkouts count.** `post-checkout` also fires for `git checkout -- <file>`, which changes nothing worth re-indexing.

One thing does not port verbatim from butler-sos: git hands `post-checkout` three positional arguments, whereas pre-commit passes them as `PRE_COMMIT_CHECKOUT_TYPE`, `PRE_COMMIT_FROM_REF` and `PRE_COMMIT_TO_REF`. A copied `[ "$3" = "1" ]` test would read an unset variable and re-index on every file checkout.
