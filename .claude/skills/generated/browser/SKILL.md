---
name: browser
description: "Skill for the Browser area of butler-sheet-icons. 14 symbols across 10 files."
---

# Browser

14 symbols | 10 files | Cohesion: 88%

## When to Use

- Working with code in `src/`
- Understanding how browserInstall, browserListAvailable, getMostRecentUsableChromeBuildId work
- Modifying browser-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/browser/browser-list-available.js` | extractVersions, mapPlatformToChrome, browserListAvailable, getMostRecentUsableChromeBuildId |
| `src/lib/browser/browser-launch.js` | detectDocker, buildBrowserArgs |
| `src/lib/browser/browser-install.js` | browserInstall |
| `src/lib/util/reported-error.js` | alreadyReported |
| `src/lib/commands/browser/index.js` | buildBrowserCommand |
| `src/lib/commands/browser/install.js` | buildBrowserInstallCommand |
| `src/lib/commands/browser/list-available.js` | buildBrowserListAvailableCommand |
| `src/lib/commands/browser/list-installed.js` | buildBrowserListInstalledCommand |
| `src/lib/commands/browser/uninstall-all.js` | buildBrowserUninstallAllCommand |
| `src/lib/commands/browser/uninstall.js` | buildBrowserUninstallCommand |

## Entry Points

Start here when exploring this area:

- **`browserInstall`** (Function) — `src/lib/browser/browser-install.js:37`
- **`browserListAvailable`** (Function) — `src/lib/browser/browser-list-available.js:137`
- **`getMostRecentUsableChromeBuildId`** (Function) — `src/lib/browser/browser-list-available.js:304`
- **`alreadyReported`** (Function) — `src/lib/util/reported-error.js:47`
- **`buildBrowserArgs`** (Function) — `src/lib/browser/browser-launch.js:66`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `browserInstall` | Function | `src/lib/browser/browser-install.js` | 37 |
| `browserListAvailable` | Function | `src/lib/browser/browser-list-available.js` | 137 |
| `getMostRecentUsableChromeBuildId` | Function | `src/lib/browser/browser-list-available.js` | 304 |
| `alreadyReported` | Function | `src/lib/util/reported-error.js` | 47 |
| `buildBrowserArgs` | Function | `src/lib/browser/browser-launch.js` | 66 |
| `extractVersions` | Function | `src/lib/browser/browser-list-available.js` | 79 |
| `mapPlatformToChrome` | Function | `src/lib/browser/browser-list-available.js` | 108 |
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
| `BrowserInstall → GetErrorCategory` | cross_community | 4 |
| `BrowserInstall → MarkReported` | cross_community | 4 |
| `BrowserListAvailable → GetErrorCategory` | cross_community | 3 |
| `BrowserListAvailable → MarkReported` | cross_community | 3 |
| `BrowserInstall → MapPlatformToChrome` | intra_community | 3 |
| `BrowserInstall → AlreadyReported` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cloud | 3 calls |
| Util | 3 calls |

## How to Explore

1. `gitnexus_context({name: "browserInstall"})` — see callers and callees
2. `gitnexus_query({query: "browser"})` — find related execution flows
3. Read key files listed above for implementation details
