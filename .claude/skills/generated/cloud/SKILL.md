---
name: cloud
description: "Skill for the Cloud area of butler-sheet-icons. 14 symbols across 10 files."
---

# Cloud

14 symbols | 10 files | Cohesion: 78%

## When to Use

- Working with code in `src/`
- Understanding how qscloudRemoveSheetIcons, qscloudUpdateSheetThumbnails, qseowRemoveSheetIcons work
- Modifying cloud-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/cloud/cloud-repo-request.js` | bufferToStream, makeRequest, request |
| `src/lib/cloud/cloud-remove-sheet-icons.js` | removeSheetIconsCloudApp, qscloudRemoveSheetIcons |
| `src/lib/qseow/qseow-remove-sheet-icons.js` | removeSheetIconsQSEoWApp, qseowRemoveSheetIcons |
| `src/lib/cloud/cloud-updatesheets.js` | qscloudUpdateSheetThumbnails |
| `src/lib/util/sheet-list.js` | assertAllProcessed |
| `src/globals.js` | sleep |
| `src/lib/cloud/cloud-delete-thumbnails.js` | deleteCloudAppThumbnail |
| `src/lib/cloud/process-cloud-app.js` | processCloudApp |
| `src/lib/cloud/sheet-screenshot.js` | takeSheetScreenshot |
| `src/lib/cloud/cloud-repo.js` | qlikSaas |

## Entry Points

Start here when exploring this area:

- **`qscloudRemoveSheetIcons`** (Function) — `src/lib/cloud/cloud-remove-sheet-icons.js:168`
- **`qscloudUpdateSheetThumbnails`** (Function) — `src/lib/cloud/cloud-updatesheets.js:36`
- **`qseowRemoveSheetIcons`** (Function) — `src/lib/qseow/qseow-remove-sheet-icons.js:138`
- **`assertAllProcessed`** (Function) — `src/lib/util/sheet-list.js:285`
- **`deleteCloudAppThumbnail`** (Function) — `src/lib/cloud/cloud-delete-thumbnails.js:10`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `qscloudRemoveSheetIcons` | Function | `src/lib/cloud/cloud-remove-sheet-icons.js` | 168 |
| `qscloudUpdateSheetThumbnails` | Function | `src/lib/cloud/cloud-updatesheets.js` | 36 |
| `qseowRemoveSheetIcons` | Function | `src/lib/qseow/qseow-remove-sheet-icons.js` | 138 |
| `assertAllProcessed` | Function | `src/lib/util/sheet-list.js` | 285 |
| `deleteCloudAppThumbnail` | Function | `src/lib/cloud/cloud-delete-thumbnails.js` | 10 |
| `processCloudApp` | Function | `src/lib/cloud/process-cloud-app.js` | 33 |
| `takeSheetScreenshot` | Function | `src/lib/cloud/sheet-screenshot.js` | 18 |
| `removeSheetIconsCloudApp` | Function | `src/lib/cloud/cloud-remove-sheet-icons.js` | 33 |
| `removeSheetIconsQSEoWApp` | Function | `src/lib/qseow/qseow-remove-sheet-icons.js` | 34 |
| `sleep` | Function | `src/globals.js` | 282 |
| `bufferToStream` | Function | `src/lib/cloud/cloud-repo-request.js` | 59 |
| `makeRequest` | Function | `src/lib/cloud/cloud-repo-request.js` | 75 |
| `request` | Function | `src/lib/cloud/cloud-repo-request.js` | 143 |
| `qlikSaas` | Function | `src/lib/cloud/cloud-repo.js` | 19 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ProcessCloudApp → Sleep` | intra_community | 3 |
| `QscloudRemoveSheetIcons → AssertAllProcessed` | intra_community | 3 |
| `QseowRemoveSheetIcons → AssertAllProcessed` | intra_community | 3 |
| `QlikSaas → BufferToStream` | intra_community | 3 |
| `QlikSaas → MakeRequest` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Browser | 2 calls |
| Util | 1 calls |

## How to Explore

1. `gitnexus_context({name: "qscloudRemoveSheetIcons"})` — see callers and callees
2. `gitnexus_query({query: "cloud"})` — find related execution flows
3. Read key files listed above for implementation details
