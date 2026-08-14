---
name: util
description: "Skill for the Util area of butler-sheet-icons. 71 symbols across 27 files."
---

# Util

71 symbols | 27 files | Cohesion: 85%

## When to Use

- Working with code in `src/`
- Understanding how closeBrowserQuietly, deleteCloudAppThumbnail, setupEnigmaConnection work
- Modifying util-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/util/fatal-handlers.js` | toError, isBrokenPipeError, logFatalLine, exitOnce, armWatchdog (+9) |
| `src/lib/util/env-check.js` | isMissing, describePlain, toHex, formatSecret, checkEnv (+2) |
| `src/lib/util/log-error.js` | logError, safeString, safeRead, describeValue, describeError (+1) |
| `src/lib/util/sheet-list.js` | getSheetList, sortSheetsByRank, describeCloseEvent, runOverSheets, saveIfChanged (+1) |
| `src/lib/util/crash-dump.js` | envBool, parseMaxDumps, buildTimestampForFilename, sanitizeStackTrace, resolveCrashDir (+1) |
| `src/lib/util/errors.js` | BsiError, CertError, EnigmaError, CloudError |
| `src/lib/util/redact-secrets.js` | isSecretKey, isProseWord, redactValue, redactSensitivePatterns |
| `src/globals.js` | sleep, sanitizeLogValue, sanitizeFormat |
| `src/lib/qseow/qseow-certificates.js` | exists, qseowVerifyCertificatesExist |
| `src/lib/util/error-categorizer.js` | getErrorCategory, getErrorMetadata |

## Entry Points

Start here when exploring this area:

- **`closeBrowserQuietly`** (Function) — `src/lib/browser/browser-launch.js:481`
- **`deleteCloudAppThumbnail`** (Function) — `src/lib/cloud/cloud-delete-thumbnails.js:10`
- **`setupEnigmaConnection`** (Function) — `src/lib/cloud/cloud-enigma.js:19`
- **`qscloudUpdateSheetThumbnails`** (Function) — `src/lib/cloud/cloud-updatesheets.js:37`
- **`qscloudUploadToApp`** (Function) — `src/lib/cloud/cloud-upload.js:30`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `BsiError` | Class | `src/lib/util/errors.js` | 26 |
| `CertError` | Class | `src/lib/util/errors.js` | 43 |
| `EnigmaError` | Class | `src/lib/util/errors.js` | 59 |
| `CloudError` | Class | `src/lib/util/errors.js` | 75 |
| `closeBrowserQuietly` | Function | `src/lib/browser/browser-launch.js` | 481 |
| `deleteCloudAppThumbnail` | Function | `src/lib/cloud/cloud-delete-thumbnails.js` | 10 |
| `setupEnigmaConnection` | Function | `src/lib/cloud/cloud-enigma.js` | 19 |
| `qscloudUpdateSheetThumbnails` | Function | `src/lib/cloud/cloud-updatesheets.js` | 37 |
| `qscloudUploadToApp` | Function | `src/lib/cloud/cloud-upload.js` | 30 |
| `determineSheetExcludeStatus` | Function | `src/lib/cloud/determine-sheet-exclude-status.js` | 27 |
| `processCloudApp` | Function | `src/lib/cloud/process-cloud-app.js` | 34 |
| `takeSheetScreenshot` | Function | `src/lib/cloud/sheet-screenshot.js` | 19 |
| `probe` | Function | `src/lib/commands/qseow/create-sheet-thumbnails.interactive.js` | 131 |
| `qseowVerifyCertificatesExist` | Function | `src/lib/qseow/qseow-certificates.js` | 50 |
| `setupEnigmaConnection` | Function | `src/lib/qseow/qseow-enigma.js` | 38 |
| `qseowUpdateSheetThumbnails` | Function | `src/lib/qseow/qseow-updatesheets.js` | 34 |
| `getCertFilePaths` | Function | `src/lib/util/cert.js` | 18 |
| `withEngineSession` | Function | `src/lib/util/engine-session.js` | 56 |
| `getEnigmaSchema` | Function | `src/lib/util/enigma-util.js` | 45 |
| `logError` | Function | `src/lib/util/log-error.js` | 160 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `QseowRemoveSheetIcons → SafeString` | cross_community | 7 |
| `QseowCreateThumbnails → SafeString` | cross_community | 7 |
| `Probe → SafeString` | cross_community | 7 |
| `ProcessCloudApp → SafeString` | cross_community | 6 |
| `QseowRemoveSheetIcons → SafeRead` | cross_community | 6 |
| `QscloudRemoveSheetIcons → SafeString` | cross_community | 6 |
| `HandleCloudCreateSheetThumbnails → SafeRead` | cross_community | 6 |
| `QseowCreateThumbnails → SafeRead` | cross_community | 6 |
| `QscloudCreateThumbnails → SafeString` | cross_community | 6 |
| `QscloudListCollections → SafeString` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Qseow | 4 calls |
| Browser | 4 calls |

## How to Explore

1. `context({name: "closeBrowserQuietly"})` — see callers and callees
2. `query({search_query: "util"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
