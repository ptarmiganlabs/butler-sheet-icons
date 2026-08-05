<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **butler-sheet-icons**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely. Read `gitnexus://repo/butler-sheet-icons/context` for live index statistics.

> If any GitNexus tool warns the index is stale, run `npm run gitnexus:index` in terminal first.
>
> **Never run a bare `npx gitnexus analyze`.** It rewrites this managed block, and without
> `--skills` it deletes the generated-skills table below. Re-index only through the
> `npm run gitnexus:*` scripts, which route through `scripts/gitnexus.js` and pass the right
> flags. The read-only subcommands (`impact`, `context`, `query`, `detect-changes`) are safe to
> run directly. See `docs/README.gitnexus.md`.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/butler-sheet-icons/context` | Codebase overview, check index freshness |
| `gitnexus://repo/butler-sheet-icons/clusters` | All functional areas |
| `gitnexus://repo/butler-sheet-icons/processes` | All execution flows |
| `gitnexus://repo/butler-sheet-icons/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |
| Work in the Cloud area | `.claude/skills/generated/cloud/SKILL.md` |
| Work in the Browser area | `.claude/skills/generated/browser/SKILL.md` |
| Work in the Qscloud area | `.claude/skills/generated/qscloud/SKILL.md` |
| Work in the Qseow area | `.claude/skills/generated/qseow/SKILL.md` |
| Work in the Util area | `.claude/skills/generated/util/SKILL.md` |

<!-- gitnexus:end -->

## Documenting user-facing changes

If a change adds, alters, or removes behaviour a Butler Sheet Icons user can observe — CLI commands or flags, environment variables, defaults, output, or error messages they are expected to act on — stage a page in `docs/to-doc-site/` as part of the same change.

- Write for **Qlik Sense administrators**, not Node developers.
- `docs/to-doc-site/README.md` defines the workflow: unprefixed means pending publication; rename with a `done_` prefix once published.
- The published site is [butler-sheet-icons.ptarmiganlabs.com](https://butler-sheet-icons.ptarmiganlabs.com), built from [ptarmiganlabs/butler-sheet-icons-docs](https://github.com/ptarmiganlabs/butler-sheet-icons-docs). Verify with `npm run docs:build` there — it fails on dead links.
- Verify the text against the implementation before publishing rather than trusting the staged draft.

Internal-only changes — refactors, test changes, build or lint tooling — need no doc page.

See `AGENTS.md` for the full set of repository conventions.
