---
name: cloud
description: "Skill for the Cloud area of butler-sheet-icons. 17 symbols across 12 files."
---

# Cloud

17 symbols | 12 files | Cohesion: 79%

## When to Use

- Working with code in `src/`
- Understanding how browserInstall, deleteCloudAppThumbnail, processCloudApp work
- Modifying cloud-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/cloud/cloud-repo-request.js` | bufferToStream, makeRequest, request |
| `src/lib/util/socket-keepalive.js` | attachSocketKeepalive, stop |
| `src/lib/cloud/cloud-remove-sheet-icons.js` | removeSheetIconsCloudApp, qscloudRemoveSheetIcons |
| `src/lib/qseow/qseow-remove-sheet-icons.js` | removeSheetIconsQSEoWApp, qseowRemoveSheetIcons |
| `src/globals.js` | sleep |
| `src/lib/browser/browser-install.js` | browserInstall |
| `src/lib/cloud/cloud-delete-thumbnails.js` | deleteCloudAppThumbnail |
| `src/lib/cloud/process-cloud-app.js` | processCloudApp |
| `src/lib/cloud/sheet-screenshot.js` | takeSheetScreenshot |
| `src/lib/cloud/cloud-updatesheets.js` | qscloudUpdateSheetThumbnails |

## Entry Points

Start here when exploring this area:

- **`browserInstall`** (Function) — `src/lib/browser/browser-install.js:34`
- **`deleteCloudAppThumbnail`** (Function) — `src/lib/cloud/cloud-delete-thumbnails.js:10`
- **`processCloudApp`** (Function) — `src/lib/cloud/process-cloud-app.js:33`
- **`takeSheetScreenshot`** (Function) — `src/lib/cloud/sheet-screenshot.js:19`
- **`attachSocketKeepalive`** (Function) — `src/lib/util/socket-keepalive.js:38`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `browserInstall` | Function | `src/lib/browser/browser-install.js` | 34 |
| `deleteCloudAppThumbnail` | Function | `src/lib/cloud/cloud-delete-thumbnails.js` | 10 |
| `processCloudApp` | Function | `src/lib/cloud/process-cloud-app.js` | 33 |
| `takeSheetScreenshot` | Function | `src/lib/cloud/sheet-screenshot.js` | 19 |
| `attachSocketKeepalive` | Function | `src/lib/util/socket-keepalive.js` | 38 |
| `stop` | Function | `src/lib/util/socket-keepalive.js` | 48 |
| `qscloudRemoveSheetIcons` | Function | `src/lib/cloud/cloud-remove-sheet-icons.js` | 171 |
| `qscloudUpdateSheetThumbnails` | Function | `src/lib/cloud/cloud-updatesheets.js` | 36 |
| `qseowRemoveSheetIcons` | Function | `src/lib/qseow/qseow-remove-sheet-icons.js` | 140 |
| `assertAllProcessed` | Function | `src/lib/util/sheet-list.js` | 337 |
| `sleep` | Function | `src/globals.js` | 291 |
| `removeSheetIconsCloudApp` | Function | `src/lib/cloud/cloud-remove-sheet-icons.js` | 35 |
| `removeSheetIconsQSEoWApp` | Function | `src/lib/qseow/qseow-remove-sheet-icons.js` | 35 |
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
| Browser | 4 calls |
| Util | 1 calls |

## How to Explore

1. `gitnexus_context({name: "browserInstall"})` — see callers and callees
2. `gitnexus_query({query: "cloud"})` — find related execution flows
3. Read key files listed above for implementation details
