---
name: util
description: "Skill for the Util area of butler-sheet-icons. 31 symbols across 10 files."
---

# Util

31 symbols | 10 files | Cohesion: 92%

## When to Use

- Working with code in `src/`
- Understanding how qscloudTestConnection, qscloudUploadToApp, getCertFilePaths work
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
| `src/lib/cloud/cloud-test-connection.js` | qscloudTestConnection |
| `src/lib/cloud/cloud-upload.js` | qscloudUploadToApp |
| `src/lib/util/cert.js` | getCertFilePaths |
| `src/lib/util/enigma-util.js` | getEnigmaSchema |

## Entry Points

Start here when exploring this area:

- **`qscloudTestConnection`** (Function) — `src/lib/cloud/cloud-test-connection.js:31`
- **`qscloudUploadToApp`** (Function) — `src/lib/cloud/cloud-upload.js:29`
- **`getCertFilePaths`** (Function) — `src/lib/util/cert.js:18`
- **`getEnigmaSchema`** (Function) — `src/lib/util/enigma-util.js:45`
- **`redactValue`** (Function) — `src/lib/util/redact-secrets.js:89`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `BsiError` | Class | `src/lib/util/errors.js` | 26 |
| `CertError` | Class | `src/lib/util/errors.js` | 43 |
| `EnigmaError` | Class | `src/lib/util/errors.js` | 59 |
| `CloudError` | Class | `src/lib/util/errors.js` | 75 |
| `qscloudTestConnection` | Function | `src/lib/cloud/cloud-test-connection.js` | 31 |
| `qscloudUploadToApp` | Function | `src/lib/cloud/cloud-upload.js` | 29 |
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
| Browser | 1 calls |

## How to Explore

1. `gitnexus_context({name: "qscloudTestConnection"})` — see callers and callees
2. `gitnexus_query({query: "util"})` — find related execution flows
3. Read key files listed above for implementation details
