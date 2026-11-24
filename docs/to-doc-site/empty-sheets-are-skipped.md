# Empty sheets are skipped instead of failing the app

**Target pages:** the sheet-exclusion section of the guide (where sheets hidden by a show condition are described), and the troubleshooting entry `Failed to create a thumbnail for N of M sheet(s) in app <id>`.

## What changed

A sheet with no objects on it, such as a sheet someone created and never filled, is now skipped. Butler Sheet Icons does not capture it, does not upload anything for it, and does not change its thumbnail: whatever thumbnail the sheet had before stays.

Earlier versions tried to capture it. An empty sheet does not show a sheet at all: Qlik Sense shows its "Choose an option below to get started adding to this sheet..." placeholder instead. That placeholder has none of the page elements that `--includesheetpart 1`, `2` and `3` capture, so Butler Sheet Icons waited for an element that never appeared and then failed the **whole app**:

```text
QSEOW APP: Failed to create a thumbnail for sheet 3 ('My new sheet (1)', ID ZPzdFc) in app <app-id>: Waiting for selector `#grid-wrap` failed
QSEOW PROCESS APP: Failed to process app <app-id>: Failed to create a thumbnail for 1 of 3 sheet(s) in app <app-id>
```

This applies to both Qlik Sense Enterprise on Windows and Qlik Sense Cloud, and to every `--includesheetpart` value, so an empty sheet is treated the same way whichever part you capture.

There is no option for it, in the same way as sheets hidden by a show condition are always skipped.

## What you see

A dry run lists the sheet as skipped, with the reason:

```text
   #  Sheet                    Would do
   1  My new sheet             update
   2  Claude generated charts  update
   3  My new sheet (1)         skip  (no objects on the sheet)
```

A real run counts it as excluded:

```text
  sheet  3/3  excluded  'My new sheet (1)'  (no objects on the sheet)
...
RESULT  ok
  sheets        3 seen, 2 captured, 1 excluded
```

If the sheet is also excluded by an option you passed, such as `--exclude-sheet-number`, the run names that option instead, since it is the reason you asked for.

Once objects are added to the sheet, the next run captures it like any other.
