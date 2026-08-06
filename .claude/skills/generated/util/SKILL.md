---
name: util
description: "Skill for the Util area of butler-sheet-icons. 30 symbols across 9 files."
---

# Util

30 symbols | 9 files | Cohesion: 95%

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
| `present` | Function | `src/lib/util/env-check.js` | 167 |
| `formatSecret` | Function | `src/lib/util/env-check.js` | 106 |
| `checkEnv` | Function | `src/lib/util/env-check.js` | 129 |
| `render` | Function | `src/lib/util/env-check.js` | 150 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `SanitizeFormat → IsSecretKey` | intra_community | 4 |
| `RedactOptions → IsSecretKey` | intra_community | 3 |
| `SanitizeFormat → RedactSensitivePatterns` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "qscloudUpdateSheetThumbnails"})` — see callers and callees
2. `gitnexus_query({query: "util"})` — find related execution flows
3. Read key files listed above for implementation details
