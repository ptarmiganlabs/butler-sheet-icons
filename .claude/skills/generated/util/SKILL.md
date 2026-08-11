---
name: util
description: 'Skill for the Util area of butler-sheet-icons. 47 symbols across 13 files.'
---

# Util

47 symbols | 13 files | Cohesion: 89%

## When to Use

- Working with code in `src/`
- Understanding how redactValue, redactOptions, redactSensitivePatterns work
- Modifying util-related functionality

## Key Files

| File                                     | Symbols                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/util/fatal-handlers.js`         | toError, logFatalLine, exitOnce, armWatchdog, handleFatal (+5)                              |
| `src/lib/util/crash-dump.js`             | envBool, parseMaxDumps, buildTimestampForFilename, sanitizeStackTrace, resolveCrashDir (+1) |
| `src/lib/util/log-error.js`              | logErrorWithLevel, logError, logWarn, logInfo, logVerbose (+1)                              |
| `src/lib/util/env-check.js`              | isMissing, present, toHex, formatSecret, checkEnv (+1)                                      |
| `src/lib/util/redact-secrets.js`         | isSecretKey, isProseWord, redactValue, redactOptions, redactSensitivePatterns               |
| `src/lib/util/errors.js`                 | BsiError, EnigmaError, CloudError                                                           |
| `src/lib/util/sheet-list.js`             | isSessionLevelFailure, describeCloseEvent, runOverSheets                                    |
| `src/globals.js`                         | sanitizeLogValue, sanitizeFormat                                                            |
| `src/lib/util/error-categorizer.js`      | getErrorCategory, getErrorMetadata                                                          |
| `src/lib/cloud/cloud-test-connection.js` | qscloudTestConnection                                                                       |

## Entry Points

Start here when exploring this area:

- **`redactValue`** (Function) — `src/lib/util/redact-secrets.js:112`
- **`redactOptions`** (Function) — `src/lib/util/redact-secrets.js:149`
- **`redactSensitivePatterns`** (Function) — `src/lib/util/redact-secrets.js:160`
- **`onUncaughtException`** (Function) — `src/lib/util/fatal-handlers.js:277`
- **`onUnhandledRejection`** (Function) — `src/lib/util/fatal-handlers.js:291`

## Key Symbols

| Symbol                    | Type     | File                                     | Line |
| ------------------------- | -------- | ---------------------------------------- | ---- |
| `BsiError`                | Class    | `src/lib/util/errors.js`                 | 26   |
| `EnigmaError`             | Class    | `src/lib/util/errors.js`                 | 59   |
| `CloudError`              | Class    | `src/lib/util/errors.js`                 | 75   |
| `redactValue`             | Function | `src/lib/util/redact-secrets.js`         | 112  |
| `redactOptions`           | Function | `src/lib/util/redact-secrets.js`         | 149  |
| `redactSensitivePatterns` | Function | `src/lib/util/redact-secrets.js`         | 160  |
| `onUncaughtException`     | Function | `src/lib/util/fatal-handlers.js`         | 277  |
| `onUnhandledRejection`    | Function | `src/lib/util/fatal-handlers.js`         | 291  |
| `qscloudTestConnection`   | Function | `src/lib/cloud/cloud-test-connection.js` | 31   |
| `qscloudUploadToApp`      | Function | `src/lib/cloud/cloud-upload.js`          | 29   |
| `getEnigmaSchema`         | Function | `src/lib/util/enigma-util.js`            | 45   |
| `writeCrashDump`          | Function | `src/lib/util/crash-dump.js`             | 203  |
| `logError`                | Function | `src/lib/util/log-error.js`              | 77   |
| `logWarn`                 | Function | `src/lib/util/log-error.js`              | 88   |
| `logInfo`                 | Function | `src/lib/util/log-error.js`              | 99   |
| `logVerbose`              | Function | `src/lib/util/log-error.js`              | 110  |
| `logDebug`                | Function | `src/lib/util/log-error.js`              | 121  |
| `getErrorCategory`        | Function | `src/lib/util/error-categorizer.js`      | 32   |
| `getErrorMetadata`        | Function | `src/lib/util/error-categorizer.js`      | 81   |
| `isSessionLevelFailure`   | Function | `src/lib/util/sheet-list.js`             | 190  |

## Execution Flows

| Flow                                       | Type            | Steps |
| ------------------------------------------ | --------------- | ----- |
| `OnUncaughtException → IsProseWord`        | cross_community | 5     |
| `OnUnhandledRejection → IsProseWord`       | cross_community | 5     |
| `BrowserListAvailable → GetErrorCategory`  | cross_community | 4     |
| `BrowserListAvailable → MarkReported`      | cross_community | 4     |
| `OnUncaughtException → ExitOnce`           | intra_community | 4     |
| `OnUncaughtException → EnvBool`            | cross_community | 4     |
| `OnUncaughtException → ParseMaxDumps`      | cross_community | 4     |
| `OnUncaughtException → SanitizeStackTrace` | cross_community | 4     |
| `OnUnhandledRejection → ExitOnce`          | intra_community | 4     |
| `OnUnhandledRejection → EnvBool`           | cross_community | 4     |

## Connected Areas

| Area    | Connections |
| ------- | ----------- |
| Browser | 2 calls     |

## How to Explore

1. `gitnexus_context({name: "redactValue"})` — see callers and callees
2. `gitnexus_query({query: "util"})` — find related execution flows
3. Read key files listed above for implementation details
