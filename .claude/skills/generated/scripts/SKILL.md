---
name: scripts
description: "Skill for the Scripts area of butler-sheet-icons. 10 symbols across 3 files."
---

# Scripts

10 symbols | 3 files | Cohesion: 91%

## When to Use

- Working with code in `scripts/`
- Understanding how updateGeneratedBlocks, knownCommandPaths work
- Modifying scripts-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/docs-cli-tables.js` | parseArgs, valueFor, loadExamples, readText, main (+1) |
| `src/lib/docs/cli-option-tables.js` | updateGeneratedBlocks, knownCommandPaths |
| `scripts/gitnexus.js` | clearCachedNpxInstall, main |

## Entry Points

Start here when exploring this area:

- **`updateGeneratedBlocks`** (Function) — `src/lib/docs/cli-option-tables.js:345`
- **`knownCommandPaths`** (Function) — `src/lib/docs/cli-option-tables.js:379`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `updateGeneratedBlocks` | Function | `src/lib/docs/cli-option-tables.js` | 345 |
| `knownCommandPaths` | Function | `src/lib/docs/cli-option-tables.js` | 379 |
| `parseArgs` | Function | `scripts/docs-cli-tables.js` | 56 |
| `valueFor` | Function | `scripts/docs-cli-tables.js` | 66 |
| `loadExamples` | Function | `scripts/docs-cli-tables.js` | 127 |
| `readText` | Function | `scripts/docs-cli-tables.js` | 156 |
| `main` | Function | `scripts/docs-cli-tables.js` | 174 |
| `run` | Function | `scripts/docs-cli-tables.js` | 197 |
| `clearCachedNpxInstall` | Function | `scripts/gitnexus.js` | 83 |
| `main` | Function | `scripts/gitnexus.js` | 117 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Run → ParsePositiveInteger` | cross_community | 5 |
| `Run → DescribeBrowserVersionOption` | cross_community | 5 |
| `Run → BuildBrowserCacheDirOption` | cross_community | 5 |
| `Run → BuildCloudListCollectionsCommand` | cross_community | 5 |
| `Run → BuildCloudRemoveSheetIconsCommand` | cross_community | 5 |
| `Run → DeriveExample` | cross_community | 5 |
| `Run → CodeCell` | cross_community | 5 |
| `Run → Line` | cross_community | 5 |
| `Run → Walk` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Docs | 1 calls |
| Qscloud | 1 calls |

## How to Explore

1. `context({name: "updateGeneratedBlocks"})` — see callers and callees
2. `query({search_query: "scripts"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
