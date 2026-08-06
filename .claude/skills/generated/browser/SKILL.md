---
name: browser
description: "Skill for the Browser area of butler-sheet-icons. 18 symbols across 10 files."
---

# Browser

18 symbols | 10 files | Cohesion: 96%

## When to Use

- Working with code in `src/`
- Understanding how browserInstall, browserListAvailable, getMostRecentUsableChromeBuildId work
- Modifying browser-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/browser/browser-list-available.js` | markReported, alreadyReported, logVersionHistoryFailure, extractVersions, mapPlatformToChrome (+2) |
| `src/lib/util/error-categorizer.js` | getErrorCategory, getErrorMetadata |
| `src/lib/browser/browser-launch.js` | detectDocker, buildBrowserArgs |
| `src/lib/browser/browser-install.js` | browserInstall |
| `src/lib/commands/browser/index.js` | buildBrowserCommand |
| `src/lib/commands/browser/install.js` | buildBrowserInstallCommand |
| `src/lib/commands/browser/list-available.js` | buildBrowserListAvailableCommand |
| `src/lib/commands/browser/list-installed.js` | buildBrowserListInstalledCommand |
| `src/lib/commands/browser/uninstall-all.js` | buildBrowserUninstallAllCommand |
| `src/lib/commands/browser/uninstall.js` | buildBrowserUninstallCommand |

## Entry Points

Start here when exploring this area:

- **`browserInstall`** (Function) — `src/lib/browser/browser-install.js:30`
- **`browserListAvailable`** (Function) — `src/lib/browser/browser-list-available.js:168`
- **`getMostRecentUsableChromeBuildId`** (Function) — `src/lib/browser/browser-list-available.js:335`
- **`getErrorCategory`** (Function) — `src/lib/util/error-categorizer.js:32`
- **`getErrorMetadata`** (Function) — `src/lib/util/error-categorizer.js:81`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `browserInstall` | Function | `src/lib/browser/browser-install.js` | 30 |
| `browserListAvailable` | Function | `src/lib/browser/browser-list-available.js` | 168 |
| `getMostRecentUsableChromeBuildId` | Function | `src/lib/browser/browser-list-available.js` | 335 |
| `getErrorCategory` | Function | `src/lib/util/error-categorizer.js` | 32 |
| `getErrorMetadata` | Function | `src/lib/util/error-categorizer.js` | 81 |
| `buildBrowserArgs` | Function | `src/lib/browser/browser-launch.js` | 61 |
| `markReported` | Function | `src/lib/browser/browser-list-available.js` | 40 |
| `alreadyReported` | Function | `src/lib/browser/browser-list-available.js` | 53 |
| `logVersionHistoryFailure` | Function | `src/lib/browser/browser-list-available.js` | 73 |
| `extractVersions` | Function | `src/lib/browser/browser-list-available.js` | 110 |
| `mapPlatformToChrome` | Function | `src/lib/browser/browser-list-available.js` | 139 |
| `buildBrowserCommand` | Function | `src/lib/commands/browser/index.js` | 12 |
| `buildBrowserInstallCommand` | Function | `src/lib/commands/browser/install.js` | 44 |
| `buildBrowserListAvailableCommand` | Function | `src/lib/commands/browser/list-available.js` | 33 |
| `buildBrowserListInstalledCommand` | Function | `src/lib/commands/browser/list-installed.js` | 35 |
| `buildBrowserUninstallAllCommand` | Function | `src/lib/commands/browser/uninstall-all.js` | 34 |
| `buildBrowserUninstallCommand` | Function | `src/lib/commands/browser/uninstall.js` | 34 |
| `detectDocker` | Function | `src/lib/browser/browser-launch.js` | 41 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `BrowserInstall → GetErrorCategory` | intra_community | 4 |
| `BrowserInstall → MarkReported` | intra_community | 4 |
| `BrowserListAvailable → GetErrorCategory` | intra_community | 3 |
| `BrowserListAvailable → MarkReported` | intra_community | 3 |
| `BrowserInstall → MapPlatformToChrome` | intra_community | 3 |
| `BrowserInstall → AlreadyReported` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cloud | 2 calls |

## How to Explore

1. `gitnexus_context({name: "browserInstall"})` — see callers and callees
2. `gitnexus_query({query: "browser"})` — find related execution flows
3. Read key files listed above for implementation details
