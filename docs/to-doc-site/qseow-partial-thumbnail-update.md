# A QSEoW app with one unusable sheet now updates the rest

Until now, if Butler Sheet Icons could not capture one sheet in a Qlik Sense Enterprise on Windows
app, it abandoned the whole app. No thumbnails were uploaded and nothing in the app changed — a
single unreachable sheet discarded the work done on every other sheet in it.

That is no longer the case. The sheets that were captured successfully are uploaded and applied. The
sheet that failed keeps whatever icon it already had.

::: warning Requires BSI 5.0.0 or later
In earlier versions, one failed sheet meant the app was left completely untouched.
:::

## What you will see

The app is still reported as failed, and the run still finishes with a non-zero exit code. Nothing
about how failures are counted has changed — only how much work survives one.

The error names how many sheets could not be done, out of how many were attempted:

```
Failed to create a thumbnail for 1 of 9 sheet(s) in app a1b2c3d4-...
```

Alongside it, the run report shows the sheets that were updated, so the account of what changed is
accurate rather than reporting zero for work that was done.

## Why this changed

Qlik Sense Cloud has always behaved this way. Butler Sheet Icons was doing two different things on
two platforms for the same failure, and the Windows behaviour was the accidental one — a consequence
of how its sheet loop was written rather than a decision anyone made. The two now match.

## What this means for you

**If a scheduled job reported failure and you assumed nothing had changed, check again.** A failed
run can now have applied thumbnails to some sheets. That is the intended improvement — losing eight
good thumbnails because the ninth sheet was slow to render helped nobody — but it is a change in what
a failed run leaves behind.

If a sheet fails repeatedly, the usual causes are worth checking in this order:

| Cause                                                 | What to try                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| The sheet takes longer to render than BSI waits       | Raise `--pagewait`, and see the browser timeout options             |
| The sheet is empty, broken, or errors in Sense itself | Open it in a browser as the same user BSI signs in as               |
| The whole app is affected, not one sheet              | This is usually authentication or the engine session, not the sheet |

::: tip A sheet that fails keeps its existing icon
It is never left pointing at an image that was not created. If the sheet had a thumbnail before the
run, it still has that one afterwards.
:::
