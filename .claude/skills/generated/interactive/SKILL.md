---
name: interactive
description: "Skill for the Interactive area of butler-sheet-icons. 44 symbols across 10 files."
---

# Interactive

44 symbols | 10 files | Cohesion: 98%

## When to Use

- Working with code in `src/`
- Understanding how askQuestions, runInteractive, runMenu work
- Modifying interactive-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `src/lib/interactive/self-test.js` | heading, formatCapabilities, renderStaticReport, runPromptGallery, runSelfTest (+6) |
| `src/lib/interactive/ask-questions.js` | resolveChoices, configFor, askQuestions, hasDefault, select (+5) |
| `src/lib/interactive/theme.js` | help, answer, message, defaultAnswer |
| `src/lib/interactive/to-cli-options.js` | matchesDeclaredDefault, tokensFor, emissionsFor, notEmitted |
| `src/lib/interactive/prompt-runtime.js` | loadPrompts, ask, write |
| `src/lib/interactive/interactive-command.js` | runSelfTestUnlessCancelled, runWizardUnlessCancelled, handleInteractive |
| `src/lib/interactive/mandatory-relaxation.js` | commandAndAncestors, relaxMandatoryOptionsIfInteractive, relax |
| `src/lib/interactive/option-introspect.js` | typeForOption, defaultForOption, specFromOption |
| `src/lib/interactive/index.js` | review, runInteractive |
| `src/lib/interactive/menu.js` | runMenu |

## Entry Points

Start here when exploring this area:

- **`askQuestions`** (Function) — `src/lib/interactive/ask-questions.js:196`
- **`runInteractive`** (Function) — `src/lib/interactive/index.js:72`
- **`runMenu`** (Function) — `src/lib/interactive/menu.js:24`
- **`formatCapabilities`** (Function) — `src/lib/interactive/self-test.js:152`
- **`renderStaticReport`** (Function) — `src/lib/interactive/self-test.js:283`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `askQuestions` | Function | `src/lib/interactive/ask-questions.js` | 196 |
| `runInteractive` | Function | `src/lib/interactive/index.js` | 72 |
| `runMenu` | Function | `src/lib/interactive/menu.js` | 24 |
| `formatCapabilities` | Function | `src/lib/interactive/self-test.js` | 152 |
| `renderStaticReport` | Function | `src/lib/interactive/self-test.js` | 283 |
| `runSelfTest` | Function | `src/lib/interactive/self-test.js` | 364 |
| `help` | Function | `src/lib/interactive/theme.js` | 48 |
| `formatPalette` | Function | `src/lib/interactive/self-test.js` | 250 |
| `answer` | Function | `src/lib/interactive/theme.js` | 44 |
| `message` | Function | `src/lib/interactive/theme.js` | 45 |
| `defaultAnswer` | Function | `src/lib/interactive/theme.js` | 47 |
| `emissionsFor` | Function | `src/lib/interactive/to-cli-options.js` | 105 |
| `notEmitted` | Function | `src/lib/interactive/to-cli-options.js` | 107 |
| `relaxMandatoryOptionsIfInteractive` | Function | `src/lib/interactive/mandatory-relaxation.js` | 92 |
| `relax` | Function | `src/lib/interactive/mandatory-relaxation.js` | 100 |
| `specFromOption` | Function | `src/lib/interactive/option-introspect.js` | 140 |
| `collectCapabilities` | Function | `src/lib/interactive/self-test.js` | 74 |
| `formatSymbolMatrix` | Function | `src/lib/interactive/self-test.js` | 185 |
| `frames` | Function | `src/lib/interactive/self-test.js` | 188 |
| `resolveChoices` | Function | `src/lib/interactive/ask-questions.js` | 53 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunInteractive → LoadPrompts` | intra_community | 4 |
| `RunSelfTest → LoadPrompts` | intra_community | 4 |
| `AskQuestions → LoadPrompts` | intra_community | 3 |
| `RunInteractive → Write` | intra_community | 3 |
| `RunMenu → LoadPrompts` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "askQuestions"})` — see callers and callees
2. `gitnexus_query({query: "interactive"})` — find related execution flows
3. Read key files listed above for implementation details
