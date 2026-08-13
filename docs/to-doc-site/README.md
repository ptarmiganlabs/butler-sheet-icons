# Docs Staging: `to-doc-site`

Files in this folder are drafts of updates to the Butler Sheet Icons (BSI) documentation site. They are written and reviewed here, then published to the doc site repository.

This folder is a **staging area, not the published source**. The published site lives in a separate repository:

|                |                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------- |
| Published site | <https://butler-sheet-icons.ptarmiganlabs.com>                                               |
| Source repo    | <https://github.com/ptarmiganlabs/butler-sheet-icons-docs>                                   |
| Local clone    | `/Users/goran/code/butler-sheet-icons-docs`                                                  |
| Site generator | [VitePress](https://vitepress.dev)                                                           |
| Hosting        | Cloudflare Pages — builds and publishes automatically on every push                          |
| `next` branch  | Where **all** doc site work goes. Preview URL only.                                          |
| `main` branch  | Production. What the public site serves. Reached only by merging `next` at BSI release time. |

The doc site is **single-version**: one copy of the docs, no per-release archive. Anything merged to its `main` is published to the public site within minutes and is presented as documentation for the current release, whatever version it actually describes.

**Everything published from this folder therefore goes to `next`, never to `main`.** There is no per-file branch decision to make.

## Audience

Files here should be written for **Butler Sheet Icons and Qlik Sense administrators** — not Node.js developers. Assume the reader:

- Is familiar with Qlik Sense and its ecosystem
- Has admin-level access to a Qlik Sense environment
- Understands what Butler Sheet Icons does and why they would use it
- May not know what an HTTP API is or how to read a JSON response body
- May be managing Butler Sheet Icons in a production environment

When in doubt, err on the side of explaining more rather than less. Use plain language, avoid jargon where simple words suffice, and provide enough context that an admin with no software development background can understand and act on the information.

## File format

- Use Markdown (`.md`)
- One topic per file
- File names should be descriptive and kebab-case (e.g., `audit-api-return-codes.md`)
- Include all information relevant to the doc site in a single file — do not split topics across files or assume readers will cross-reference multiple files
- Do not include internal implementation details (code snippets, internal variable names, file paths in the codebase) unless they are directly relevant to an administrator configuring or operating Butler Sheet Icons

A draft may name a target page and suggest replacement text, but it is a proposal. The publishing pass below decides what actually ships.

## Option tables are generated, not written

Never hand-write or hand-edit a table of CLI options on the doc site. Flag names, environment variables, accepted values and defaults are all declared once in the Commander definitions under `src/lib/commands/`, and a table typed out beside them is a second copy that drifts silently — issue #849 is one page's worth of exactly that, including a default documented as `latest` that the code had never used.

Generate them instead:

```bash
npm run docs:cli-tables -- --command "browser install"
```

That prints a block wrapped in `<!-- generated:cli-options ... -->` markers. Paste it into the page in place of the table. From then on the block is refreshed in place, with the prose around it untouched:

```bash
npm run docs:cli-tables -- ../butler-sheet-icons-docs/docs/reference/browser.md --write
```

Use `--check` instead of `--write` to be told whether a page is current without changing it; it exits non-zero when it is not, so it can gate a release. `--list` names every command a table can be generated for.

The `Example` column is the one part not derived from the code: examples are derived only for options with a fixed set of accepted values, since any other example — a host name, a build id — would be invented. Supply the rest through `--examples <file>`, a JSON file of `{ "<command path>": { "--flag": "..." } }`.

If a description reads badly on the site, fix it in the Commander definition rather than in the table. The same text is what `--help` prints, so the page and the terminal improve together.

## Processing status

- Files **directly in this folder, without a prefix**, are pending review or publication.
- Files in the **`done/` subfolder, prefixed `done_`**, have been incorporated into the doc site, their content has been verified to already exist there, or they were deliberately judged not worth publishing.

Marking a file as processed is two steps, both done with `git mv` so history follows the file:

1. Add the `done_` prefix, keeping the original file name after it: `audit-api-return-codes.md` becomes `done_audit-api-return-codes.md`.
2. Move it into the `done/` subfolder, so the final path is `docs/to-doc-site/done/done_audit-api-return-codes.md`. Create the folder if it does not exist.

Both steps in one command:

```bash
git mv docs/to-doc-site/audit-api-return-codes.md docs/to-doc-site/done/done_audit-api-return-codes.md
```

Processed files stay in `done/` for traceability until there is a deliberate cleanup pass. Relative links between two processed files keep working, since they move together.

---

## Publishing to the doc site

This is the standing instruction for "update the doc site from `docs/to-doc-site`". It covers the unprefixed files directly in this folder. Ignore the `done/` subfolder — it is already processed.

**This is not a bulk pass.** Files are processed **one at a time**, start to finish, and each one is approved twice: once before it is written, and once after it is live on `next`.

```
for each draft, in dependency order:
    publish  →  PR into next  →  merge  →  report the changed pages as live URLs
              →  WAIT for approval
              →  approved?  git mv the draft into done/, move to the next draft
              →  not approved?  revise, re-report, wait again
```

Do not start the next draft while the current one is unapproved, and do not batch several drafts into one doc site pull request. One draft, one pull request, one review.

### 1. Establish scope, then get approval

Before reading deeply, before editing anything, work out which files are in scope and get a decision on each one.

**Scope comes from how the request was phrased:**

| Request                                                       | Files in scope                                                                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Process `<filename>.md`" — a named file                      | **That file only.** Do not inventory the rest. Name the other pending drafts in one line at the end so nothing is forgotten, and leave them alone. |
| "Update the doc site from `docs/to-doc-site`" — no file named | **Every** unprefixed file in this folder.                                                                                                          |

Work through steps 2–4 far enough to form a recommendation, then present a table covering the files in scope:

| Draft              | Recommendation | Target page(s)                                 | Why                                          |
| ------------------ | -------------- | ---------------------------------------------- | -------------------------------------------- |
| `example-draft.md` | Publish        | `/reference/commands`, `/guide/advanced/ci-cd` | New behaviour, nothing on the site covers it |
| `another-draft.md` | Skip           | —                                              | Internal refactor, no user-visible change    |

Where more than one file is in scope, **propose the order too** — see below. Then **stop and wait.**

- **No file is written, moved, or committed until that specific file has been approved.**
- Approval is per file. Approving one file says nothing about the others in the list — do not treat a general "yes" as covering the whole table.
- Approval to publish is **not** approval to commit or push. The rule in step 7 still applies.
- If a draft turns out to be larger or more entangled than the recommendation suggested, come back and say so rather than expanding the work unilaterally.

#### Order the drafts by dependency, not by folder listing

Drafts are written one per feature, in whatever order the features landed, and they routinely contradict each other. A draft written in June can state as fact something a draft written in July changed. Publishing in filename order therefore puts wrong text on the site and makes the next draft a correction pass.

Read all the drafts in scope **before publishing the first one**, and sequence them so no draft lands before the facts it depends on. Two rules catch most of it:

- A draft that **changes where something lives or what something is called** goes before every draft that mentions it.
- A draft that says a feature is _"not yet available"_ or _"planned for a later release"_ is suspect. Check the source — the follow-up may be in the same release, in which case that sentence must be corrected rather than published.

Where two drafts touch the same page, publishing them back to back keeps the rewrite in one head.

### 2. Review each file critically

For each unprefixed file, answer three questions before writing anything:

1. **Should it be published at all?** Some drafts describe internal refactors, or behaviour that never reaches a user. Some are already covered on the site. Some describe behaviour that has since changed again. Say so and process the file into `done/` without publishing rather than adding noise to the site.

    **A draft that states its own precondition is not ready until that precondition holds**, and it stays pending rather than being archived. `windows-binary-signed-again.md` says "do not publish until a signed release actually exists" — publishing it early would have told administrators the Windows download is signed while the only download available was not, which is worse than silence: the page tells them to distrust a binary whose signature does not match.

2. **Where does it fit?** See "Site structure" below. Strongly prefer **editing an existing page** over adding a new one — a fact stated in two places drifts out of sync. A draft's suggested target page is a starting point, not a decision.

    **Check whether the site already covers the symptom** before writing a new section. `browser-build-stops-responding-immediately.md` was most of the way covered by an existing troubleshooting section quoting the same two error lines; publishing it as written would have produced two answers to one search. What it actually needed was three paragraphs added to what was there.

3. **What is the right wording and cross-linking?** Rewrite in the doc site's voice rather than pasting the draft. Add cross-links both ways: from the concept page to the reference page, and back.

### 3. Verify every claim against the implementation

**Do not trust the draft.** Drafts are written from intent and can be wrong about detail. Read the actual source in this repo and confirm:

- Exact CLI flags, defaults, and environment variable names (`src/lib/commands/`)
- Exact log and error message text — quote it verbatim so admins can search for it
- What actually triggers a behaviour, including the failure paths

Correct the draft's technical errors in the published page. If a processed file is left in `done/` with a claim that turned out to be wrong, add a short HTML comment noting the correction so the error does not resurface later.

**Except in an option table.** Do not verify flags, environment variables, accepted values or defaults by hand where they appear in a table between `<!-- generated:cli-options ... -->` markers — those are generated from the Commander definitions, and anything typed inside the markers is overwritten on the next run. Regenerate instead, and see "Option tables are generated, not written" above. If a table is wrong, the declaration in `src/lib/commands/` is wrong, and fixing it there fixes `--help` too.

### 4. Establish which BSI version the behaviour ships in

This sets the version gate on the page. It does **not** affect which branch the change goes to — that is always `next`.

- **Already released** — the behaviour is in the latest published GitHub release of this repo.
- **Not released yet** — the change is merged to `main` here but still sits in the open `release-please` PR. That PR's title states the upcoming version (`chore(main): release butler-sheet-icons X.Y.Z`), which follows from the unreleased commit types. Do not guess a bump, and do not invent a version number.

Most drafts in this folder are written right after the feature is implemented, so **"not released yet" is the common case.**

**A version number written inside a draft is not evidence.** Read the open release-please PR title yourself, every time. A draft states the version that was pending on the day it was written, and one later commit can invalidate it: a single `feat!` landing after the draft turns a pending 4.2.0 into 5.0.0, and every draft still sitting in this folder now names a release that will never exist. This is not hypothetical — it is what happened to the whole 5.0.0 batch.

The same applies to sample log output. **Do not paste a log line containing a version number**, such as `info: App version: 4.1.0`. It dates the page, and published binaries have been mis-stamped before, so the number in a draft's transcript is not necessarily what a reader will see. Trim the line or replace the version with the surrounding prose.

The doc site describes the released product, and readers may be several versions behind. When a page documents behaviour that changed, gate it:

```markdown
::: warning Requires BSI X.Y.Z or later
In earlier versions ...
:::
```

### 5. Site structure

Content lives under `docs/` in the doc site repo:

| Directory         | Contents                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `docs/guide/`     | Tutorials and conceptual explanation — including `concepts/`, `configuration/`, `advanced/`, and `troubleshooting.md` |
| `docs/reference/` | Complete command and option reference                                                                                 |
| `docs/examples/`  | Practical, copy-paste ready examples                                                                                  |

A **new page** also needs a sidebar entry in `docs/.vitepress/config.js`. A page with no sidebar entry is reachable only by search.

Where a topic naturally spans page types, cover it in all three: the concept page explains _why_, the reference page states the _facts_ per command, and troubleshooting handles _symptom → cause → fix_.

VitePress conventions used on the site:

- Internal links are absolute and extensionless: `[text](/guide/concepts/browser-management)`
- Callouts: `::: tip` / `::: warning` / `::: danger`, closed with `:::`
- Per-shell examples use `::: code-group` with ` ```powershell [PowerShell] ` and ` ```bash [Bash] ` fences — give **both**, not one
- Images live in `docs/public/images/` and are referenced as `/images/file.png`
- The doc site repo's `VITEPRESS_MARKDOWN.md` documents the rest: line highlighting, code diffs, line numbers, custom anchors

#### Use the extensions where they carry meaning

A draft is plain prose because it was written quickly, not because plain prose is the right final form. Reach for more when the content is actually shaped that way:

- **Mermaid** for a decision or precedence that prose has to describe as a numbered list — "the first of these that is set wins", "this input leads to that outcome". A reader answering _"which one applies to me?"_ gets there faster from a diagram. Do not draw one to decorate a page that is already a straight sequence of steps.
- **Callouts** for the things a reader must not miss: a version gate, a setting that breaks single sign-on for everyone if changed, a step that looks like the fix but is not.
- **Tables** for anything with a repeating shape — platform vs path, symptom vs cause, version vs behaviour.

#### Cross-link deliberately, in both directions

A page nobody can reach from the page they are already on may as well not exist. Every published change adds links:

- **Both ways.** Concept → reference and reference → concept. A one-way link leaves the other page a dead end.
- **To the neighbours**, not just the obvious target. A troubleshooting symptom links to the concept page that explains the mechanism; the concept page links to the symptom.
- **Outward** where the authority is elsewhere: the Qlik Sense help, a GitHub issue that tracks a known limitation, the release the behaviour ships in. External links are the right way to avoid restating something the site does not own.

### 6. Verify the build

From the doc site repo:

```bash
npm run docs:build
```

The build **fails on dead links**, so a passing build proves page links resolve.

It does **not** validate `#anchor` fragments. Check those against the generated HTML:

```bash
grep -o 'id="[^"]*"' docs/.vitepress/dist/guide/concepts/<page>.html | sort -u
```

Watch for headings containing typographic characters. Several pages use the non-breaking hyphen `‑` (U+2011) rather than `-`, and it survives into the anchor — so `#strategy-3-use-a-pre-cached-browser-semi-offline` silently misses a heading that reads identically. Normalise the heading to plain ASCII hyphens rather than copying the unicode into the link.

Then confirm no generated option table has gone stale. From **this** repo, naming the doc site pages you touched:

```bash
npm run docs:cli-tables -- ../butler-sheet-icons-docs/docs/reference/browser.md --check
```

It exits non-zero and names the command whose table is out of date. A table can go stale without anyone editing the page — a changed flag, default or description in `src/lib/commands/` is enough — so this is worth running even on a pass that did not touch a reference page.

### 7. Git workflow

Both repositories follow the same rule: **branch first, implement, verify, then stop and report.**

#### Which doc site branch to target

**`next`. Always.** There is no decision to make and no case in which a draft from this folder goes to `main`.

The doc site is single-version and Cloudflare Pages publishes `main` automatically, so anything merged there is live on the public site within minutes. `next` publishes to a preview URL instead, and is merged into `main` when a BSI release ships. Routing everything through `next` means documentation cannot reach the public site ahead of the release it describes.

#### Rules

- Create a feature branch in the doc site repo off an up-to-date `next` before the first edit. Never work directly on `next` itself, and never on `main`. **Pull first** — a local `next` left over from an earlier pass is usually behind, and branching off it silently reverts whatever landed in between.
- One draft, one doc site branch, one pull request. Do not carry a second draft on the same branch.
- Do the doc site edits and the `done/` moves in this repo as separate branches — they are separate repositories and separate pull requests.
- **Never commit, push, open a pull request, or merge unless explicitly asked.** Authorisation is per request and does not carry over.
- Commit messages in both repos use [Conventional Commits](https://www.conventionalcommits.org/). Doc site changes are `docs:`.

#### When the request is the full one-at-a-time loop

A request that asks for drafts to be published "one by one, via PRs into `next`, reporting the changed pages after each lands" **is** the authorisation to commit, push, open and merge those pull requests — that is what "lands in `next`" means, and asking again before each merge just stalls the loop.

It authorises nothing else. Specifically:

- **`next` only.** `main` is untouched. Merging `next` into `main` at release time is a separate maintenance step owned by the doc site repo, documented in that repo's `README_DEPLOY.md`.
- **Nothing in this repo is pushed on that authorisation.** The `done_` moves are committed locally as the loop runs; the pull request for them is a separate ask.
- **It expires with the batch.** The next request starts from the default: branch, implement, verify, stop.

### 8. Report, as live URLs

Report **after the change is on `next`**, not while it sits on a branch, and report in two views because they answer different questions.

**Per doc site page** — this is the one that makes the change reviewable without diffing the branch. For every page created or edited, give a **URL the user can click**, not a page path:

| Page                                                                | Created / edited | What changed                                                | From which draft                   |
| ------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------- | ---------------------------------- |
| <https://next.butler-sheet-icons-docs.pages.dev/reference/commands> | Edited           | New "Exit codes" section, documenting 141 alongside 0 and 1 | `piping-output-to-head-or-less.md` |

Cloudflare Pages builds every branch, and `next` is served at `next.butler-sheet-icons-docs.pages.dev`. Link the **specific page**, deep — a reader should not have to navigate to the section under review. Where a change is a new section on a long page, link its anchor.

Two things worth saying alongside the links:

- The build takes a minute or two after the merge, so a URL given immediately may 404 briefly.
- If reporting on an unmerged branch instead, read the branch alias from the Cloudflare check run rather than constructing it — it is lowercased, non-alphanumerics become `-`, and it is **truncated to 28 characters**, so a guessed URL 404s. The doc site repo's `CLAUDE.md` has the command.

**Per draft** — what was corrected against the implementation, and where the content ended up. Say explicitly which of the draft's claims turned out to be wrong; that is the part which stops the same error being reintroduced later.

Also state that `npm run docs:build` passed.

Then **stop and wait for approval of that page** before touching the next draft.

### 9. Mark the draft as published

**Only once the user has approved the published page.** Move the file to `docs/to-doc-site/done/` with the `done_` prefix added, using `git mv` so history follows the file. See "Processing status" above. This applies to files that were approved and deliberately skipped as well as to files that were published.

A file that was **not approved** is not processed. Leave it unprefixed and in place — it is still pending, and it is the next thing to revise, not to move on from.

Where the draft contained a claim that turned out to be wrong, add a short HTML comment recording the correction before moving it, so a later reader of `done/` does not trust it.

#### Re-read the draft against `main` before moving it

**A draft can be rewritten while it is being published.** Publishing a batch takes hours or days; the feature it describes is often still being worked on, and the person working on it updates the draft. Archiving the version you started from then buries content nobody has published, in the one folder nobody re-reads.

Before each `git mv`, check the file against current `main`:

```bash
git fetch upstream main && git diff HEAD..upstream/main -- docs/to-doc-site/<draft>.md
```

If it has changed, **do not archive it**. Treat it as pending again: read the new version, publish what is new, and check whether anything already on the site has been contradicted. Quotes are the usual casualty — a prompt or a log line reworded in the same commit that expanded the draft.

This is not hypothetical. In the 5.0.0 batch, `creating-thumbnails-interactively.md` gained about 130 lines mid-pass and two of the strings already published from it were reworded in the code at the same time. The archive commit hit a merge conflict, which is the only reason it was caught.

Then start the next draft at step 2.

### 10. Close the pass

When every draft in scope is done, weigh what is left — rough cost, value, and one recommended next step. Files left unapproved are part of what is left; list them.

## Ownership

These files are maintained by the Butler Sheet Icons core team. Pull requests and issues are welcome.
