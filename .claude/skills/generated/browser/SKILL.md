---
name: browser
description: "Skill for the Browser area of butler-sheet-icons. 10 symbols across 8 files."
---

# Browser

10 symbols | 8 files | Cohesion: 90%

## When to Use

- Working with code in `src/`
- Understanding how browserInstall, browserListAvailable, getMostRecentUsableChromeBuildId work
- Modifying browser-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/browser/browser-list-available.js` | mapPlatformToChrome, browserListAvailable, getMostRecentUsableChromeBuildId |
| `src/lib/commands/browser/index.js` | buildBrowserCommand |
| `src/lib/commands/browser/install.js` | buildBrowserInstallCommand |
| `src/lib/commands/browser/list-available.js` | buildBrowserListAvailableCommand |
| `src/lib/commands/browser/list-installed.js` | buildBrowserListInstalledCommand |
| `src/lib/commands/browser/uninstall-all.js` | buildBrowserUninstallAllCommand |
| `src/lib/commands/browser/uninstall.js` | buildBrowserUninstallCommand |
| `src/lib/browser/browser-install.js` | browserInstall |

## Entry Points

Start here when exploring this area:

- **`browserInstall`** (Function) — `src/lib/browser/browser-install.js:26`
- **`browserListAvailable`** (Function) — `src/lib/browser/browser-list-available.js:44`
- **`getMostRecentUsableChromeBuildId`** (Function) — `src/lib/browser/browser-list-available.js:199`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `browserInstall` | Function | `src/lib/browser/browser-install.js` | 26 |
| `browserListAvailable` | Function | `src/lib/browser/browser-list-available.js` | 44 |
| `getMostRecentUsableChromeBuildId` | Function | `src/lib/browser/browser-list-available.js` | 199 |
| `buildBrowserCommand` | Function | `src/lib/commands/browser/index.js` | 12 |
| `buildBrowserInstallCommand` | Function | `src/lib/commands/browser/install.js` | 44 |
| `buildBrowserListAvailableCommand` | Function | `src/lib/commands/browser/list-available.js` | 34 |
| `buildBrowserListInstalledCommand` | Function | `src/lib/commands/browser/list-installed.js` | 35 |
| `buildBrowserUninstallAllCommand` | Function | `src/lib/commands/browser/uninstall-all.js` | 34 |
| `buildBrowserUninstallCommand` | Function | `src/lib/commands/browser/uninstall.js` | 34 |
| `mapPlatformToChrome` | Function | `src/lib/browser/browser-list-available.js` | 15 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `BrowserInstall → MapPlatformToChrome` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Cloud | 2 calls |

## How to Explore

1. `gitnexus_context({name: "browserInstall"})` — see callers and callees
2. `gitnexus_query({query: "browser"})` — find related execution flows
3. Read key files listed above for implementation details
