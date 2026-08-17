# The run card: plan, progress and verdict on every thumbnail run

**Status:** pending publication
**Suggested target pages:** `/guide/concepts/` (new page or section on run output), `/reference/qseow`, `/reference/qscloud`, `/guide/troubleshooting`
**Version gate:** not released yet — read the open release-please PR title for the version before publishing. Do not copy a version number from this draft.

---

## What changed, in one paragraph

Every `qseow create-sheet-thumbnails`, `qscloud create-sheet-thumbnails` and `qscloud remove-sheet-icons` run now prints a *run card*. Both dry and real runs open with a framed header and a **PLAN** block before anything is changed. A **real** run then adds countable **progress** lines while it works (`app 2/3`, `sheet 4/11`) and closes with a **RESULT** verdict; a **dry** run instead ends with the per-sheet decision report the dry-run feature already prints (no RESULT block — nothing was attempted, so there is no outcome to judge). The output is plain text through the normal log stream, so it lands unchanged in a file redirected from Windows Task Scheduler, in `docker logs`, and in CI transcripts. No new options are needed; there is nothing to configure.

## Why administrators should care

Butler Sheet Icons overwrites sheet thumbnails in place, with no undo. Until now a run announced a version number and started writing: which apps were selected and why, what the exclude and blur rules actually matched, and where the images would go were all discoverable only by watching them happen. A run in which 20 thumbnails were written and a run in which a mistyped tag matched nothing ended identically — silently, both with exit code 0.

The run card answers the three questions a run raises, in order:

| Moment | Question it answers |
| --- | --- |
| PLAN | What is about to be changed, where, and why those apps? |
| Progress | Is it alive, how far in, and on what? |
| RESULT | What actually changed, and did it work? |

## What a run looks like now

Sample generated from the real renderer (QSEoW, three apps selected by a tag plus one named directly). Shown with log timestamps disabled — see [Log timestamps](#interaction-with-bsi_log_timestamps) below.

```text
============================================================
 BUTLER SHEET ICONS x.y.z -- QSEoW sheet thumbnails
============================================================

PLAN
  server        sense.company.com   https, no virtual proxy
                engine 4747, qrs 4242, schema 12.612.0
  api user      INTERNAL\sa_api via ./cert/client.pem
  logon user    COMPANY\bsi_svc
  apps          3   1 named by --appid, 3 matched by --qliksensetag "sheet-thumbnails", 1 selected twice
  sheet part    2 of 4 -- objects + sheet title
  exclude       tag "no-thumbnail" (0 sheets), number 1
  blur          tag "confidential" (2 sheets)
  browser       chrome (version: recommended), headless, 5s per sheet
  images        ./img/qseow/<app-id>
  uploads to    content library "Butler sheet thumbnails"
  WILL OVERWRITE existing sheet thumbnails in 3 app(s), 2 of them published

app 1/3  c840670c-7178-4a5e-8c5d-2d3e5b0f9a12
  "Sales Discovery" -- 11 sheet(s), published
  sheet  1/11  excluded  'Scratch pad'  (--exclude-sheet-number)
  sheet  2/11  captured  'Overview'
  sheet  3/11  blurred   'Board pack'  (--blur-sheet-tag)
  sheet  4/11  captured  'Revenue by region'
  ...
  uploaded 20 image file(s) to content library "Butler sheet thumbnails"
  updated 10 of 11 sheet(s) with new thumbnails

  ...two more apps...

RESULT  ok
  apps          3 ok, 0 failed
  sheets        25 seen, 22 captured (2 blurred), 3 excluded
  thumbnails    22 sheet(s) given new thumbnails in content library "Butler sheet thumbnails"
  images kept   ./img/qseow   44 file(s), 2.6 MB
  elapsed       4m 41s
============================================================
```

Points worth calling out on the published page:

- **The match counts in the PLAN block include zeroes.** `tag "no-thumbnail" (0 sheets)` printed before the first write is the cheapest possible "check your spelling" — a mistyped tag used to produce a run byte-identical to one where the option was never passed. (Match counts are shown for tag rules on QSEoW; number, title and status rules are listed without counts because they are evaluated per sheet during the run. Qlik Sense Cloud has no sheet tags, so its plans show only number, title and status rules.)
- **The `WILL OVERWRITE` line is the warning there was no room for before.** There is no undo for a thumbnail update. On a dry run the same line reads `WOULD OVERWRITE`. For `qscloud remove-sheet-icons` it reads `WILL REMOVE sheet icons and thumbnail media files from N app(s)`.
- **Progress is countable.** A run that hangs now hangs somewhere nameable. Sheet lines print when a sheet *completes* — they state facts, not intentions — so a hang is on the sheet **after** the last printed line: a log ending at `sheet  7/11  captured ...` means the run is stuck working on sheet 8 (a log with an `app 2/3` line and no sheet lines yet is stuck opening that app or capturing its first sheet). Every sheet line names the option responsible for a non-default decision.
- **The RESULT block is new.** There was previously no success summary at all. `RESULT  FAILED` with `1 ok, 1 failed` also appears when some apps failed — the per-app error lines above it carry the details. A selection that matched nothing ends with `RESULT  FAILED` and `apps  0 selected - nothing was done`, and the run exits 1 as before. **Scope of the guarantee:** the PLAN and RESULT blocks render once app processing is reached. A run that aborts before that point — a failed connection test, missing certificates, a missing content library, an invalid option — exits 1 with the header and the error lines but **no RESULT block**, so a wrapper script should treat exit code 1 as the failure signal and the RESULT line as a summary, not as the only marker.
- **The `browser` line shows the version as requested** (for example `recommended` or a pinned build id). The build actually used is still logged at launch, since resolving it may involve the download cache or the network.
- The PLAN block appears after the first few connection lines (certificate check, content library check, tag lookup) because the app selection has to be resolved first — but always **before anything is written**.

## Plain ASCII on purpose

The frame — headings, rules, labels — is deliberately plain ASCII with no colour, so the run card survives legacy Windows consoles, non-UTF-8 code pages, and redirection to files, byte for byte. App and sheet names are your data and are printed exactly as they are, including any non-ASCII characters.

## Interaction with BSI_LOG_TIMESTAMPS

Each line goes through the normal log stream, so by default it carries the timestamp-and-level prefix. The blocks line up either way, but the card is easiest to read with the prefix off, which is what the samples above show:

::: code-group

```powershell [PowerShell]
$env:BSI_LOG_TIMESTAMPS = "false"
butler-sheet-icons.exe qseow create-sheet-thumbnails --host sense.company.com ...
```

```bash [Bash]
BSI_LOG_TIMESTAMPS=false ./butler-sheet-icons qseow create-sheet-thumbnails --host sense.company.com ...
```

:::

Cross-link this to the existing `BSI_LOG_TIMESTAMPS` documentation. In a scheduler that already timestamps every captured line, disabling the built-in prefix avoids double timestamps and keeps the plan and verdict columns aligned.

## Log levels

- On a **dry run**, the plan and the dry-run report are the product of the command, so they are printed even at `--log-level warn` or `error` (unchanged from the dry-run feature).
- On a **real run**, the whole run card — header, PLAN, progress and RESULT — logs at `info`. A real run of the three thumbnail commands at `--log-level warn` stays quiet — choosing a quiet level is respected. (The other commands — `browser`, `doctor`, `qscloud list-collections` — print their header regardless of level, as the `App version:` line always did.)
- At `--log-level verbose` and below, the detailed per-sheet lines (sheet id, engine sheet id, description, approved, published, hidden) are still available — they moved there rather than being removed.

## Breaking change: log lines that scripts may grep for

This is worth a release-note callout and a troubleshooting entry. Anyone parsing Butler Sheet Icons logs should note:

| Before | Now |
| --- | --- |
| `App version: <version>` (printed by every command) | The framed header: `BUTLER SHEET ICONS <version> -- <job>` |
| `--------------------------------------------------` + `About to process app <id>` | `app 1/3  <id>` (dry runs: `plan app 1/3  <id>`) |
| `App name: "..."` / `App is published: ...` / `Number of sheets in app: N` at info | One line: `"App name" -- N sheet(s), published` (individual lines still at verbose) |
| `Processing sheet 1: '...', sheet id '...', engine sheet id '...', ...` (~230 columns) | `sheet  1/11  captured  '...'` (long form at verbose) |
| `Excluded sheet: 1: '...'` | `sheet  1/11  excluded  '...'  (--exclude-sheet-...)` |
| `Done processing app <id>` at info | At verbose; the RESULT block closes the run instead |
| `Uploading images to Qlik Sense content library: ...` / `Uploading images in folder: ...` (QSEoW) | `uploaded N image file(s) to content library "..."` (details at verbose) |
| `Uploading images in folder: ...` / `Uploading file: <name>` (Cloud, per file at info) | `uploaded thumbnails for N sheet(s) to the app's media library` (per-file lines at verbose) |
| `Number of sheets: N` / `Using blurred thumbnail for sheet N: ...` / `Using regular thumbnail for sheet N: ...` / `Skipping update of sheet N: ...` (update step, both platforms) | `updated N of M sheet(s) with new thumbnails` (per-sheet choices at verbose; the sheet lines above already say `blurred`) |
| `Removing icon for sheet N: Name '...', ID ..., description '...'` (qscloud remove-sheet-icons, per sheet at info) | `sheet  1/9  cleared  '...'` or `sheet  2/9  no icon  '...'  (no icon currently set)` (long form at verbose) |
| nothing (remove-sheet-icons media cleanup was silent at info) | `deleted N thumbnail media file(s) from the app media library` per app |
| nothing | `RESULT ok` / `RESULT FAILED` block closing every real run **that reaches app processing** (pre-loop aborts exit 1 with error lines and no RESULT — key wrappers on the exit code) |

Exit codes are unchanged: 0 on success, 1 when anything failed or the selection was empty.

## Publisher notes

- Samples in this draft were generated from the real renderer (`renderRunPlanLines` / `renderRunVerdictLines`); regenerate rather than hand-edit if the renderer changes before publication. The version in the header sample is deliberately `x.y.z` — keep it a placeholder or trim the header, per the no-version-bearing-lines rule.
- **No CLI options were added, removed or changed by this feature**, so no generated `<!-- generated:cli-options -->` table goes stale from it. Run the usual `--check` across touched reference pages anyway before merging.
- The pending drafts `dry-run.md` and `log-timestamps-switch.md` in this folder describe the same commands and both remain unpublished. `dry-run.md` has already been updated for this change (its `App selection:` line moved into the PLAN block, which dry runs print before the app loop). Publish in dependency order: `log-timestamps-switch.md`, then `dry-run.md`, then this page — each later page links to concepts the earlier ones introduce.
