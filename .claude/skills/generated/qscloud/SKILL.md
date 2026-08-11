---
name: qscloud
description: 'Skill for the Qscloud area of butler-sheet-icons. 9 symbols across 7 files.'
---

# Qscloud

9 symbols | 7 files | Cohesion: 81%

## When to Use

- Working with code in `src/`
- Understanding how everyLeafCommand, walk work
- Modifying qscloud-related functionality

## Key Files

| File                                                  | Symbols                                       |
| ----------------------------------------------------- | --------------------------------------------- |
| `src/lib/commands/helpers.js`                         | parsePositiveInteger, collectPositiveIntegers |
| `src/lib/interactive/command-tree.js`                 | everyLeafCommand, walk                        |
| `src/lib/commands/qscloud/create-sheet-thumbnails.js` | buildCloudCreateSheetThumbnailsCommand        |
| `src/lib/commands/qscloud/index.js`                   | buildQscloudCommand                           |
| `src/lib/commands/qscloud/list-collections.js`        | buildCloudListCollectionsCommand              |
| `src/lib/commands/qscloud/remove-sheet-icons.js`      | buildCloudRemoveSheetIconsCommand             |
| `src/lib/commands/qseow/index.js`                     | buildQseowCommand                             |

## Entry Points

Start here when exploring this area:

- **`everyLeafCommand`** (Function) — `src/lib/interactive/command-tree.js:26`
- **`walk`** (Function) — `src/lib/interactive/command-tree.js:29`

## Key Symbols

| Symbol                                   | Type     | File                                                  | Line |
| ---------------------------------------- | -------- | ----------------------------------------------------- | ---- |
| `everyLeafCommand`                       | Function | `src/lib/interactive/command-tree.js`                 | 26   |
| `walk`                                   | Function | `src/lib/interactive/command-tree.js`                 | 29   |
| `parsePositiveInteger`                   | Function | `src/lib/commands/helpers.js`                         | 16   |
| `collectPositiveIntegers`                | Function | `src/lib/commands/helpers.js`                         | 78   |
| `buildCloudCreateSheetThumbnailsCommand` | Function | `src/lib/commands/qscloud/create-sheet-thumbnails.js` | 32   |
| `buildQscloudCommand`                    | Function | `src/lib/commands/qscloud/index.js`                   | 10   |
| `buildCloudListCollectionsCommand`       | Function | `src/lib/commands/qscloud/list-collections.js`        | 24   |
| `buildCloudRemoveSheetIconsCommand`      | Function | `src/lib/commands/qscloud/remove-sheet-icons.js`      | 24   |
| `buildQseowCommand`                      | Function | `src/lib/commands/qseow/index.js`                     | 32   |

## Execution Flows

| Flow                                      | Type            | Steps |
| ----------------------------------------- | --------------- | ----- |
| `EveryLeafCommand → ParsePositiveInteger` | intra_community | 5     |
| `EveryLeafCommand → Description`          | cross_community | 4     |

## Connected Areas

| Area    | Connections |
| ------- | ----------- |
| Browser | 5 calls     |

## How to Explore

1. `gitnexus_context({name: "everyLeafCommand"})` — see callers and callees
2. `gitnexus_query({query: "qscloud"})` — find related execution flows
3. Read key files listed above for implementation details
