# Docs Staging: `to-doc-site`

Files in this folder are drafts of updates to the Butler Sheet Icons (BSI) documentation site. They are written and reviewed here, then published to the doc site repository.

This folder is a **staging area, not the published source**. The published site lives in a separate repository:

| | |
|---|---|
| Published site | <https://butler-sheet-icons.ptarmiganlabs.com> |
| Source repo | <https://github.com/ptarmiganlabs/butler-sheet-icons-docs> |
| Local clone | `/Users/goran/code/butler-sheet-icons-docs` |
| Site generator | [VitePress](https://vitepress.dev) |
| Hosting | Cloudflare Pages — builds and publishes automatically on every push |
| `main` branch | Documents the **currently released** BSI version. Public. |
| `next` branch | Documents the **upcoming, unreleased** BSI version. Preview URL only. |

The doc site is **single-version**: one copy of the docs, no per-release archive. Anything merged to its `main` is published to the public site within minutes and is presented as documentation for the current release, whatever version it actually describes. Choosing the right branch is therefore part of publishing — see "Git workflow" below.

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

This is the standing instruction for "update the doc site from `docs/to-doc-site`". Work through every unprefixed file directly in this folder. Ignore the `done/` subfolder — it is already processed.

### 1. Review each file critically

For each unprefixed file, answer three questions before writing anything:

1. **Should it be published at all?** Some drafts describe internal refactors, or behaviour that never reaches a user. Some are already covered on the site. Some describe behaviour that has since changed again. Say so and process the file into `done/` without publishing rather than adding noise to the site.
2. **Where does it fit?** See "Site structure" below. Strongly prefer **editing an existing page** over adding a new one — a fact stated in two places drifts out of sync. A draft's suggested target page is a starting point, not a decision.
3. **What is the right wording and cross-linking?** Rewrite in the doc site's voice rather than pasting the draft. Add cross-links both ways: from the concept page to the reference page, and back.

### 2. Verify every claim against the implementation

**Do not trust the draft.** Drafts are written from intent and can be wrong about detail. Read the actual source in this repo and confirm:

- Exact CLI flags, defaults, and environment variable names (`src/lib/commands/`)
- Exact log and error message text — quote it verbatim so admins can search for it
- What actually triggers a behaviour, including the failure paths

Correct the draft's technical errors in the published page. If a processed file is left in `done/` with a claim that turned out to be wrong, add a short HTML comment noting the correction so the error does not resurface later.

### 3. Establish which BSI version the behaviour ships in

Two later decisions depend on this: the version gate on the page, and **which doc site branch the change goes to**. Determine it before writing.

- **Already released** — the behaviour is in the latest published GitHub release of this repo.
- **Not released yet** — the change is merged to `main` here but still sits in the open `release-please` PR. That PR's title states the upcoming version (`chore(main): release butler-sheet-icons X.Y.Z`), which follows from the unreleased commit types. Do not guess a bump, and do not invent a version number.

Most drafts in this folder are written right after the feature is implemented, so **"not released yet" is the common case.**

The doc site describes the released product, and readers may be several versions behind. When a page documents behaviour that changed, gate it:

```markdown
::: warning Requires BSI X.Y.Z or later
In earlier versions ...
:::
```

### 4. Site structure

Content lives under `docs/` in the doc site repo:

| Directory | Contents |
|---|---|
| `docs/guide/` | Tutorials and conceptual explanation — including `concepts/`, `configuration/`, `advanced/`, and `troubleshooting.md` |
| `docs/reference/` | Complete command and option reference |
| `docs/examples/` | Practical, copy-paste ready examples |

A **new page** also needs a sidebar entry in `docs/.vitepress/config.js`. A page with no sidebar entry is reachable only by search.

Where a topic naturally spans page types, cover it in all three: the concept page explains *why*, the reference page states the *facts* per command, and troubleshooting handles *symptom → cause → fix*.

VitePress conventions used on the site:

- Internal links are absolute and extensionless: `[text](/guide/concepts/browser-management)`
- Callouts: `::: tip` / `::: warning` / `::: danger`, closed with `:::`
- Per-shell examples use `::: code-group` with ` ```powershell [PowerShell] ` and ` ```bash [Bash] ` fences

### 5. Verify the build

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

### 6. Git workflow

Both repositories follow the same rule: **branch first, implement, verify, then stop and report.**

#### Which doc site branch to target

Decided by step 3, not by convenience:

| Behaviour being documented | Branch off | PR into |
|---|---|---|
| Already in the latest BSI release | `main` | `main` |
| Not released yet (still in the open `release-please` PR) | `next` | `next` |

Getting this wrong has a real consequence in one direction: the doc site is single-version and Cloudflare Pages publishes `main` automatically, so unreleased documentation merged to `main` goes live on the public site immediately — labelled with the *previous* version number, describing a version nobody can download yet. `next` publishes to a preview URL instead and is merged into `main` when the BSI release actually ships.

If a draft mixes released and unreleased material, split it: the released part can go to `main`, the rest to `next`. Do not hold back a correction to shipped documentation because it happens to sit next to a new feature.

#### Rules

- Create a feature branch in the doc site repo off an up-to-date `main` **or** `next` before the first edit. Never work directly on either.
- Do the doc site edits and the `done/` moves in this repo as separate branches — they are separate repositories and separate pull requests.
- **Never commit, push, open a pull request, or merge unless explicitly asked.** Authorisation is per request and does not carry over.
- Commit messages in both repos use [Conventional Commits](https://www.conventionalcommits.org/). Doc site changes are `docs:`.

Merging `next` into `main` at release time is a separate maintenance step owned by the doc site repo, not part of a publishing pass. It is documented in that repo's `README_DEPLOY.md`.

### 7. Mark the drafts as published

Move each processed file to `docs/to-doc-site/done/` with the `done_` prefix added, using `git mv` so history follows the file. See "Processing status" above. This applies to files that were deliberately skipped as well as to files that were published.

### 8. Report

State per file: published or skipped, which pages changed, **which doc site branch it went to and why**, what was corrected against the implementation, and that the build passed. Then weigh what is left — rough cost, value, and one recommended next step.

## Ownership

These files are maintained by the Butler Sheet Icons core team. Pull requests and issues are welcome.
