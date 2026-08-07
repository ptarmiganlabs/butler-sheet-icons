# Fixed: `--exclude-sheet-number` and `--blur-sheet-number` affected the wrong sheets

**Applies to:** `qseow create-sheet-thumbnails` and `qscloud create-sheet-thumbnails`

**Options affected:** `--exclude-sheet-number`, `--blur-sheet-number` (and their environment variables)

::: warning Requires BSI 3.12.0 or later
In earlier versions these two options selected the wrong sheets. See "Who was affected" below — if you use either option, your existing thumbnails may need regenerating after upgrading.
:::

## Summary

Butler Sheet Icons was reading these two options incorrectly. Two things went wrong at once:

1. **Only the last number you listed was kept.** `--exclude-sheet-number 1 2 12` behaved as though you had written `--exclude-sheet-number 12`. Sheets 1 and 2 were processed anyway.
2. **Numbers were matched as text fragments rather than as whole sheet numbers.** Because of this, `--exclude-sheet-number 12` also excluded sheet 1 and sheet 2 — any sheet whose number appears as a fragment of the number you asked for.

Both options now behave as documented. Every number you list is kept, and each is matched as a whole sheet number.

## Who was affected

You were affected if you used `--exclude-sheet-number` or `--blur-sheet-number` (or the matching environment variables) with **either**:

- more than one number, **or**
- a single number of two or more digits.

A single one-digit number — for example `--exclude-sheet-number 3` — was handled correctly, because there is no other sheet number hiding inside "3".

The more digits in the number, the more sheets were wrongly affected. `--exclude-sheet-number 123` also excluded sheets 1, 2, 3, 12 and 23.

## What this looked like in practice

Say an app has 15 sheets, and you ran:

```
butler-sheet-icons qseow create-sheet-thumbnails ... --exclude-sheet-number 12
```

**Before this fix:** sheets 1, 2 and 12 were all skipped. Sheets 1 and 2 kept whatever icons they already had, and the run finished without an error.

**After this fix:** only sheet 12 is skipped. Sheets 1 and 2 get new thumbnails as expected.

The same applies to `--blur-sheet-number`: sheets you never asked to blur were being blurred.

## How to confirm which sheets were affected

Butler Sheet Icons has always listed each skipped sheet in its log at the default log level, so an existing log from an earlier run tells you exactly what happened. Look for lines beginning:

```
Excluded sheet: 1: 'Sales overview', ...
```

Any sheet number in that list that you did not ask to exclude was wrongly skipped. For blurring, the equivalent line begins:

```
Using blurred thumbnail for sheet 1: ...
```

There was no error or warning to draw attention to it — the run reported success — so this is worth checking deliberately rather than expecting to have noticed it at the time.

## What you should do

**Re-run your thumbnail generation.** Sheets that were wrongly excluded still have their old icons, and sheets that were wrongly blurred still have blurred icons. Neither corrects itself until Butler Sheet Icons runs again.

**Re-check your options first.** If you had previously worked around this behaviour — for example by listing sheet numbers one run at a time, or by choosing sheet numbers that avoided the overlap — those workarounds are no longer needed and may now produce the wrong result. Options such as `--exclude-sheet-title` or `--exclude-sheet-status` are unaffected and always worked correctly.

## Using the options

Both options take one or more whole numbers, separated by spaces, where **1 is the first sheet in the app**:

```
--exclude-sheet-number 1 2 12
--blur-sheet-number 4 7
```

A value that is not a non-negative whole number is rejected before Butler Sheet Icons connects to Qlik Sense:

```
error: option '--exclude-sheet-number <number...>' argument 'abc' is invalid. Exclude sheet number must be a non-negative integer.
```

### Environment variables

The same options can be set through environment variables:

| Command | Option | Environment variable |
|---|---|---|
| `qseow create-sheet-thumbnails` | `--exclude-sheet-number` | `BSI_QSEOW_CST_EXCLUDE_SHEET_NUMBER` |
| `qseow create-sheet-thumbnails` | `--blur-sheet-number` | `BSI_QSEOW_CST_BLUR_SHEET_NUMBER` |
| `qscloud create-sheet-thumbnails` | `--exclude-sheet-number` | `BSI_QSCLOUD_CST_EXCLUDE_SHEET_NUMBER` |
| `qscloud create-sheet-thumbnails` | `--blur-sheet-number` | `BSI_QSCLOUD_CST_BLUR_SHEET_NUMBER` |

An environment variable holds **one** sheet number. This has always been the case and is unchanged by this fix — to exclude or blur several sheets, use the command-line option instead.

## Other options are not affected

The remaining sheet-selection options — `--exclude-sheet-status`, `--exclude-sheet-tag`, `--exclude-sheet-title`, `--blur-sheet-status`, `--blur-sheet-title` — were never affected by this problem and need no action. Every option that accepts multiple values was checked; these two were the only ones with the fault.
