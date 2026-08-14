---
name: docs
description: "Skill for the Docs area of butler-sheet-icons. 13 symbols across 1 files."
---

# Docs

13 symbols | 1 files | Cohesion: 88%

## When to Use

- Working with code in `src/`
- Understanding how renderTable, line, renderOptionTable work
- Modifying docs-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/docs/cli-option-tables.js` | blockBody, renderTable, line, renderOptionTable, commandAt (+8) |

## Entry Points

Start here when exploring this area:

- **`renderTable`** (Function) — `src/lib/docs/cli-option-tables.js:251`
- **`line`** (Function) — `src/lib/docs/cli-option-tables.js:258`
- **`renderOptionTable`** (Function) — `src/lib/docs/cli-option-tables.js:276`
- **`commandAt`** (Function) — `src/lib/docs/cli-option-tables.js:305`
- **`content`** (Function) — `src/lib/docs/cli-option-tables.js:348`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `renderTable` | Function | `src/lib/docs/cli-option-tables.js` | 251 |
| `line` | Function | `src/lib/docs/cli-option-tables.js` | 258 |
| `renderOptionTable` | Function | `src/lib/docs/cli-option-tables.js` | 276 |
| `commandAt` | Function | `src/lib/docs/cli-option-tables.js` | 305 |
| `content` | Function | `src/lib/docs/cli-option-tables.js` | 348 |
| `renderBlock` | Function | `src/lib/docs/cli-option-tables.js` | 371 |
| `escapeCell` | Function | `src/lib/docs/cli-option-tables.js` | 75 |
| `codeCell` | Function | `src/lib/docs/cli-option-tables.js` | 106 |
| `formatDefault` | Function | `src/lib/docs/cli-option-tables.js` | 128 |
| `formatDescription` | Function | `src/lib/docs/cli-option-tables.js` | 157 |
| `deriveExample` | Function | `src/lib/docs/cli-option-tables.js` | 182 |
| `optionRowsFor` | Function | `src/lib/docs/cli-option-tables.js` | 202 |
| `blockBody` | Function | `src/lib/docs/cli-option-tables.js` | 26 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Content → ParsePositiveInteger` | cross_community | 6 |
| `Content → EscapeCell` | cross_community | 5 |
| `Content → CodeCell` | cross_community | 5 |
| `Content → DescribeBrowserVersionOption` | cross_community | 5 |
| `Content → BuildBrowserCacheDirOption` | cross_community | 5 |
| `Content → BuildCloudListCollectionsCommand` | cross_community | 5 |
| `Content → BuildCloudRemoveSheetIconsCommand` | cross_community | 5 |
| `Run → DeriveExample` | cross_community | 5 |
| `Run → CodeCell` | cross_community | 5 |
| `Run → Line` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Qscloud | 1 calls |

## How to Explore

1. `context({name: "renderTable"})` — see callers and callees
2. `query({search_query: "docs"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
