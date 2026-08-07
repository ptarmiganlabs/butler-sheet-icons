# Fixed: a single sheet with missing layout data no longer fails the whole app

**Applies to:** all commands that read an app's sheets — `create-sheet-thumbnails` and `remove-sheet-icons`, on both Qlik Sense Enterprise on Windows and Qlik Sense Cloud

::: warning Requires BSI 3.12.0 or later
In earlier versions, one sheet with missing layout data stopped Butler Sheet Icons from processing the app at all.
:::

## Summary

Butler Sheet Icons sorts an app's sheets into their display order before doing anything with them, so that sheet 1 is the first sheet in the app. If the Qlik Sense engine returned a sheet without its layout data — the part that carries the sheet's position in the app and its show condition — that sorting step failed. Because sorting happens before any per-sheet handling, **the whole app was abandoned before a single thumbnail was created or removed.** Every other sheet in the app was left untouched.

Such sheets are now sorted to the end of the list and processed normally, so the app completes.

## How to tell if this affected you

The run failed for the whole app, and the log contained an error ending in:

```
TypeError: Cannot read properties of undefined (reading 'rank')
```

Search your logs for `reading 'rank'` — that phrase is the same in every case. The text in front of it varies by platform and by the stage the run had reached:

| Platform | Stage | Log line begins |
|---|---|---|
| Qlik Sense Cloud | Creating thumbnails | `CLOUD APP (stack):` |
| Qlik Sense Cloud | Applying thumbnails to sheets | `CLOUD UPDATE SHEETS (stack):` |
| Qlik Sense Cloud | Removing sheet icons | `CLOUD REMOVE SHEET ICONS 1 (stack):` |
| Enterprise on Windows | Creating thumbnails | `QSEOW: qseowProcessApp (stack):` |
| Enterprise on Windows | Applying thumbnails to sheets | `QSEOW UPDATE SHEETS (stack):` |
| Enterprise on Windows | Removing sheet icons | `QSEOW: removeSheetIconsQSEoWApp (stack):` |

A closely related failure, `reading 'showCondition'`, is fixed by the same change and is worth searching for too. It struck slightly later in the run — after thumbnails had been generated but before they were uploaded, so the work was still discarded.

If you saw either error, re-run the command; the affected apps should now complete.

## What causes a sheet to be missing its layout data

This is uncommon, and it comes from Qlik Sense rather than from Butler Sheet Icons. It has been seen with sheets that are partially created or partially deleted, and with sheets whose owner no longer exists.

Butler Sheet Icons now treats such a sheet as an ordinary sheet: it appears at the end of the sheet list and gets a thumbnail like any other. It is named in the log as it is processed, so you can still find it in Qlik Sense if you want to repair or delete it.

## A note on sheet numbering

Sheet numbers — used by `--exclude-sheet-number` and `--blur-sheet-number`, where 1 is the first sheet in the app — come from this sort order. Because sheets with missing layout data are now placed at the end of the list, **sheet numbering can differ from before in an app that contains one.**

In practice there is nothing to migrate, because those apps were failing outright before. But if you use `--exclude-sheet-number` or `--blur-sheet-number` on an app that used to hit this error, check the sheet numbers in the log of the first successful run before relying on them.

Apps whose sheets all have complete layout data are numbered exactly as before.

## What is not covered

This change deals with sheets missing their **layout data**. A sheet missing its **title and description** (a different part of the sheet record) can still interrupt a run. That case is less common and is being addressed separately.
