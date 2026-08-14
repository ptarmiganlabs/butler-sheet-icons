---
name: interactive
description: "Skill for the Interactive area of butler-sheet-icons. 113 symbols across 26 files."
---

# Interactive

113 symbols | 26 files | Cohesion: 77%

## When to Use

- Working with code in `src/`
- Understanding how openingOn, appSourceQuestion, resolvesToApps work
- Modifying interactive-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/interactive/ask-questions.js` | assertNeedsAreSatisfiable, describeSupplied, describePassedCheck, describeFailedCheck, configFor (+12) |
| `src/lib/interactive/spec-ops.js` | openingOn, appSourceQuestion, resolvesToApps, appPickerQuestion, typedAppQuestion (+11) |
| `src/lib/interactive/self-test.js` | readWindowsCodePage, heading, formatCapabilities, formatSymbolMatrix, frames (+8) |
| `src/lib/interactive/merge-env-file.js` | toLines, dominantEol, opensQuote, closesQuote, findClosingLine (+2) |
| `src/lib/interactive/option-introspect.js` | isTrueFalseOption, splitDescription, typeForOption, defaultForOption, specFromOption (+1) |
| `src/lib/interactive/to-cli-options.js` | tokensFor, emissionsFor, notEmitted, matchesDeclaredDefault, tokensFrom (+1) |
| `src/lib/interactive/render-env-file.js` | quoteEnvValue, savable, isSecret, assign, envAssignments (+1) |
| `src/lib/interactive/index.js` | review, runInteractive, checkOnly, upFront, nameOf |
| `src/lib/interactive/mandatory-relaxation.js` | wantsInteractive, commandAndAncestors, relaxMandatoryOptionsIfInteractive, relax |
| `src/lib/interactive/symbols.js` | getSymbols, isUnicodeCapable, tableBorderName |

## Entry Points

Start here when exploring this area:

- **`openingOn`** (Function) — `src/lib/interactive/spec-ops.js:112`
- **`appSourceQuestion`** (Function) — `src/lib/interactive/spec-ops.js:176`
- **`resolvesToApps`** (Function) — `src/lib/interactive/spec-ops.js:217`
- **`appPickerQuestion`** (Function) — `src/lib/interactive/spec-ops.js:259`
- **`typedAppQuestion`** (Function) — `src/lib/interactive/spec-ops.js:331`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `openingOn` | Function | `src/lib/interactive/spec-ops.js` | 112 |
| `appSourceQuestion` | Function | `src/lib/interactive/spec-ops.js` | 176 |
| `resolvesToApps` | Function | `src/lib/interactive/spec-ops.js` | 217 |
| `appPickerQuestion` | Function | `src/lib/interactive/spec-ops.js` | 259 |
| `typedAppQuestion` | Function | `src/lib/interactive/spec-ops.js` | 331 |
| `gate` | Function | `src/lib/interactive/spec-ops.js` | 354 |
| `gatedBy` | Function | `src/lib/interactive/spec-ops.js` | 387 |
| `inSections` | Function | `src/lib/interactive/spec-ops.js` | 415 |
| `headingFor` | Function | `src/lib/interactive/spec-ops.js` | 417 |
| `rank` | Function | `src/lib/interactive/spec-ops.js` | 424 |
| `readWindowsCodePage` | Function | `src/lib/interactive/self-test.js` | 39 |
| `formatCapabilities` | Function | `src/lib/interactive/self-test.js` | 152 |
| `formatSymbolMatrix` | Function | `src/lib/interactive/self-test.js` | 185 |
| `frames` | Function | `src/lib/interactive/self-test.js` | 188 |
| `formatPalette` | Function | `src/lib/interactive/self-test.js` | 250 |
| `renderStaticReport` | Function | `src/lib/interactive/self-test.js` | 283 |
| `runSelfTest` | Function | `src/lib/interactive/self-test.js` | 368 |
| `getSymbols` | Function | `src/lib/interactive/symbols.js` | 87 |
| `buildTheme` | Function | `src/lib/interactive/theme.js` | 29 |
| `createPalette` | Function | `src/lib/util/colour.js` | 62 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunInteractive → ParsePositiveInteger` | cross_community | 6 |
| `RunInteractive → DescribeBrowserVersionOption` | cross_community | 6 |
| `RunInteractive → BuildBrowserCacheDirOption` | cross_community | 6 |
| `HandleCloudCreateSheetThumbnails → Walk` | cross_community | 6 |
| `RunInteractive → BuildCloudListCollectionsCommand` | cross_community | 5 |
| `RunInteractive → BuildCloudRemoveSheetIconsCommand` | cross_community | 5 |
| `RunSelfTest → IsUnicodeCapable` | cross_community | 5 |
| `HandleCloudCreateSheetThumbnails → IsUnicodeCapable` | cross_community | 5 |
| `HandleCloudCreateSheetThumbnails → IsInteractiveOption` | cross_community | 5 |
| `HandleQseowCreateSheetThumbnails → IsUnicodeCapable` | cross_community | 5 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Browser | 3 calls |
| Qscloud | 1 calls |

## How to Explore

1. `context({name: "openingOn"})` — see callers and callees
2. `query({search_query: "interactive"})` — find related execution flows
3. Read key files listed above for implementation details
4. `explain({target: "<file or symbol>"})` — persisted taint findings (source→sink data flows), when indexed with `--pdg`
