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

## Butler Sheet Icons — Agent Guide

## Commands

- `npm ci` — install deps
- `npm run lint:fix` then `npm run test:unit` — required quality gates before commit
- `npm run test:unit` — unit tests only (fast, no network); uses `node --experimental-vm-modules`
- `npm run test:integration` — integration tests only (need real Qlik servers/certs/browsers; long-running)
- `npm run test` — runs both `test:unit` and `test:integration`
- `npm run test:watch` — unit tests in watch mode
- `npm run jest:handles -- --testPathPatterns=<pattern>` — re-run a suite with `--detectOpenHandles`. Only for investigating a suite that does not exit; the flag is deliberately off by default (see `jest.config.mjs`)
- Single test: `node --experimental-vm-modules node_modules/jest/bin/jest.js src/path/to/file.test.js`
- `npm run format` — Prettier
- `npm run build:macos` — produce a macOS SEA binary
- `BSI_BINARY=build/butler-sheet-icons npm run test:binary` — run a built binary beside the source (`src/__tests__/binary.test.js`); it skips without `BSI_BINARY`, and `REQUIRE_BINARY=1` makes that a failure

## Architecture

- **Runtime entrypoint**: `src/butler-sheet-icons.js` — Commander-based CLI
- **Global singleton**: `src/globals.js` (logger + shared state) — many modules depend on it; prefer existing patterns
- **Commands**:
    - `qseow` — Qlik Sense Enterprise on Windows (QSEoW) integration in `src/lib/qseow/`
    - `qscloud` — Qlik Sense Cloud integration in `src/lib/cloud/`
    - `browser` — Puppeteer browser install/management in `src/lib/browser/`
- **Utilities**: `src/lib/util/` — shared helpers (config loading, logging, image processing, etc.)
- **Tests**: `src/__tests__/` for top-level CLI tests; module-specific tests live next to code as `*.test.js`
- **Test types** — `*.test.js` are unit tests (run by `test:unit`); `*.integration.test.js` are integration tests that need external services (run by `test:integration`). Always use the `.integration.test.js` suffix for tests that require network, credentials, real Qlik servers, or browser downloads.
- **ESM-friendly Jest imports** — use `import { jest, describe, test, expect } from '@jest/globals';` at the top of test files.
- **ESM mocking** — use `jest.unstable_mockModule('some-module', () => ({...}))` _before_ importing, then `const mod = await import('some-module');`. Plain `jest.mock()` does not work with ESM.
- **Dockerfile**: `src/Dockerfile` — multi-stage build with Chromium for Puppeteer

## Conventions

- **ESM only** (`"type": "module"`) — use `import`/`export`, avoid `require`
- **Node.js 24+** (`engines.node` in `package.json`) — use modern JS (optional chaining, `??`, top-level await, etc.)
- **Commander** for CLI argument parsing; do not roll new CLI parsers
- **Logging** — use `globals.logger` (winston-based), never `console.log`. Keep log messages free of secrets (tokens, credentials, certificate contents).
- **JSDoc** — enforced via `eslint-plugin-jsdoc` on functions, methods, and classes. Document behavior, list all params (with name/type/description), list return type (including `Promise<T>`), and insert a blank line between the `@param` and `@returns` blocks.
- **Prettier** — 100 printWidth, 4 tabWidth, single quotes, trailing comma `es5`. Config in `.prettierrc.yaml`; run `npm run format` before committing.
- **Config-driven** — many runtime options come from env vars (`BSI_HOST`, `BSI_CERT_FILE`, `BSI_CLOUD_*`, etc.) or a YAML config; avoid hard-coding new env-var reads
- **Dependencies** — Docker/SEA builds use `--omit=dev`; runtime deps must be in `dependencies`, not `devDependencies`
- **Repo hygiene** — do not edit `node_modules/`, `build/`, `coverage/`, `sea-prep.blob`, `build.cjs`, or other generated artifacts. No drive-by formatting/indentation changes — keep diffs focused on the requested change.
- **Document user-facing changes** — if a change adds, alters, or removes behaviour a BSI user can observe (CLI commands or flags, environment variables, defaults, output, or error messages they are expected to act on), stage a page in `docs/to-doc-site/` as part of the same change. Write for Qlik Sense administrators, not Node developers. See `docs/to-doc-site/README.md` for the staging and publication workflow — processed files are renamed with a `done_` prefix and moved to the `done/` subfolder; the published site is [butler-sheet-icons.ptarmiganlabs.com](https://butler-sheet-icons.ptarmiganlabs.com), built from [ptarmiganlabs/butler-sheet-icons-docs](https://github.com/ptarmiganlabs/butler-sheet-icons-docs). Internal-only changes (refactors, test changes, tooling) need no doc page.

## Browser / Puppeteer

- The tool can install/manage Chrome via `@puppeteer/browsers`. Chrome only — the render path speaks the Chrome DevTools Protocol
- Docker images install Chromium at `/usr/bin/chromium-browser`; set `PUPPETEER_EXECUTABLE_PATH` accordingly
- Puppeteer launch options are centralized in `src/lib/browser/` — do not create new browser instances ad hoc
- Long browser sessions can hold files open; always call `browser.close()` (or use the `try/finally` helpers) to avoid hanging tests

## Verifying against a live QSEoW environment

The section above is about the browser BSI drives. This one is about the browser **you** drive. Some changes — a thumbnail that should have updated, a login or logout selector, which part of a sheet gets captured — can only be confirmed by looking at a real server. Unit tests cannot show this.

- **Reach for the internal browser first.** Claude Code's in-app browser (`mcp__Claude_Browser__*`) starts from a clean profile, which satisfies the next point for free. Fall back to Claude in Chrome (`mcp__claude-in-chrome__*`) only when the task needs the user's existing signed-in session or password manager. Other agents: use whatever equivalent browser tooling you have.
- **Start from a clean browser session** — a fresh profile, cleared cache, or an incognito/private window. A cached page is the most common reason a "verified" result is really the previous run.
- **Get the app URL before opening anything.** Ask the user for it, or build it from the run's own options: `https://<host>/<prefix>/sense/app/<appId>`, dropping `/<prefix>` when no virtual proxy is in play. The hub is `https://<host>/<prefix>/hub`.
- **Never type credentials yourself.** If the login form is already filled in, click the login button. Otherwise ask the user to sign in, and wait until they confirm they are done.
- **Look at the specific thing that changed** — the sheet, the hub thumbnail, or the content library entry — and report what you actually saw, not what should have happened.
- **If you have no browser tooling, say so.** Give the user the exact URL and what to look for. Do not describe the change as verified.

## SEA (Single Executable App)

- SEA config: `build-script/sea-config.json` — bundles `build.cjs` and enigma.js JSON schemas as assets
- `scripts/release-*.sh` / `scripts/release-*.ps1` build the release binaries, **all three unsigned**: `scripts/sign-macos.sh` signs and notarizes the macOS one in a step of its own, `sign-win64` in `ci.yaml` signs Windows, and Linux is not signed (see below)
- `scripts/insider-build-*.sh` / `scripts/insider-build-*.ps1` produce insider builds, unsigned. The macOS one is then signed and notarized by `scripts/sign-macos.sh`, as a release is; Windows and Linux insiders stay unsigned
- The macOS binary is tested after it is signed, by `npm run test:binary`, in the release job, the insider build and the signing canary; the macOS leg of `pr-unit-tests` builds one, signs it ad hoc with the hardened runtime and `release-config/butler-sheet-icons.entitlements`, and tests that. A missing JIT entitlement makes the binary die at start (exit 133). No step that runs the binary or npm holds the Apple secrets: they are on the signing step alone
- The macOS binary is signed with the identifier `com.ptarmiganlabs.butler-sheet-icons`, releases and insider builds alike, as homing and xray sign with theirs. It goes into the designated requirement, which is how macOS recognises a later build as the same program, so it never changes. `src/__tests__/binary.test.js` pins it, and under a Developer ID signature the whole requirement, team included. Builds up to 5.2.0 were named after the file
- In SEA binaries, `__dirname`/`__filename` are unavailable; use the helpers in `src/lib/util/import-meta-url.js` (injected at build time)
- Always clean up `build.cjs` and `sea-prep.blob` after builds

### Windows code signing

Releases are signed through **Azure Artifact Signing**, on GitHub-hosted runners, by three jobs in `ci.yaml`. No certificate is stored anywhere and no session has to be open: the signing job authenticates with GitHub's OIDC token.

- `build-win64` runs `scripts/release-win.ps1`, which builds the binary unsigned, smoke-tests `--version`, checks it carries no signature and records its SHA-256.
- `sign-win64` checks that digest, signs in the `release-signing` environment, verifies the signature with signtool and with Windows, and fails unless the signer is **Ptarmigan Labs AB**. **It must never gain an `actions/checkout`, an `npm` step or a `./scripts` call** — that is what keeps a compromised dependency away from the signing identity. A step that needs the repository belongs in `build-win64` or `publish-win64`.
- `publish-win64` zips `<tag>-win.zip` (`butler-sheet-icons.exe` only), checks the zipped executable is the one `sign-win64` verified, and attaches it to the draft release.
- **Rehearse before a release depends on it:** `gh workflow run ci.yaml -R ptarmiganlabs/butler-sheet-icons --ref main -f rehearse_signing=true` builds and signs `main`'s HEAD and releases nothing; the signed binary stays as the `win64-signed` artifact for three days. It has to be `main`, because `release-signing` admits no other branch. Check that `sign-win64` actually ran, not just that the run is green.
- Two things live outside the repository. The `release-signing` environment holds six variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `SIGNING_ENDPOINT`, `SIGNING_ACCOUNT_NAME`, `SIGNING_CERT_PROFILE_NAME`. And the Entra app needs a federated credential whose subject matches exactly what GitHub presents: `repo:ptarmiganlabs@6304190/butler-sheet-icons@381155354:environment:release-signing`. A mismatch fails the login with AADSTS700213. Regenerate the prefix rather than retyping it (`gh api repos/ptarmiganlabs/butler-sheet-icons/actions/oidc/customization/sub --jq .sub_claim_prefix`), and expect a repository or environment rename to break it.
- Insiders builds are not signed.
- `scripts/lib/win-signing.ps1` keeps only the signtool lookup and the signature strip that every Windows build needs before postject. A variant build may dot-source it under Windows PowerShell 5.1, so `pr-unit-tests` runs `scripts/diag/win-strip-check.ps1` under both 5.1 and PowerShell 7.

### macOS code signing

Releases, insider builds and the weekly `macos-signing-canary` are signed with the Developer ID on GitHub-hosted `macos-15`, in two steps of one job. Building and signing are separate scripts so that the Apple secrets are only ever in the environment of the step that signs, and no dependency code runs in that step.

- `scripts/release-macos.sh`, or `scripts/insider-build-mac.sh`, builds the binary and signs it ad hoc. It holds no secret.
- `scripts/sign-macos.sh <binary> <zip>` signs it with the Developer ID and verifies the signature. It then zips it as `butler-sheet-icons/butler-sheet-icons`, the layout every release has had, and has Apple notarize the zip, refusing any verdict but `Accepted`. It runs no npm and never runs the binary.
- **The signing step trusts nothing earlier steps could have changed.**
  - It runs privileged bash, drops every variable but the six secrets and the few it names, and uses the system `PATH`.
  - It refuses to sign if the signing kit differs from a digest recorded before `npm ci`. The kit is the script, its keychain library, the entitlements and `release-config/apple-ca/`.
  - **Do not give the secrets back to the job or to the build step**, and change the three signing steps together.
- `scripts/lib/macos-signing-keychain.sh` makes a throwaway keychain in a folder of the run's own, with a password made per run, and imports Apple's CAs into it from `release-config/apple-ca/`.
  - It never writes the default keychain.
  - It refuses when the search list cannot be read.
  - It writes the list back exactly as it found it, minus only its own `bsi-signing-*` entries.

  That is what makes the scripts safe on a persistent Mac, such as a self-hosted runner or a maintainer's own machine, and not only on a runner that is thrown away.
- Notarization authenticates from that keychain (`notarytool store-credentials`, then `--keychain-profile`), so the twenty-minute wait carries no password on its command line. `PROD_MACOS_CI_KEYCHAIN_PWD` is no longer read.
- `src/__tests__/macos-signing-kit.test.js` runs the kit against stand-ins for Apple's tools on every pull request. Apple's side, a real signature and notarization, is the canary's to prove. Run it after changing any of these: `gh workflow run macos-signing-canary.yaml -R ptarmiganlabs/butler-sheet-icons --ref main`.

### CI runners

This repository is public, so every job runs on a GitHub-hosted runner: no self-hosted runner group admits a public repository (plabs-house-rules, `rules/ci/public-repositories.md`). Do not add a `self-hosted` label; such a job never starts.

- The QSEoW tests need the homelab, so they run from the private companion **butler-sheet-icons-e2e**, nightly and by hand. Before merging a release-please PR, test its head there: `gh workflow run qseow-e2e.yaml -R ptarmiganlabs/butler-sheet-icons-e2e -f ref=<sha>`.
- The QS Cloud credentials live in the `qscloud-tests` environment, which admits only `main`.

## Security

- No real secrets/keys/certs in repo — secrets are provided via env vars or `BSI_*` vars in CI
- QSEoW certificate handling uses `BSI_CERT_FILE` / `BSI_CERT_KEY_FILE`; ensure files are `chmod 600` before use
- Puppeteer runs in headless mode by default — only switch to `--headless false` for local debugging

## Workflow

The order is: **branch first, implement, verify, stop and report.** Committing, pushing, opening a PR and merging are separate steps that each need the user to ask for them.

- **MUST create a feature branch before making any change.** Check it out before the first edit, so that when a commit is eventually authorised it cannot land on `main`.
- **NEVER commit to `main`, and never merge to `main` outside a pull request.** A PR is the only route into `main` — no direct commits, no fast-forwards.
- **MUST stop once the change is implemented and verified.** Report what changed, how it was verified, and what the commit or PR would say. Then wait.
- **NEVER commit, push, open a pull request, or merge** unless the user has asked for that step. Authorisation is per request and does not carry over — being asked to commit once does not authorise committing next time, and being asked to open a PR is not permission to merge it.
- Creating GitHub issues and posting comments on issues or PRs is allowed without asking. They record findings without changing the code.
- **MUST close by weighing the remaining work.** For each open item give the rough cost, the value it delivers, and then a single recommended next step rather than a menu of options. Say plainly when something is not worth doing, and why.

### When a commit is authorised

- **MUST group changes by topic.** One commit per logical change. Do not lump unrelated edits into a single commit, and split a mixed working tree into separate commits rather than writing one message that lists everything. A reviewer should be able to read one commit and understand one thing.
- **MUST use Conventional Commits** — `type: subject`, or `type(scope): subject`. This is functional, not cosmetic: release-please derives both the changelog and the version bump from the type. `feat` produces a minor bump, `fix` a patch, and `feat!` or a `BREAKING CHANGE:` footer a major.
- The types configured in `release-please-config.json` are `feat`, `fix`, `chore`, `docs`, `build` and `refactor`. `refactor` is deliberately hidden from the changelog. A type outside that list still parses, but will not show up where you expect it to.
- Explain **why** in the body, not just what — the diff already says what changed.
- **MUST NOT give a pull request a Conventional Commits title.** Commit subjects use `type: subject`; PR titles must not. Write the PR title as an ordinary sentence — "Ship the Windows binary again, unsigned until a certificate is available", not `fix: ship the Windows binary unsigned`.

    This is not style. PRs land here as merge commits, and GitHub puts the PR title into the **body** of the merge commit. release-please cannot parse the merge commit's subject (`Merge pull request #924 from …`), so it falls back to the body — finds a second conventional commit there — and emits a **duplicate changelog entry** for every such PR. The 4.0.0 release PR had 154 entries for 128 real changes and had to be de-duplicated by hand; 4.0.1 started doing the same.

    If a PR genuinely needs a conventional title for something else, strip the merge commit body instead: `gh pr merge --merge --body ""`. Do not rely on that as the default — it does not help anyone merging through the GitHub web UI, which is why the title rule is the one that holds.
