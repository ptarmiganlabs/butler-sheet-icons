# See what a run would change before it changes anything: --dry-run

> **Publisher note:** new page — it needs a sidebar entry in `docs/.vitepress/config.js`,
> suggested next to the reference pages for the three commands it covers. Adding
> `--dry-run` also made three generated CLI option tables stale; regenerate them with
> `scripts/docs-cli-tables.js` for `qseow create-sheet-thumbnails`,
> `qscloud create-sheet-thumbnails` and `qscloud remove-sheet-icons` before publishing.
> Establish the version for the gate below from the open release-please PR title at
> publication time, per this folder's README. The sample report below is generated from
> the real renderer — do not re-align it by hand.

::: warning Requires BSI X.Y.Z or later
Earlier versions do not have the `--dry-run` option.
:::

Three Butler Sheet Icons commands change Qlik Sense apps in place, with no undo:

- `qseow create-sheet-thumbnails` (see [/reference/qseow](/reference/qseow))
- `qscloud create-sheet-thumbnails` (see [/reference/qscloud](/reference/qscloud))
- `qscloud remove-sheet-icons` (see [/reference/qscloud](/reference/qscloud))

All three now accept `--dry-run`. With the flag set, Butler Sheet Icons **does every read
the real run would do — connects, signs in to the APIs, resolves the app list, lists every
sheet, applies every exclude and blur rule — and then stops.** Nothing is captured, uploaded,
overwritten or deleted. Instead it prints the plan: what would happen to every sheet in every
selected app, and which of your options is responsible for each decision.

A dry run announces itself immediately — the log opens with a
`DRY RUN of <command>: planning only - NOTHING WILL BE CHANGED` banner before anything
connects, the run-card `PLAN` block reads `WOULD OVERWRITE …` rather than
`WILL OVERWRITE …`, and each app line reads `plan app 1/2 …` rather than `app 1/2 …`.

## Why you would use it

The dangerous part of a thumbnail run is not the connection settings — a wrong host or a bad
API key fails loudly on the first request. The dangerous part is **sheet selection, which
fails silently** (see [/guide/concepts/sheet-exclusion](/guide/concepts/sheet-exclusion) and
[/guide/concepts/sheet-blurring](/guide/concepts/sheet-blurring)):

- A misspelled `--exclude-sheet-tag` or `--blur-sheet-tag` behaves exactly as if the option
  was never given. For the blur rule that means publishing readable thumbnails you believed
  were blurred.
- `--appid` and the tag/collection selectors are additive: a tag that matches more apps than
  you expected updates more apps than you expected.
- `--exclude-sheet-number` counts sheet positions in Butler Sheet Icons' processing order,
  which is not something you can see in the QMC. An off-by-one is invisible until afterwards.

A dry run makes all three visible before anything is touched.

## Running it

Add `--dry-run` to the exact command line you intend to run — same options, same
environment variables:

::: code-group

```powershell [PowerShell]
.\butler-sheet-icons.exe qseow create-sheet-thumbnails `
    --host sense.company.com `
    --appid a1b2c3d4-0000-4a1b-9c8d-000000000001 `
    --qliksensetag "sheet-thumbnails" `
    --exclude-sheet-status private `
    --exclude-sheet-title "Internal notes" `
    --blur-sheet-tag "confidential" `
    --apiuserdir INTERNAL --apiuserid sa_api `
    --logonuserdir COMPANY --logonuserid svc_bsi --logonpwd password-here `
    --dry-run
```

```bash [Bash]
./butler-sheet-icons qseow create-sheet-thumbnails \
    --host sense.company.com \
    --appid a1b2c3d4-0000-4a1b-9c8d-000000000001 \
    --qliksensetag "sheet-thumbnails" \
    --exclude-sheet-status private \
    --exclude-sheet-title "Internal notes" \
    --blur-sheet-tag "confidential" \
    --apiuserdir INTERNAL --apiuserid sa_api \
    --logonuserdir COMPANY --logonuserid svc_bsi --logonpwd password-here \
    --dry-run
```

:::

`--dry-run` is deliberately **not** available as an environment variable. A `BSI_DRY_RUN`
inherited by a scheduler would silently turn every scheduled run into a no-op — the inverse
of the surprise the flag exists to prevent.

The report always prints, even at `--log-level warn` or `error`: the report is the entire
product of a dry run, so its visibility does not depend on the log level.

## Reading the report

Once the app selection is resolved — and before anything could be written — the dry run
prints the run card's `PLAN` block, with the resolved selection, every rule and its match
count, and the overwrite warning in the conditional:

```
PLAN
  server        sense.company.com   https, no virtual proxy
                engine 4747, qrs 4242, schema 12.612.0
  api user      INTERNAL\sa_api via ./cert/client.pem
  logon user    COMPANY\svc_bsi
  apps          1   1 named by --appid, 1 matched by --qliksensetag "sheet-thumbnails", 1 selected twice
  sheet part    1 of 4 -- sheet objects only
  exclude       title "Internal notes", status private
  blur          tag "confidential" (1 sheets)
  browser       chrome (version: recommended), headless, 5s per sheet
  images        ./img/qseow/<app-id>
  uploads to    content library "Butler sheet thumbnails"
  WOULD OVERWRITE existing sheet thumbnails in 1 app(s), 1 of them published
```

The report then lists every app, every sheet, and the decision with the option responsible.
This is the exact output the command above produces (timestamps trimmed):

```
DRY RUN of qseow create-sheet-thumbnails - nothing will be changed

App 1/1: "Finance operations" (a1b2c3d4-0000-4a1b-9c8d-000000000001)
  7 sheets

   #  Sheet                 Would do
   1  Overview              update
   2  Sales detail          update, blurred  (--blur-sheet-tag)
   3  Scratch               skip  (--exclude-sheet-status private)
   4  Internal notes        skip  (--exclude-sheet-title)
   5  KPI summary           skip  (hidden by show condition)
   6  Regional              update
   7  Notes                 update

Summary: 1 app(s), 7 sheets. 4 would be updated (1 blurred), 3 skipped.
Nothing was changed. Re-run without --dry-run to apply.
```

Things to check before running for real:

- **The `Would do` column.** If you passed a blur option and no row says `blurred`, the rule
  matched nothing — check the tag or title spelling. This situation is exactly what the dry
  run exists to catch.
- **The `apps` line in the `PLAN` block.** If the tag or collection matched more apps than
  you expected, the real run would update more apps than you expected. `selected twice`
  counts apps that were both named and matched — they are processed once.
- **`PLAN INCOMPLETE` or `could not be planned` lines.** If an app or sheet could not be
  read, the report says so explicitly rather than presenting a partial plan as complete.
  The exit code is 1 in that case.

For `qscloud remove-sheet-icons` the column reads `clear icon` instead, sheets that
currently have no icon are marked `(no icon currently set)`, and each app's section also
shows how many thumbnail files would be deleted from the app's media library, as
`N thumbnail media file(s) would also be deleted from the app media library`.

## What a dry run does not prove

- **It does not verify the web UI login.** No browser is started, so the
  `--logonuserdir`/`--logonuserid`/`--logonpwd` credentials (and the Cloud login) are never
  exercised. On client-managed Qlik Sense the certificate and repository API path *is*
  exercised — those are different credentials.
- **It does not check that `--imagedir` is writable.** Creating the image directory is a
  write, so a dry run never attempts it. A real run in Docker can still fail on a
  read-only or root-owned image directory that the dry run reported nothing about.
- **It does not prove a sheet will render.** Page timeouts and rendering problems are
  runtime outcomes of a real run.
- **It is a snapshot.** Apps and sheets can change between the dry run and the real run,
  especially when a tag or collection selects them.

## Exit code

A dry run that cannot be planned at all — missing certificate, no apps matched, an app that
does not exist or cannot be read — exits 1, exactly as the real run would. A plan that
completes exits 0, even when every sheet was excluded; check the report rather than the exit
code for that.
