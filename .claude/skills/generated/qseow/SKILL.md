---
name: qseow
description: "Skill for the Qseow area of butler-sheet-icons. 28 symbols across 17 files."
---

# Qseow

28 symbols | 17 files | Cohesion: 76%

## When to Use

- Working with code in `src/`
- Understanding how resolve, listApps, determineSheetExcludeStatus work
- Modifying qseow-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/qseow/qrs-filter.js` | qrsFilterValue, toFilterValueList, qrsFilterAnyOf, qrsPathWithFilter |
| `src/lib/qseow/qseow-logout.js` | qpsUserPath, logoutViaApi, logoutViaHub, qseowLogout |
| `src/lib/commands/qseow/create-sheet-thumbnails.interactive.js` | resolve, listApps |
| `src/lib/qseow/qseow-app-lookup.js` | listAppsByTag, listAllApps |
| `src/lib/qseow/qseow-process-app.js` | getSheetsTaggedWith, qseowProcessApp |
| `src/lib/qseow/qseow-enigma.js` | readCert, createSocket |
| `src/lib/util/socket-keepalive.js` | attachSocketKeepalive, stop |
| `src/lib/qseow/determine-sheet-exclude-status.js` | determineSheetExcludeStatus |
| `src/lib/qseow/qrs-response.js` | qrsGetList |
| `src/lib/qseow/qseow-contentlibrary.js` | qseowVerifyContentLibraryExists |

## Entry Points

Start here when exploring this area:

- **`resolve`** (Function) — `src/lib/commands/qseow/create-sheet-thumbnails.interactive.js:176`
- **`listApps`** (Function) — `src/lib/commands/qseow/create-sheet-thumbnails.interactive.js:188`
- **`determineSheetExcludeStatus`** (Function) — `src/lib/qseow/determine-sheet-exclude-status.js:16`
- **`qrsFilterValue`** (Function) — `src/lib/qseow/qrs-filter.js:35`
- **`toFilterValueList`** (Function) — `src/lib/qseow/qrs-filter.js:49`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `QseowError` | Class | `src/lib/util/errors.js` | 91 |
| `resolve` | Function | `src/lib/commands/qseow/create-sheet-thumbnails.interactive.js` | 176 |
| `listApps` | Function | `src/lib/commands/qseow/create-sheet-thumbnails.interactive.js` | 188 |
| `determineSheetExcludeStatus` | Function | `src/lib/qseow/determine-sheet-exclude-status.js` | 16 |
| `qrsFilterValue` | Function | `src/lib/qseow/qrs-filter.js` | 35 |
| `toFilterValueList` | Function | `src/lib/qseow/qrs-filter.js` | 49 |
| `qrsFilterAnyOf` | Function | `src/lib/qseow/qrs-filter.js` | 78 |
| `qrsPathWithFilter` | Function | `src/lib/qseow/qrs-filter.js` | 102 |
| `qrsGetList` | Function | `src/lib/qseow/qrs-response.js` | 28 |
| `listAppsByTag` | Function | `src/lib/qseow/qseow-app-lookup.js` | 48 |
| `listAllApps` | Function | `src/lib/qseow/qseow-app-lookup.js` | 90 |
| `qseowVerifyContentLibraryExists` | Function | `src/lib/qseow/qseow-contentlibrary.js` | 18 |
| `qseowProcessApp` | Function | `src/lib/qseow/qseow-process-app.js` | 117 |
| `setupQseowQrsConnection` | Function | `src/lib/qseow/qseow-qrs.js` | 16 |
| `getQseowHubSelectors` | Function | `src/lib/qseow/qseow-selectors.js` | 105 |
| `qseowUploadToContentLibrary` | Function | `src/lib/qseow/qseow-upload.js` | 33 |
| `isSheetTagged` | Function | `src/lib/util/sheet-list.js` | 137 |
| `createSocket` | Function | `src/lib/cloud/cloud-enigma.js` | 44 |
| `createSocket` | Function | `src/lib/qseow/qseow-enigma.js` | 77 |
| `attachSocketKeepalive` | Function | `src/lib/util/socket-keepalive.js` | 38 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `QseowUploadToContentLibrary → SafeString` | cross_community | 6 |
| `QseowUploadToContentLibrary → SafeRead` | cross_community | 5 |
| `QseowProcessApp → IsProbablyContainer` | cross_community | 4 |
| `HandleQseowCreateSheetThumbnails → SetupQseowQrsConnection` | cross_community | 4 |
| `HandleQseowCreateSheetThumbnails → QrsPathWithFilter` | cross_community | 4 |
| `QseowCreateThumbnails → QrsFilterValue` | cross_community | 4 |
| `QseowCreateThumbnails → QseowError` | cross_community | 4 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Util | 11 calls |
| Browser | 3 calls |

## How to Explore

1. `context({name: "resolve"})` — see callers and callees
2. `query({search_query: "qseow"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
