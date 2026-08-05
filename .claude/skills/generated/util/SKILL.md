---
name: util
description: "Skill for the Util area of butler-sheet-icons. 33 symbols across 11 files."
---

# Util

33 symbols | 11 files | Cohesion: 94%

## When to Use

- Working with code in `src/`
- Understanding how qseowProcessApp, qseowUpdateSheetThumbnails, getCertFilePaths work
- Modifying util-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/util/log-error.js` | logErrorWithLevel, logError, logWarn, logInfo, logVerbose (+1) |
| `src/lib/util/env-check.js` | isMissing, present, toHex, formatSecret, checkEnv (+1) |
| `src/lib/util/crash-dump.js` | envBool, buildTimestampForFilename, sanitizeStackTrace, resolveCrashDir, writeCrashDump |
| `src/lib/util/errors.js` | BsiError, CertError, EnigmaError, QseowError |
| `src/lib/util/redact-secrets.js` | isSecretKey, redactValue, redactOptions, redactSensitivePatterns |
| `src/globals.js` | sanitizeLogValue, sanitizeFormat |
| `src/lib/util/error-categorizer.js` | getErrorCategory, getErrorMetadata |
| `src/lib/qseow/qseow-process-app.js` | qseowProcessApp |
| `src/lib/qseow/qseow-updatesheets.js` | qseowUpdateSheetThumbnails |
| `src/lib/util/cert.js` | getCertFilePaths |

## Entry Points

Start here when exploring this area:

- **`qseowProcessApp`** (Function) — `src/lib/qseow/qseow-process-app.js:100`
- **`qseowUpdateSheetThumbnails`** (Function) — `src/lib/qseow/qseow-updatesheets.js:16`
- **`getCertFilePaths`** (Function) — `src/lib/util/cert.js:18`
- **`getEnigmaSchema`** (Function) — `src/lib/util/enigma-util.js:45`
- **`redactValue`** (Function) — `src/lib/util/redact-secrets.js:89`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `BsiError` | Class | `src/lib/util/errors.js` | 26 |
| `CertError` | Class | `src/lib/util/errors.js` | 43 |
| `EnigmaError` | Class | `src/lib/util/errors.js` | 59 |
| `QseowError` | Class | `src/lib/util/errors.js` | 91 |
| `qseowProcessApp` | Function | `src/lib/qseow/qseow-process-app.js` | 100 |
| `qseowUpdateSheetThumbnails` | Function | `src/lib/qseow/qseow-updatesheets.js` | 16 |
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
| `present` | Function | `src/lib/util/env-check.js` | 167 |
| `formatSecret` | Function | `src/lib/util/env-check.js` | 106 |
| `checkEnv` | Function | `src/lib/util/env-check.js` | 129 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `SanitizeFormat → IsSecretKey` | intra_community | 4 |
| `RedactOptions → IsSecretKey` | intra_community | 3 |
| `SanitizeFormat → RedactSensitivePatterns` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cloud | 1 calls |

## How to Explore

1. `gitnexus_context({name: "qseowProcessApp"})` — see callers and callees
2. `gitnexus_query({query: "util"})` — find related execution flows
3. Read key files listed above for implementation details
