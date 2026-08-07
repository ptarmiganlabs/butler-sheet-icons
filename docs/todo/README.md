# Design docs for planned work: `docs/todo`

Files in this folder are **design documents written before implementation**. Each one describes a
planned change in enough detail that a contributor — or a coding assistant — can pick it up cold and
build it without re-deriving the research behind it.

This is not user documentation. Nothing here describes how Butler Sheet Icons behaves today.

| Folder | Contains |
| --- | --- |
| `docs/todo` | Designs for work that has not been built yet |
| `docs/to-doc-site` | Drafts of user documentation, staged for publication to the doc site |
| `docs/` (root) | Reference notes about the codebase itself |

## What belongs here

A design doc, not a task list. It should state the problem, the evidence that the problem is real,
the decisions taken and why, the alternatives rejected, and what "done" looks like. Where it makes a
claim about current behaviour, it should say which file and line that claim comes from, or how it was
verified — a design doc that a reader cannot check is a design doc they will have to redo.

Each doc should also say which parts of `docs/to-doc-site` the implementation must produce. Per the
convention in `AGENTS.md`, user-visible changes ship their documentation drafts in the same change,
so the design has to plan for them rather than leaving them to be discovered afterwards.

## Lifecycle

A doc stays here while the work is unbuilt. Once the work has shipped, delete it — the code, its
tests, and the published documentation are the record from that point on, and a stale design doc
describing something that has since changed is worse than none. If a design is abandoned rather than
built, delete it too, and note the reasoning in the relevant GitHub issue where it stays visible.
