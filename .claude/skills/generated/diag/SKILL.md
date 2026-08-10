---
name: diag
description: "Skill for the Diag area of butler-sheet-icons. 11 symbols across 1 files."
---

# Diag

11 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `scripts/`
- Understanding how parseArgs, capture, lastDisplayTransition work
- Modifying diag-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `scripts/diag/browser-flag-probe.mjs` | parseArgs, capture, lastDisplayTransition, captureHostState, deadline (+6) |

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `parseArgs` | Function | `scripts/diag/browser-flag-probe.mjs` | 67 |
| `capture` | Function | `scripts/diag/browser-flag-probe.mjs` | 107 |
| `lastDisplayTransition` | Function | `scripts/diag/browser-flag-probe.mjs` | 123 |
| `captureHostState` | Function | `scripts/diag/browser-flag-probe.mjs` | 138 |
| `deadline` | Function | `scripts/diag/browser-flag-probe.mjs` | 168 |
| `cancel` | Function | `scripts/diag/browser-flag-probe.mjs` | 173 |
| `withDeadline` | Function | `scripts/diag/browser-flag-probe.mjs` | 185 |
| `sampleWedgedProcess` | Function | `scripts/diag/browser-flag-probe.mjs` | 211 |
| `runTrial` | Function | `scripts/diag/browser-flag-probe.mjs` | 244 |
| `renderSummary` | Function | `scripts/diag/browser-flag-probe.mjs` | 339 |
| `main` | Function | `scripts/diag/browser-flag-probe.mjs` | 371 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `Main → Capture` | intra_community | 5 |
| `Main → Deadline` | intra_community | 4 |
| `Main → Cancel` | intra_community | 4 |
| `Main → SampleWedgedProcess` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "parseArgs"})` — see callers and callees
2. `gitnexus_query({query: "diag"})` — find related execution flows
3. Read key files listed above for implementation details
