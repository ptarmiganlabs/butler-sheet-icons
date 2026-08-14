---
name: diag
description: "Skill for the Diag area of butler-sheet-icons. 10 symbols across 1 files."
---

# Diag

10 symbols | 1 files | Cohesion: 95%

## When to Use

- Working with code in `scripts/`
- Understanding how parseArgs, capture, lastDisplayTransition work
- Modifying diag-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/diag/browser-flag-probe.mjs` | parseArgs, capture, lastDisplayTransition, captureHostState, deadline (+5) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `parseArgs` | Function | `scripts/diag/browser-flag-probe.mjs` | 67 |
| `capture` | Function | `scripts/diag/browser-flag-probe.mjs` | 107 |
| `lastDisplayTransition` | Function | `scripts/diag/browser-flag-probe.mjs` | 123 |
| `captureHostState` | Function | `scripts/diag/browser-flag-probe.mjs` | 138 |
| `deadline` | Function | `scripts/diag/browser-flag-probe.mjs` | 168 |
| `withDeadline` | Function | `scripts/diag/browser-flag-probe.mjs` | 185 |
| `sampleWedgedProcess` | Function | `scripts/diag/browser-flag-probe.mjs` | 211 |
| `runTrial` | Function | `scripts/diag/browser-flag-probe.mjs` | 244 |
| `renderSummary` | Function | `scripts/diag/browser-flag-probe.mjs` | 339 |
| `main` | Function | `scripts/diag/browser-flag-probe.mjs` | 371 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → Configured` | cross_community | 5 |
| `Main → GetDefaultBrowserCacheDir` | cross_community | 5 |
| `Main → CountCachedBuilds` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Browser | 1 calls |

## How to Explore

1. `context({name: "parseArgs"})` — see callers and callees
2. `query({search_query: "diag"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
