<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **butler-sheet-icons** (898 symbols, 1073 relationships, 5 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/butler-sheet-icons/context` | Codebase overview, check index freshness |
| `gitnexus://repo/butler-sheet-icons/clusters` | All functional areas |
| `gitnexus://repo/butler-sheet-icons/processes` | All execution flows |
| `gitnexus://repo/butler-sheet-icons/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Cloud area (22 symbols) | `.claude/skills/generated/cloud/SKILL.md` |
| Work in the Browser area (10 symbols) | `.claude/skills/generated/browser/SKILL.md` |
| Work in the Qscloud area (6 symbols) | `.claude/skills/generated/qscloud/SKILL.md` |
| Work in the Qseow area (4 symbols) | `.claude/skills/generated/qseow/SKILL.md` |

<!-- gitnexus:end -->

## Butler Sheet Icons — Agent Guide

## Commands

- `npm ci` — install deps
- `npm run lint:fix` then `npm run test:unit` — required quality gates before commit
- `npm run test:unit` — Jest with ESM (uses `node --experimental-vm-modules`)
- Single test: `node --experimental-vm-modules node_modules/jest/bin/jest.js src/path/to/file.test.js`
- `npm run format` — Prettier
- `npm run build:macos` — produce a macOS SEA binary

## Architecture

- **Runtime entrypoint**: `src/butler-sheet-icons.js` — Commander-based CLI
- **Global singleton**: `src/globals.js` (logger + shared state) — many modules depend on it; prefer existing patterns
- **Commands**:
    - `qseow` — Qlik Sense Enterprise on Windows (QSEoW) integration in `src/lib/qseow/`
    - `qscloud` — Qlik Sense Cloud integration in `src/lib/cloud/`
    - `browser` — Puppeteer browser install/management in `src/lib/browser/`
- **Utilities**: `src/lib/util/` — shared helpers (config loading, logging, image processing, etc.)
- **Tests**: `src/__tests__/` for top-level CLI tests; module-specific tests live next to code as `*.test.js`
- **Dockerfile**: `src/Dockerfile` — multi-stage build with Chromium for Puppeteer

## Conventions

- **ESM only** (`"type": "module"`) — use `import`/`export`, avoid `require`
- **Node.js 24+** (`engines.node` in `package.json`) — use modern JS (optional chaining, `??`, top-level await, etc.)
- **Commander** for CLI argument parsing; do not roll new CLI parsers
- **Logging** — use `globals.logger` (winston-based), never `console.log`
- **Config-driven** — many runtime options come from env vars (`BSI_HOST`, `BSI_CERT_FILE`, `BSI_CLOUD_*`, etc.) or a YAML config; avoid hard-coding new env-var reads
- **Dependencies** — Docker/SEA builds use `--omit=dev`; runtime deps must be in `dependencies`, not `devDependencies`

## Browser / Puppeteer

- The tool can install/manage Chrome and Firefox via `@puppeteer/browsers`
- Docker images install Chromium at `/usr/bin/chromium-browser`; set `PUPPETEER_EXECUTABLE_PATH` accordingly
- Puppeteer launch options are centralized in `src/lib/browser/` — do not create new browser instances ad hoc
- Long browser sessions can hold files open; always call `browser.close()` (or use the `try/finally` helpers) to avoid hanging tests

## SEA (Single Executable App)

- SEA config: `build-script/sea-config.json` — bundles `build.cjs` and enigma.js JSON schemas as assets
- `scripts/release-*.sh` / `scripts/release-*.ps1` produce signed/notarized binaries for macOS, Linux, Windows
- `scripts/insider-build-*.sh` / `scripts/insider-build-*.ps1` produce unsigned insider builds
- In SEA binaries, `__dirname`/`__filename` are unavailable; use the helpers in `src/lib/util/import-meta-url.js` (injected at build time)
- Always clean up `build.cjs` and `sea-prep.blob` after builds

## Security

- No real secrets/keys/certs in repo — secrets are provided via env vars or `BSI_*` vars in CI
- QSEoW certificate handling uses `BSI_CERT_FILE` / `BSI_CERT_KEY_FILE`; ensure files are `chmod 600` before use
- Puppeteer runs in headless mode by default — only switch to `--headless false` for local debugging
