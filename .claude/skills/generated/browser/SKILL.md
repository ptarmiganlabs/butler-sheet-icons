---
name: browser
description: "Skill for the Browser area of butler-sheet-icons. 92 symbols across 40 files."
---

# Browser

92 symbols | 40 files | Cohesion: 70%

## When to Use

- Working with code in `src/`
- Understanding how browserListAvailable, browserUninstall, qscloudListCollections work
- Modifying browser-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/browser/browser-paths.js` | resolveBrowserCacheDir, unwritableCacheDirMessage, isPermissionDenied, nearestExistingAncestor, assertCacheDirWritable (+6) |
| `src/lib/browser/browser-version.js` | describeBrowserVersionOption, isVersionKeyword, isVersionLookupFailure, resolveLocalBrowserBuildId, assertBrowserIsSupported (+5) |
| `src/lib/browser/browser-launch.js` | resolveRequestedBuildId, resolveBrowserExecutablePath, detectDocker, buildBrowserArgs, logUnusableBrowser (+3) |
| `src/lib/browser/browser-list-available.js` | browserListAvailable, logVersionHistoryFailure, extractVersions, mapPlatformToChrome, fetchAvailableVersions |
| `src/lib/commands/browser/uninstall.interactive.js` | run, labelForBuild, precheck, choices |
| `src/lib/interactive/launch.js` | suppliedEntries, presetOptionsFrom, presetSourcesFrom, launchInteractive |
| `src/lib/util/image-dir.js` | createAppImageDir, logPermissionAdvice, isProbablyContainer |
| `src/lib/commands/helpers.js` | parsePositiveInteger, collectPositiveIntegers, buildBrowserCacheDirOption |
| `src/lib/browser/browser-uninstall.js` | browserUninstall, browserUninstallAll |
| `src/lib/commands/browser/install.js` | handleBrowserInstall, buildBrowserInstallCommand |

## Entry Points

Start here when exploring this area:

- **`browserListAvailable`** (Function) — `src/lib/browser/browser-list-available.js:190`
- **`browserUninstall`** (Function) — `src/lib/browser/browser-uninstall.js:27`
- **`qscloudListCollections`** (Function) — `src/lib/cloud/cloud-collections.js:21`
- **`qscloudCreateThumbnails`** (Function) — `src/lib/cloud/cloud-create-thumbnails.js:36`
- **`qscloudRemoveSheetIcons`** (Function) — `src/lib/cloud/cloud-remove-sheet-icons.js:166`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `browserListAvailable` | Function | `src/lib/browser/browser-list-available.js` | 190 |
| `browserUninstall` | Function | `src/lib/browser/browser-uninstall.js` | 27 |
| `qscloudListCollections` | Function | `src/lib/cloud/cloud-collections.js` | 21 |
| `qscloudCreateThumbnails` | Function | `src/lib/cloud/cloud-create-thumbnails.js` | 36 |
| `qscloudRemoveSheetIcons` | Function | `src/lib/cloud/cloud-remove-sheet-icons.js` | 166 |
| `qscloudTestConnection` | Function | `src/lib/cloud/cloud-test-connection.js` | 31 |
| `run` | Function | `src/lib/commands/browser/uninstall.interactive.js` | 155 |
| `probe` | Function | `src/lib/commands/qscloud/create-sheet-thumbnails.interactive.js` | 104 |
| `run` | Function | `src/lib/commands/qscloud/create-sheet-thumbnails.interactive.js` | 241 |
| `run` | Function | `src/lib/commands/qseow/create-sheet-thumbnails.interactive.js` | 273 |
| `runCommand` | Function | `src/lib/commands/run-command.js` | 26 |
| `presetOptionsFrom` | Function | `src/lib/interactive/launch.js` | 58 |
| `presetSourcesFrom` | Function | `src/lib/interactive/launch.js` | 75 |
| `launchInteractive` | Function | `src/lib/interactive/launch.js` | 91 |
| `qseowCreateThumbnails` | Function | `src/lib/qseow/qseow-create-thumbnails.js` | 31 |
| `qseowRemoveSheetIcons` | Function | `src/lib/qseow/qseow-remove-sheet-icons.js` | 135 |
| `toAppIdList` | Function | `src/lib/util/app-ids.js` | 23 |
| `redactOptions` | Function | `src/lib/util/redact-secrets.js` | 149 |
| `alreadyReported` | Function | `src/lib/util/reported-error.js` | 47 |
| `runOverApps` | Function | `src/lib/util/run-over-apps.js` | 36 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `QseowRemoveSheetIcons → SafeString` | cross_community | 7 |
| `QseowCreateThumbnails → SafeString` | cross_community | 7 |
| `QseowRemoveSheetIcons → SafeRead` | cross_community | 6 |
| `RunInteractive → ParsePositiveInteger` | cross_community | 6 |
| `RunInteractive → DescribeBrowserVersionOption` | cross_community | 6 |
| `RunInteractive → BuildBrowserCacheDirOption` | cross_community | 6 |
| `QscloudRemoveSheetIcons → SafeString` | cross_community | 6 |
| `HandleCloudCreateSheetThumbnails → SafeRead` | cross_community | 6 |
| `HandleCloudCreateSheetThumbnails → Walk` | cross_community | 6 |
| `Content → ParsePositiveInteger` | cross_community | 6 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Util | 18 calls |
| Qseow | 4 calls |
| Interactive | 4 calls |
| Cloud | 3 calls |

## How to Explore

1. `context({name: "browserListAvailable"})` — see callers and callees
2. `query({search_query: "browser"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
