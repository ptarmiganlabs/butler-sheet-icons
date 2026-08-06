---
name: util
description: "Skill for the Util area of butler-sheet-icons. 34 symbols across 12 files."
---

# Util

34 symbols | 12 files | Cohesion: 91%

## When to Use

- Working with code in `src/`
- Understanding how qscloudUpdateSheetThumbnails, getCertFilePaths, getEnigmaSchema work
- Modifying util-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/util/log-error.js` | logErrorWithLevel, logError, logWarn, logInfo, logVerbose (+1) |
| `src/lib/util/env-check.js` | isMissing, present, toHex, formatSecret, checkEnv (+1) |
| `src/lib/util/crash-dump.js` | envBool, buildTimestampForFilename, sanitizeStackTrace, resolveCrashDir, writeCrashDump |
| `src/lib/util/errors.js` | BsiError, CertError, EnigmaError, CloudError |
| `src/lib/util/redact-secrets.js` | isSecretKey, redactValue, redactOptions, redactSensitivePatterns |
| `src/globals.js` | sanitizeLogValue, sanitizeFormat |
| `src/lib/util/error-categorizer.js` | getErrorCategory, getErrorMetadata |
| `src/lib/cloud/cloud-updatesheets.js` | qscloudUpdateSheetThumbnails |
| `src/lib/util/cert.js` | getCertFilePaths |
| `src/lib/util/enigma-util.js` | getEnigmaSchema |

## Entry Points

Start here when exploring this area:

- **`qscloudUpdateSheetThumbnails`** (Function) — `src/lib/cloud/cloud-updatesheets.js:24`
- **`getCertFilePaths`** (Function) — `src/lib/util/cert.js:18`
- **`getEnigmaSchema`** (Function) — `src/lib/util/enigma-util.js:45`
- **`redactValue`** (Function) — `src/lib/util/redact-secrets.js:89`
- **`redactOptions`** (Function) — `src/lib/util/redact-secrets.js:126`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `BsiError` | Class | `src/lib/util/errors.js` | 26 |
| `CertError` | Class | `src/lib/util/errors.js` | 43 |
| `EnigmaError` | Class | `src/lib/util/errors.js` | 59 |
| `CloudError` | Class | `src/lib/util/errors.js` | 75 |
| `qscloudUpdateSheetThumbnails` | Function | `src/lib/cloud/cloud-updatesheets.js` | 24 |
| `getCertFilePaths` | Function | `src/lib/util/cert.js` | 18 |
| `getEnigmaSchema` | Function | `src/lib/util/enigma-util.js` | 45 |
| `redactValue` | Function | `src/lib/util/redact-secrets.js` | 89 |
| `redactOptions` | Function | `src/lib/util/redact-secrets.js` | 126 |
| `redactSensitivePatterns` | Function | `src/lib/util/redact-secrets.js` | 137 |
| `logError` | Function | `src/lib/util/log-error.js` | 77 |
| `logWarn` | Function | `src/lib/util/log-error.js` | 88 |
| `logInfo` | Function | `src/lib/util/log-error.js` | 99 |
| `logVerbose` | Function | `src/lib/util/log-error.js` | 110 |
| `logDebug` | Function | `src/lib/util/log-error.js` | 121 |
| `writeCrashDump` | Function | `src/lib/util/crash-dump.js` | 161 |
| `getErrorCategory` | Function | `src/lib/util/error-categorizer.js` | 32 |
| `getErrorMetadata` | Function | `src/lib/util/error-categorizer.js` | 81 |
| `markReported` | Function | `src/lib/util/reported-error.js` | 32 |
| `present` | Function | `src/lib/util/env-check.js` | 167 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `BrowserInstall → GetErrorCategory` | cross_community | 4 |
| `BrowserInstall → MarkReported` | cross_community | 4 |
| `SanitizeFormat → IsSecretKey` | intra_community | 4 |
| `BrowserListAvailable → GetErrorCategory` | cross_community | 3 |
| `BrowserListAvailable → MarkReported` | cross_community | 3 |
| `RedactOptions → IsSecretKey` | intra_community | 3 |
| `SanitizeFormat → RedactSensitivePatterns` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "qscloudUpdateSheetThumbnails"})` — see callers and callees
2. `gitnexus_query({query: "util"})` — find related execution flows
3. Read key files listed above for implementation details
