---
name: browser
description: "Skill for the Browser area of butler-sheet-icons. 41 symbols across 21 files."
---

# Browser

41 symbols | 21 files | Cohesion: 86%

## When to Use

- Working with code in `src/`
- Understanding how launchBrowserForApp, resolveBrowserVersion, createAppImageDir work
- Modifying browser-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/browser/browser-launch.js` | logUnusableBrowser, watchForUnexpectedDisconnect, launchBrowserForApp, detectDocker, buildBrowserArgs (+2) |
| `src/lib/browser/browser-version.js` | normalizeVersionKeyword, assertExplicitVersionIsWellFormed, markLookupFailure, logVersionLookupFailure, resolveBrowserVersion |
| `src/lib/browser/browser-list-available.js` | logVersionHistoryFailure, extractVersions, mapPlatformToChrome, browserListAvailable, getMostRecentUsableChromeBuildId |
| `src/lib/util/image-dir.js` | createAppImageDir, logPermissionAdvice, isProbablyContainer |
| `src/lib/util/reported-error.js` | markReported, alreadyReported |
| `src/lib/util/error-categorizer.js` | getErrorCategory, getErrorMetadata |
| `src/lib/browser/browser-uninstall.js` | browserUninstall, browserUninstallAll |
| `src/lib/browser/browser-detect.js` | sortNewestFirst, detectAvailableBrowser |
| `src/lib/browser/browser-install.js` | browserInstall |
| `src/lib/util/sheet-list.js` | isSessionLevelFailure |

## Entry Points

Start here when exploring this area:

- **`launchBrowserForApp`** (Function) — `src/lib/browser/browser-launch.js:288`
- **`resolveBrowserVersion`** (Function) — `src/lib/browser/browser-version.js:354`
- **`createAppImageDir`** (Function) — `src/lib/util/image-dir.js:32`
- **`markReported`** (Function) — `src/lib/util/reported-error.js:32`
- **`browserInstall`** (Function) — `src/lib/browser/browser-install.js:35`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `launchBrowserForApp` | Function | `src/lib/browser/browser-launch.js` | 288 |
| `resolveBrowserVersion` | Function | `src/lib/browser/browser-version.js` | 354 |
| `createAppImageDir` | Function | `src/lib/util/image-dir.js` | 32 |
| `markReported` | Function | `src/lib/util/reported-error.js` | 32 |
| `browserInstall` | Function | `src/lib/browser/browser-install.js` | 35 |
| `browserListAvailable` | Function | `src/lib/browser/browser-list-available.js` | 137 |
| `getMostRecentUsableChromeBuildId` | Function | `src/lib/browser/browser-list-available.js` | 300 |
| `getErrorCategory` | Function | `src/lib/util/error-categorizer.js` | 32 |
| `getErrorMetadata` | Function | `src/lib/util/error-categorizer.js` | 81 |
| `alreadyReported` | Function | `src/lib/util/reported-error.js` | 47 |
| `isSessionLevelFailure` | Function | `src/lib/util/sheet-list.js` | 174 |
| `browserInstalled` | Function | `src/lib/browser/browser-installed.js` | 16 |
| `browserUninstall` | Function | `src/lib/browser/browser-uninstall.js` | 24 |
| `browserUninstallAll` | Function | `src/lib/browser/browser-uninstall.js` | 102 |
| `qscloudListCollections` | Function | `src/lib/cloud/cloud-collections.js` | 19 |
| `qscloudCreateThumbnails` | Function | `src/lib/cloud/cloud-create-thumbnails.js` | 30 |
| `qseowCreateThumbnails` | Function | `src/lib/qseow/qseow-create-thumbnails.js` | 27 |
| `detectAvailableBrowser` | Function | `src/lib/browser/browser-detect.js` | 62 |
| `buildBrowserArgs` | Function | `src/lib/browser/browser-launch.js` | 76 |
| `resolveBrowserExecutablePath` | Function | `src/lib/browser/browser-launch.js` | 153 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `BrowserListAvailable → GetErrorCategory` | intra_community | 3 |
| `BrowserListAvailable → MarkReported` | cross_community | 3 |
| `ResolveBrowserVersion → MarkReported` | intra_community | 3 |
| `ResolveBrowserVersion → GetErrorCategory` | cross_community | 3 |
| `LaunchBrowserForApp → LogUnusableBrowser` | intra_community | 3 |
| `CreateAppImageDir → IsProbablyContainer` | intra_community | 3 |
| `GetMostRecentUsableChromeBuildId → GetErrorCategory` | intra_community | 3 |
| `GetMostRecentUsableChromeBuildId → MarkReported` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cloud | 1 calls |

## How to Explore

1. `gitnexus_context({name: "launchBrowserForApp"})` — see callers and callees
2. `gitnexus_query({query: "browser"})` — find related execution flows
3. Read key files listed above for implementation details
