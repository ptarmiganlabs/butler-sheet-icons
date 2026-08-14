<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **butler-sheet-icons**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely. Read `gitnexus://repo/butler-sheet-icons/context` for live index statistics.

> If any GitNexus tool warns the index is stale, run `npm run gitnexus:index` in terminal first.
>
> **Never run a bare `npx gitnexus analyze`.** It rewrites this managed block, and without
> `--skills` it deletes the generated-skills table below. Re-index only through the
> `npm run gitnexus:*` scripts, which route through `scripts/gitnexus.js` and pass the right
> flags. The read-only subcommands (`impact`, `context`, `query`, `detect-changes`) are safe to
> run directly. See `docs/README.gitnexus.md`.

## Always Do

- **MUST pass `repo: "butler-sheet-icons"` on every GitNexus tool call.** GitNexus never infers the repository from the working directory, and this machine has several indexed, so a call that omits `repo` fails with `Multiple repositories indexed` — identically in the canonical checkout and in a worktree. Omitting it is the single most common reason GitNexus looks broken.
- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream", repo: "butler-sheet-icons"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes({repo: "butler-sheet-icons"})` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept", repo: "butler-sheet-icons"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName", repo: "butler-sheet-icons"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph. From a worktree, see the exception below.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## In a linked worktree

Most work here happens in a worktree under `.claude/worktrees/`. Three things behave differently, and none of them announce themselves.

- **The graph describes the canonical checkout at its last index — `main`, not your branch.** `impact`, `context` and `query` answer "as of `main`": correct for the blast radius of changing existing code, blind to code your branch has just added. This is by design — `scripts/gitnexus-reindex.sh` skips linked worktrees, and the work reaches the index when the branch is merged.
- **`gitnexus_rename` with `dry_run: false` writes to the canonical checkout, not to your worktree.** It resolves every path against the indexed repo root, so it edits files outside your branch. Use `dry_run: true` to get the reference list, then apply the edits yourself in the worktree. This is the one exception to the find-and-replace rule above.
- **`gitnexus_detect_changes` reads the worktree only on GitNexus ≥ 1.6.6.** Earlier versions diffed the canonical checkout instead and answered "No changes detected" for every change made in a worktree — a mandated safety check that silently passed. See `docs/README.gitnexus.md`.

## Resources

| Resource                                            | Use for                                  |
| --------------------------------------------------- | ---------------------------------------- |
| `gitnexus://repo/butler-sheet-icons/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/butler-sheet-icons/clusters`       | All functional areas                     |
| `gitnexus://repo/butler-sheet-icons/processes`      | All execution flows                      |
| `gitnexus://repo/butler-sheet-icons/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |
| Work in the Cloud area                       | `.claude/skills/generated/cloud/SKILL.md`                   |
| Work in the Browser area                     | `.claude/skills/generated/browser/SKILL.md`                 |
| Work in the Interactive area                 | `.claude/skills/generated/interactive/SKILL.md`             |
| Work in the Qscloud area                     | `.claude/skills/generated/qscloud/SKILL.md`                 |
| Work in the Qseow area                       | `.claude/skills/generated/qseow/SKILL.md`                   |
| Work in the Util area                        | `.claude/skills/generated/util/SKILL.md`                    |
| Work in the Diag area                        | `.claude/skills/generated/diag/SKILL.md`                    |
| Work in the Docs area                        | `.claude/skills/generated/docs/SKILL.md`                    |
| Work in the Scripts area                     | `.claude/skills/generated/scripts/SKILL.md`                 |

<!-- gitnexus:end -->

## Documenting user-facing changes

If a change adds, alters, or removes behaviour a Butler Sheet Icons user can observe — CLI commands or flags, environment variables, defaults, output, or error messages they are expected to act on — stage a page in `docs/to-doc-site/` as part of the same change.

- Write for **Qlik Sense administrators**, not Node developers.
- `docs/to-doc-site/README.md` defines the workflow: an unprefixed file directly in that folder is pending publication; once processed it is renamed with a `done_` prefix and moved to the `done/` subfolder.
- The published site is [butler-sheet-icons.ptarmiganlabs.com](https://butler-sheet-icons.ptarmiganlabs.com), built from [ptarmiganlabs/butler-sheet-icons-docs](https://github.com/ptarmiganlabs/butler-sheet-icons-docs). Verify with `npm run docs:build` there — it fails on dead links.
- Verify the text against the implementation before publishing rather than trusting the staged draft.

Internal-only changes — refactors, test changes, build or lint tooling — need no doc page.

## Verifying against a live QSEoW environment

Some changes — a thumbnail that should have updated, a login or logout selector, which part of a sheet gets captured — can only be confirmed by opening a real server in a browser. Unit tests cannot show this.

- **Internal browser first** — the in-app browser (`mcp__Claude_Browser__*`) starts from a clean profile. Fall back to Claude in Chrome (`mcp__claude-in-chrome__*`) only when you need the user's existing signed-in session or password manager.
- **Start from a clean browser session** — fresh profile, cleared cache, or incognito. A cached page is the most common reason a "verified" result is really the previous run.
- **Get the app URL first** — ask the user, or build it from the run's options: `https://<host>/<prefix>/sense/app/<appId>` (drop `/<prefix>` when no virtual proxy is used).
- **Never type credentials yourself.** Click login if the form is pre-filled; otherwise ask the user to sign in and wait for their confirmation.
- **Look at the specific thing that changed** — the sheet, the hub thumbnail, or the content library entry — and report what you actually saw.
- **No browser tooling? Say so** — give the user the URL and what to check. Do not call it verified.

## Workflow

The order is: **branch first, implement, verify, stop and report.**

- **MUST create a feature branch before the first edit.** Never work on `main`.
- **NEVER commit to `main`, and never merge to `main` outside a pull request.**
- **MUST stop once the change is implemented and verified.** Report what changed, how it was verified, and what the commit or PR would say. Then wait.
- **NEVER commit, push, open a pull request, or merge** unless the user asks for that step. Authorisation is per request and does not carry over — being asked to open a PR is not permission to merge it.
- Creating GitHub issues and posting comments is allowed without asking.
- **MUST close by weighing the remaining work** — rough cost, value, and one recommended next step rather than a menu. Say plainly when something is not worth doing.

When a commit is authorised:

- **MUST group changes by topic** — one commit per logical change, not one commit listing everything. Split a mixed working tree rather than writing a catch-all message.
- **MUST use Conventional Commits** (`type: subject`). This is functional: release-please derives the changelog and version bump from the type — `feat` minor, `fix` patch, `feat!` or a `BREAKING CHANGE:` footer major. Configured types are `feat`, `fix`, `chore`, `docs`, `build`, `refactor` (hidden from the changelog).
- **MUST NOT give a pull request a Conventional Commits title** — commit subjects use `type: subject`, PR titles are ordinary sentences. PRs land as merge commits and GitHub copies the PR title into the merge commit _body_; release-please cannot parse the merge subject, falls back to the body, and emits a **duplicate changelog entry**. That is why the 4.0.0 release PR listed 154 entries for 128 real changes. If a conventional PR title is unavoidable, merge with `gh pr merge --merge --body ""` — but the title rule is the one that also covers merges done in the web UI.

See `AGENTS.md` for the full set of repository conventions.
