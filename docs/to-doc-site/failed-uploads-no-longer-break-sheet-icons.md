# Fixed: a failed image upload no longer replaces working sheet icons with broken ones

**Applies to:** `qseow create-sheet-thumbnails` and `qscloud create-sheet-thumbnails`

::: warning Requires BSI 3.12.0 or later
In earlier versions, an app whose thumbnail images failed to upload had its sheet icons replaced with broken images, and the run gave no sign that anything had gone wrong.
:::

## Summary

Butler Sheet Icons generates thumbnail images, uploads them to Qlik Sense, and then updates each sheet to point at its uploaded image. If the upload step failed — an image rejected as too large, a content library that could not be written to, a dropped connection partway through — Butler Sheet Icons carried on to the last step anyway.

The result was the worst possible outcome: **every sheet was repointed at an image that was not there.** Sheets that previously had perfectly good icons were left showing broken ones, and the run reported no error.

Butler Sheet Icons now stops after a failed upload and leaves the app's sheets alone, so they keep the icons they already had.

## What you will see now

If any image fails to upload, the app is left untouched and the log records why. On Qlik Sense Cloud:

```
CLOUD APP (stack): CloudError: Failed to upload 2 of 5 thumbnail image(s) to Qlik Sense Cloud app abc-123
```

On Qlik Sense Enterprise on Windows:

```
QSEOW: qseowProcessApp (stack): QseowError: Failed to upload 2 of 5 thumbnail image(s) to content library BSI thumbnails
```

The individual upload failures are logged too, immediately above, prefixed `CLOUD UPLOAD 1` or `QSEOW UPLOAD 1`. Those lines name the underlying reason — that is where to look for the actual cause.

Butler Sheet Icons still attempts every image before stopping, so one failure does not hide the others. The count in the message tells you how widespread the problem is.

## What to do about it

1. **Your sheets are safe.** Nothing was changed in the app, so its existing icons are intact. There is no cleanup to do.
2. **Read the `UPLOAD 1` lines** to find out why the upload was refused. Common causes are an image larger than the tenant or server accepts, a content library name that does not exist or cannot be written to by the account Butler Sheet Icons is using, and network interruptions.
3. **Fix the cause and re-run.** The command is safe to run again.

## Recovering apps affected before the upgrade

If earlier runs left apps showing broken sheet icons, re-running `create-sheet-thumbnails` against those apps repairs them, provided the upload problem itself has been resolved. If you would rather clear the icons than regenerate them, `qscloud remove-sheet-icons` removes them on Qlik Sense Cloud.

## A note on exit codes

Butler Sheet Icons still exits with code 0 in this situation. If you run it from a scheduled job or pipeline, **checking the exit code will not tell you that an app failed** — check the log for the lines above instead. Making the exit code reflect failures is a separate change that has not shipped yet.
