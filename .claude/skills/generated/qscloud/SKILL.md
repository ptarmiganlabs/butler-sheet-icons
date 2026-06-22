---
name: qscloud
description: "Skill for the Qscloud area of butler-sheet-icons. 6 symbols across 6 files."
---

# Qscloud

6 symbols | 6 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how parsePositiveInteger, buildCloudCreateSheetThumbnailsCommand, buildQscloudCommand work
- Modifying qscloud-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/commands/helpers.js` | parsePositiveInteger |
| `src/lib/commands/qscloud/create-sheet-thumbnails.js` | buildCloudCreateSheetThumbnailsCommand |
| `src/lib/commands/qscloud/index.js` | buildQscloudCommand |
| `src/lib/commands/qscloud/list-collections.js` | buildCloudListCollectionsCommand |
| `src/lib/commands/qscloud/remove-sheet-icons.js` | buildCloudRemoveSheetIconsCommand |
| `src/lib/commands/qseow/index.js` | buildQseowCommand |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `parsePositiveInteger` | Function | `src/lib/commands/helpers.js` | 16 |
| `buildCloudCreateSheetThumbnailsCommand` | Function | `src/lib/commands/qscloud/create-sheet-thumbnails.js` | 45 |
| `buildQscloudCommand` | Function | `src/lib/commands/qscloud/index.js` | 10 |
| `buildCloudListCollectionsCommand` | Function | `src/lib/commands/qscloud/list-collections.js` | 35 |
| `buildCloudRemoveSheetIconsCommand` | Function | `src/lib/commands/qscloud/remove-sheet-icons.js` | 34 |
| `buildQseowCommand` | Function | `src/lib/commands/qseow/index.js` | 46 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `BuildQscloudCommand → ParsePositiveInteger` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "parsePositiveInteger"})` — see callers and callees
2. `gitnexus_query({query: "qscloud"})` — find related execution flows
3. Read key files listed above for implementation details
