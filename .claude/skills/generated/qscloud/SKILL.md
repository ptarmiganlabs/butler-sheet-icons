---
name: qscloud
description: "Skill for the Qscloud area of butler-sheet-icons. 6 symbols across 4 files."
---

# Qscloud

6 symbols | 4 files | Cohesion: 63%

## When to Use

- Working with code in `src/`
- Understanding how everyLeafCommand, walk, leafCommandAt work
- Modifying qscloud-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/interactive/command-tree.js` | everyLeafCommand, walk, leafCommandAt |
| `src/lib/commands/qscloud/index.js` | buildQscloudCommand |
| `src/lib/commands/qscloud/list-collections.js` | buildCloudListCollectionsCommand |
| `src/lib/commands/qscloud/remove-sheet-icons.js` | buildCloudRemoveSheetIconsCommand |

## Entry Points

Start here when exploring this area:

- **`everyLeafCommand`** (Function) — `src/lib/interactive/command-tree.js:26`
- **`walk`** (Function) — `src/lib/interactive/command-tree.js:29`
- **`leafCommandAt`** (Function) — `src/lib/interactive/command-tree.js:57`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `everyLeafCommand` | Function | `src/lib/interactive/command-tree.js` | 26 |
| `walk` | Function | `src/lib/interactive/command-tree.js` | 29 |
| `leafCommandAt` | Function | `src/lib/interactive/command-tree.js` | 57 |
| `buildQscloudCommand` | Function | `src/lib/commands/qscloud/index.js` | 10 |
| `buildCloudListCollectionsCommand` | Function | `src/lib/commands/qscloud/list-collections.js` | 24 |
| `buildCloudRemoveSheetIconsCommand` | Function | `src/lib/commands/qscloud/remove-sheet-icons.js` | 25 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunInteractive → ParsePositiveInteger` | cross_community | 6 |
| `RunInteractive → DescribeBrowserVersionOption` | cross_community | 6 |
| `RunInteractive → BuildBrowserCacheDirOption` | cross_community | 6 |
| `HandleCloudCreateSheetThumbnails → Walk` | cross_community | 6 |
| `Content → ParsePositiveInteger` | cross_community | 6 |
| `RunInteractive → BuildCloudListCollectionsCommand` | cross_community | 5 |
| `RunInteractive → BuildCloudRemoveSheetIconsCommand` | cross_community | 5 |
| `Content → DescribeBrowserVersionOption` | cross_community | 5 |
| `Content → BuildBrowserCacheDirOption` | cross_community | 5 |
| `Content → BuildCloudListCollectionsCommand` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Browser | 3 calls |

## How to Explore

1. `context({name: "everyLeafCommand"})` — see callers and callees
2. `query({search_query: "qscloud"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
