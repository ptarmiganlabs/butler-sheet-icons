# The removal dry run's summary now counts sheets the way the real run does

> **Publisher notes (not for the site):**
>
> 1. This is a small correction to pages that already exist. Nothing new is introduced, so it needs **no new page** — the target is one added sentence plus a corrected sample transcript on `/guide/concepts/dry-run` (the `remove-sheet-icons` paragraph, currently near "For the two `remove-sheet-icons` commands the column reads `clear icon` instead") and, if a transcript is shown there, `/reference/qseow.md` and `/reference/qscloud.md`.
> 2. Both platforms are affected — `qseow remove-sheet-icons` and `qscloud remove-sheet-icons` print the same summary line.
> 3. The archived draft `done/done_qseow-remove-sheet-icons.md` in this folder contains a sample transcript with the **old, wrong** summary line. Do not reuse that transcript.
> 4. Version gate: read the open release-please PR title at publish time. As of writing, the pending release was 5.0.0.

## What changed

When `remove-sheet-icons` is run with `--dry-run`, the summary line at the end of the plan used to count every sheet it listed as an icon that would be cleared — including sheets that have no icon at all.

That contradicted the plan's own per-sheet rows, which correctly marked those sheets `(no icon currently set)`, and it contradicted the real run, which reports them separately.

On an app with nine sheets, eight of which carry icons:

**Before**

```
   #  Sheet                 Would do
   1  Sheet 0 (hidden)      clear icon  (no icon currently set)
   2  Sheet 1               clear icon
   ...

Summary: 1 app(s), 9 sheets. 9 icon(s) would be cleared, 0 skipped.
```

**Now**

```
   #  Sheet                 Would do
   1  Sheet 0 (hidden)      clear icon  (no icon currently set)
   2  Sheet 1               clear icon
   ...

Summary: 1 app(s), 9 sheets. 8 icon(s) would be cleared, 1 with no icon, 0 skipped.
```

The real run on the same app reports the matching split:

```
  sheets        9 seen, 8 icon(s) cleared, 1 had no icon
```

The `with no icon` part appears only when there is at least one such sheet, so a plan in which every sheet carries an icon is unchanged: `Summary: 1 app(s), 2 sheets. 2 icon(s) would be cleared, 0 skipped.`

## Why it matters

The summary is the line most likely to be read, quoted in a change request, or pasted into a ticket. A plan promising nine cleared icons followed by a run reporting eight invites a second run to find out what went wrong — when in fact nothing had.

It also matters for the repeat case. Running `remove-sheet-icons` a second time over an app it has already cleared writes nothing, and the plan now says so plainly rather than appearing to promise a fresh sweep:

```
Summary: 1 app(s), 9 sheets. 0 icon(s) would be cleared, 9 with no icon, 0 skipped.
```

## What did not change

- No sheet is treated differently. This affects **reporting only** — which sheets get cleared, and what is written to the server, are exactly as before.
- The per-sheet rows are unchanged.
- The summary printed by the thumbnail-creation commands (`create-sheet-thumbnails`) is unchanged, in both wording and numbers.
