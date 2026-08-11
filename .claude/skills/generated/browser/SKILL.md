---
name: browser
description: 'Skill for the Browser area of butler-sheet-icons. 43 symbols across 23 files.'
---

# Browser

43 symbols | 23 files | Cohesion: 84%

## When to Use

- Working with code in `src/`
- Understanding how launchBrowserForApp, resolveBrowserVersion, assertInteractiveCapable work
- Modifying browser-related functionality

## Key Files

| File                                        | Symbols                                                                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/browser/browser-launch.js`         | logUnusableBrowser, watchForUnexpectedDisconnect, launchBrowserForApp, detectDocker, buildBrowserArgs (+2)                    |
| `src/lib/browser/browser-version.js`        | normalizeVersionKeyword, assertExplicitVersionIsWellFormed, markLookupFailure, logVersionLookupFailure, resolveBrowserVersion |
| `src/lib/browser/browser-list-available.js` | extractVersions, mapPlatformToChrome, fetchAvailableVersions, browserListAvailable, getMostRecentUsableChromeBuildId          |
| `src/lib/util/image-dir.js`                 | createAppImageDir, logPermissionAdvice, isProbablyContainer                                                                   |
| `src/lib/util/reported-error.js`            | markReported, alreadyReported                                                                                                 |
| `src/globals.js`                            | getLoggingLevel, setLoggingLevel                                                                                              |
| `src/lib/browser/browser-uninstall.js`      | browserUninstall, browserUninstallAll                                                                                         |
| `src/lib/browser/browser-detect.js`         | sortNewestFirst, detectAvailableBrowser                                                                                       |
| `src/lib/interactive/tty.js`                | assertInteractiveCapable                                                                                                      |
| `src/lib/browser/browser-installed.js`      | browserInstalled                                                                                                              |

## Entry Points

Start here when exploring this area:

- **`launchBrowserForApp`** (Function) — `src/lib/browser/browser-launch.js:287`
- **`resolveBrowserVersion`** (Function) — `src/lib/browser/browser-version.js:354`
- **`assertInteractiveCapable`** (Function) — `src/lib/interactive/tty.js:121`
- **`createAppImageDir`** (Function) — `src/lib/util/image-dir.js:32`
- **`markReported`** (Function) — `src/lib/util/reported-error.js:32`

## Key Symbols

| Symbol                             | Type     | File                                              | Line |
| ---------------------------------- | -------- | ------------------------------------------------- | ---- |
| `launchBrowserForApp`              | Function | `src/lib/browser/browser-launch.js`               | 287  |
| `resolveBrowserVersion`            | Function | `src/lib/browser/browser-version.js`              | 354  |
| `assertInteractiveCapable`         | Function | `src/lib/interactive/tty.js`                      | 121  |
| `createAppImageDir`                | Function | `src/lib/util/image-dir.js`                       | 32   |
| `markReported`                     | Function | `src/lib/util/reported-error.js`                  | 32   |
| `browserInstalled`                 | Function | `src/lib/browser/browser-installed.js`            | 17   |
| `browserUninstall`                 | Function | `src/lib/browser/browser-uninstall.js`            | 24   |
| `browserUninstallAll`              | Function | `src/lib/browser/browser-uninstall.js`            | 138  |
| `qscloudListCollections`           | Function | `src/lib/cloud/cloud-collections.js`              | 19   |
| `qscloudCreateThumbnails`          | Function | `src/lib/cloud/cloud-create-thumbnails.js`        | 33   |
| `withQuietLogging`                 | Function | `src/lib/interactive/quiet.js`                    | 27   |
| `qseowCreateThumbnails`            | Function | `src/lib/qseow/qseow-create-thumbnails.js`        | 28   |
| `buildInteractiveCommand`          | Function | `src/lib/interactive/interactive-command.js`      | 112  |
| `description`                      | Function | `src/lib/interactive/theme.js`                    | 54   |
| `fetchAvailableVersions`           | Function | `src/lib/browser/browser-list-available.js`       | 146  |
| `browserListAvailable`             | Function | `src/lib/browser/browser-list-available.js`       | 197  |
| `getMostRecentUsableChromeBuildId` | Function | `src/lib/browser/browser-list-available.js`       | 335  |
| `choices`                          | Function | `src/lib/commands/browser/install.interactive.js` | 51   |
| `alreadyReported`                  | Function | `src/lib/util/reported-error.js`                  | 47   |
| `detectAvailableBrowser`           | Function | `src/lib/browser/browser-detect.js`               | 61   |

## Execution Flows

| Flow                                                  | Type            | Steps |
| ----------------------------------------------------- | --------------- | ----- |
| `EveryLeafCommand → Description`                      | cross_community | 4     |
| `BrowserListAvailable → GetErrorCategory`             | cross_community | 4     |
| `BrowserListAvailable → MarkReported`                 | cross_community | 4     |
| `Choices → GetErrorCategory`                          | cross_community | 4     |
| `Choices → MarkReported`                              | cross_community | 4     |
| `GetMostRecentUsableChromeBuildId → GetErrorCategory` | cross_community | 4     |
| `GetMostRecentUsableChromeBuildId → MarkReported`     | cross_community | 4     |
| `ResolveBrowserVersion → MarkReported`                | intra_community | 3     |
| `ResolveBrowserVersion → GetErrorCategory`            | cross_community | 3     |
| `LaunchBrowserForApp → LogUnusableBrowser`            | intra_community | 3     |

## Connected Areas

| Area | Connections |
| ---- | ----------- |
| Util | 2 calls     |

## How to Explore

1. `gitnexus_context({name: "launchBrowserForApp"})` — see callers and callees
2. `gitnexus_query({query: "browser"})` — find related execution flows
3. Read key files listed above for implementation details
