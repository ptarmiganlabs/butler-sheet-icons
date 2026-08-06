---
name: cloud
description: "Skill for the Cloud area of butler-sheet-icons. 24 symbols across 18 files."
---

# Cloud

24 symbols | 18 files | Cohesion: 94%

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

- **`browserInstalled`** (Function) — `src/lib/browser/browser-installed.js:16`
- **`browserUninstall`** (Function) — `src/lib/browser/browser-uninstall.js:20`
- **`browserUninstallAll`** (Function) — `src/lib/browser/browser-uninstall.js:85`
- **`qscloudListCollections`** (Function) — `src/lib/cloud/cloud-collections.js:19`
- **`qscloudCreateThumbnails`** (Function) — `src/lib/cloud/cloud-create-thumbnails.js:29`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `QseowError` | Class | `src/lib/util/errors.js` | 91 |
| `browserInstalled` | Function | `src/lib/browser/browser-installed.js` | 16 |
| `browserUninstall` | Function | `src/lib/browser/browser-uninstall.js` | 20 |
| `browserUninstallAll` | Function | `src/lib/browser/browser-uninstall.js` | 85 |
| `qscloudListCollections` | Function | `src/lib/cloud/cloud-collections.js` | 19 |
| `qscloudCreateThumbnails` | Function | `src/lib/cloud/cloud-create-thumbnails.js` | 29 |
| `qscloudRemoveSheetIcons` | Function | `src/lib/cloud/cloud-remove-sheet-icons.js` | 159 |
| `qscloudUploadToApp` | Function | `src/lib/cloud/cloud-upload.js` | 25 |
| `qseowCreateThumbnails` | Function | `src/lib/qseow/qseow-create-thumbnails.js` | 28 |
| `qseowRemoveSheetIcons` | Function | `src/lib/qseow/qseow-remove-sheet-icons.js` | 133 |
| `qseowUploadToContentLibrary` | Function | `src/lib/qseow/qseow-upload.js` | 27 |
| `deleteCloudAppThumbnail` | Function | `src/lib/cloud/cloud-delete-thumbnails.js` | 10 |
| `processCloudApp` | Function | `src/lib/cloud/process-cloud-app.js` | 25 |
| `takeSheetScreenshot` | Function | `src/lib/cloud/sheet-screenshot.js` | 18 |
| `qseowProcessApp` | Function | `src/lib/qseow/qseow-process-app.js` | 94 |
| `qseowUpdateSheetThumbnails` | Function | `src/lib/qseow/qseow-updatesheets.js` | 19 |
| `setLoggingLevel` | Function | `src/globals.js` | 265 |
| `removeSheetIconsCloudApp` | Function | `src/lib/cloud/cloud-remove-sheet-icons.js` | 20 |
| `removeSheetIconsQSEoWApp` | Function | `src/lib/qseow/qseow-remove-sheet-icons.js` | 22 |
| `sleep` | Function | `src/globals.js` | 282 |

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
