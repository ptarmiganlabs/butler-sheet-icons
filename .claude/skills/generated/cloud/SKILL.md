---
name: cloud
description: "Skill for the Cloud area of butler-sheet-icons. 22 symbols across 16 files."
---

# Cloud

22 symbols | 16 files | Cohesion: 95%

## When to Use

- Working with code in `src/`
- Understanding how browserInstalled, browserUninstall, browserUninstallAll work
- Modifying cloud-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/cloud/cloud-repo-request.js` | bufferToStream, makeRequest, request |
| `src/globals.js` | setLoggingLevel, sleep |
| `src/lib/browser/browser-uninstall.js` | browserUninstall, browserUninstallAll |
| `src/lib/cloud/cloud-remove-sheet-icons.js` | removeSheetIconsCloudApp, qscloudRemoveSheetIcons |
| `src/lib/qseow/qseow-remove-sheet-icons.js` | removeSheetIconsQSEoWApp, qseowRemoveSheetIcons |
| `src/lib/browser/browser-installed.js` | browserInstalled |
| `src/lib/cloud/cloud-collections.js` | qscloudListCollections |
| `src/lib/cloud/cloud-create-thumbnails.js` | qscloudCreateThumbnails |
| `src/lib/cloud/cloud-upload.js` | qscloudUploadToApp |
| `src/lib/qseow/qseow-create-thumbnails.js` | qseowCreateThumbnails |

## Entry Points

Start here when exploring this area:

- **`browserInstalled`** (Function) — `src/lib/browser/browser-installed.js:19`
- **`browserUninstall`** (Function) — `src/lib/browser/browser-uninstall.js:19`
- **`browserUninstallAll`** (Function) — `src/lib/browser/browser-uninstall.js:85`
- **`qscloudListCollections`** (Function) — `src/lib/cloud/cloud-collections.js:19`
- **`qscloudCreateThumbnails`** (Function) — `src/lib/cloud/cloud-create-thumbnails.js:28`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `browserInstalled` | Function | `src/lib/browser/browser-installed.js` | 19 |
| `browserUninstall` | Function | `src/lib/browser/browser-uninstall.js` | 19 |
| `browserUninstallAll` | Function | `src/lib/browser/browser-uninstall.js` | 85 |
| `qscloudListCollections` | Function | `src/lib/cloud/cloud-collections.js` | 19 |
| `qscloudCreateThumbnails` | Function | `src/lib/cloud/cloud-create-thumbnails.js` | 28 |
| `qscloudRemoveSheetIcons` | Function | `src/lib/cloud/cloud-remove-sheet-icons.js` | 166 |
| `qscloudUploadToApp` | Function | `src/lib/cloud/cloud-upload.js` | 27 |
| `qseowCreateThumbnails` | Function | `src/lib/qseow/qseow-create-thumbnails.js` | 26 |
| `qseowRemoveSheetIcons` | Function | `src/lib/qseow/qseow-remove-sheet-icons.js` | 137 |
| `qseowUploadToContentLibrary` | Function | `src/lib/qseow/qseow-upload.js` | 29 |
| `deleteCloudAppThumbnail` | Function | `src/lib/cloud/cloud-delete-thumbnails.js` | 10 |
| `processCloudApp` | Function | `src/lib/cloud/process-cloud-app.js` | 29 |
| `takeSheetScreenshot` | Function | `src/lib/cloud/sheet-screenshot.js` | 17 |
| `qseowProcessApp` | Function | `src/lib/qseow/qseow-process-app.js` | 96 |
| `setLoggingLevel` | Function | `src/globals.js` | 180 |
| `removeSheetIconsCloudApp` | Function | `src/lib/cloud/cloud-remove-sheet-icons.js` | 21 |
| `removeSheetIconsQSEoWApp` | Function | `src/lib/qseow/qseow-remove-sheet-icons.js` | 19 |
| `sleep` | Function | `src/globals.js` | 190 |
| `bufferToStream` | Function | `src/lib/cloud/cloud-repo-request.js` | 40 |
| `makeRequest` | Function | `src/lib/cloud/cloud-repo-request.js` | 56 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `ProcessCloudApp → Sleep` | intra_community | 3 |
| `QlikSaas → BufferToStream` | intra_community | 3 |
| `QlikSaas → MakeRequest` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "browserInstalled"})` — see callers and callees
2. `gitnexus_query({query: "cloud"})` — find related execution flows
3. Read key files listed above for implementation details
