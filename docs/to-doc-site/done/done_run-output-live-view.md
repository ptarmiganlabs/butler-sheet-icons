<!--
PUBLISHED to `next` on 2026-08-19, butler-sheet-icons-docs PR #113, as
`/guide/concepts/live-view` with a sidebar entry beside the contact sheet. The version gate
resolved to 5.0.0, read from release-please PR #974 at publish time as this draft instructed.

CORRECTED BEFORE PUBLISHING. The draft said "`qscloud remove-sheet-icons` keeps the contact
sheet". It was written before `qseow remove-sheet-icons` existed, so it named the only removal
command there was. Both keep the contact sheet - only the two `create-sheet-thumbnails` workers
call `startLiveRunView` - and the published page says so.

VERIFIED STILL TRUE, not assumed. The Ctrl-C caveat: there is no `SIGINT` or `SIGTERM` handler
anywhere in `src/lib`, so an interrupted run can still leave the cursor hidden, while completion,
failure and crash all restore the terminal through `restoreLiveTerminal`. This is the claim most
likely to rot - it describes something *missing*, so it silently becomes wrong the day graceful
interrupt handling lands. Re-check it rather than trusting the page.

NOW WRONG, as predicted above. Issue #1107 landed graceful signal handling: an interrupted run
collapses the live view and restores the terminal through the same `restoreLiveTerminal` hook,
and the signal handler writes a show-cursor sequence besides. The published page's Ctrl-C
paragraph must be corrected - `interrupting-a-run.md` in the staging folder carries that
instruction and the replacement wording. Recorded here so a later reader of `done/` does not
trust the caveat above.

The gate list ("when you get it - and when you deliberately do not") was checked line by line
against `selectRung` in `src/lib/util/select-rung.js` and matches, including the 80x24 minimum,
the `TERM=dumb` gate being independent of colour, and `BSI_OUTPUT=live` being a permission rather
than a force.

FIXED IN THE SAME PR. Publishing this made the contact-sheet page self-contradictory: its
`BSI_OUTPUT` table still described `live` as "reserved for a future live view; today it behaves
like automatic selection". That row was corrected alongside.
-->

# Live run view: watching a thumbnail run as it happens

> **Publisher note:** new page — it needs a sidebar entry in
> `docs/.vitepress/config.js`, suggested next to the contact-sheet page it builds on
> (`run-output-contact-sheet`). No generated CLI option tables are affected: this
> feature adds no command-line option and no new environment variable — `live` was
> already a documented `BSI_OUTPUT` value on the contact-sheet page, and that page's
> "today it renders as the board" wording should be updated to point here. Establish
> the version for the gate below from the open release-please PR title at publication
> time, per this folder's README (it read 5.0.0 when this draft was written — re-check,
> do not trust the draft). The samples below are taken from a real recorded run against
> a lab server, with server and account names substituted — do not re-align them by
> hand.

::: warning Requires BSI X.Y.Z or later
Earlier versions show the contact sheet in interactive terminals. The animated live
view arrives in this version.
:::

When you run `qseow create-sheet-thumbnails` or `qscloud create-sheet-thumbnails` in an
interactive terminal, Butler Sheet Icons now shows a **live view** of the run: each
connection step resolves on screen as it actually completes, a progress bar follows the
sheets of the app being processed, and the display collapses into the familiar verdict
line when the run ends.

A thumbnail run spends most of its time waiting — on a browser, on a login, on each
sheet rendering. With `--pagewait` at its default of 5 seconds, a seven-app run is six
minutes during which the only question that matters is *"is it alive, and how far in is
it?"* The live view answers that at a glance, which the scrolling log lines never did.

## What it looks like

The run opens with the same wordmark frame as the contact sheet. The preflight steps
then resolve one at a time, each with a spinner while its real work is in flight and a
check mark when it has actually finished. The first three rows — certificates, content
library, app list — appear before the `PLAN` block (the plan can only be stated once
the app list is known); the browser and sign-in rows resolve below it, as the first
app starts:

```
  ✓ certificates      client.pem · client_key.pem
  ✓ content library   "Butler sheet thumbnails" exists
  ✓ app list          3 apps · 1 named · 2 tagged
  ✓ browser           chrome · from cache
  ⠹ signed in
```

These rows are not an animation played over the log — each one is tied to the real
operation behind it. The `certificates` row resolves when the certificate files have
been read, `content library` when the Qlik Sense server has confirmed the library
exists, `browser` when the browser has started **and answered its first command**, and
`signed in` only once the login has completed and the app has loaded. If a run hangs,
the row that never resolves tells you exactly which step it is stuck on — that is the
main reason this view exists.

While each app is processed, a progress bar follows its sheets, driven by the same
per-sheet records the final summary is counted from:

```
  app 2/3  Executive KPIs · 9 sheets
  ██████████████░░░░░░░░░░░░  5/9  'Sheet 4'
  ░████
```

The short row of blocks under the bar is the app's **sheet strip** growing in real
time, with the same meaning as on the contact sheet: `█` captured, `▓` blurred, `░`
excluded by one of your rules. As each app finishes, its strip row is written
permanently to the terminal, exactly as the contact sheet prints it:

```
  ✓ 1/3  Sales Discovery       ░████████     8/9 up        1m 8s
```

And at the end the animation stops, the cursor comes back, and the run closes with the
verdict:

```
  ────────────────────────────────────────────────────────────────

  ❯ done in 2m 21s  ·  3 app(s) ok  ·  24 thumbnails uploaded
    █ 24 captured   ▓ 2 blurred   ░ 3 excluded
    images in ./img/qseow · 48 file(s) · 2.5 MB
```

If the browser needs to be downloaded mid-run — the first run on a new machine, or
after changing `--browser-version` — the download shows up as a
`downloading browser 42%` label in the same display. There is no separate download
progress bar fighting the live view for the terminal.

Warnings and errors are not hidden by the animation: they are written permanently above
it, in order, as they happen. An app that fails mid-run shows a red row in the list and
is counted in the verdict, just as on the contact sheet.

## When you get it — and when you deliberately do not

The live view has the strictest requirements of Butler Sheet Icons' output styles,
because a repainting display is only safe on a real terminal. You get it when **all**
of these hold:

- output goes to an interactive terminal (not a file, a pipe, or a scheduler),
- the terminal is at least 80 characters wide and 24 rows tall, supports colour, and
  is not `TERM=dumb`,
- the log level is the default `info` — at `--log-level verbose` or `debug` you asked
  to read log lines, and at `warn` or `error` you asked for quiet,
- the browser runs headless (with `--headless false` a visible browser window is the
  thing you chose to watch),
- it is a real run, not `--dry-run` — a dry run finishes in seconds and its product is
  the plan text.

When a condition is not met, the output falls back to the **contact sheet** where the
terminal can still render static colour, and otherwise to the **plain run card**. Two
of the conditions skip the contact sheet entirely: any log level other than `info`,
and a stream that is not an interactive terminal, both go straight to the plain run
card — so redirected and scheduled output never contains a single repaint frame, and
`docker logs`, cron mail and captured log files stay readable. `qscloud
remove-sheet-icons` keeps the contact sheet: an icon removal run has no browser and no
page waits, so there is nothing to watch.

The `BSI_OUTPUT` environment variable works as documented on the contact-sheet page:
`off`, `plain` and `board` are absolute and always honoured, and `BSI_OUTPUT=live`
remains a *permission*, not a force — it can never point cursor animation at a stream
that cannot render it.

The view was verified on the oldest console Butler Sheet Icons supports: Windows
Server 2019's conhost renders the in-place updates cleanly under both PowerShell 5.1
and cmd.exe, so no special terminal is needed on Windows.

## If the terminal ever looks wrong

The live view restores the terminal — cursor visible, output back to normal — when a
run completes, when it fails, and when Butler Sheet Icons crashes. One case is not yet
covered: **stopping a run with Ctrl-C** (or killing the process any other way) ends it
before the cleanup can run, and can leave the cursor invisible. The standard `reset`
command restores the terminal; graceful Ctrl-C handling is planned separately.

If your console renders the animation as garbage (an unusual terminal emulator, an
over-SSH session with a broken `TERM`), set `BSI_OUTPUT=board` or `BSI_OUTPUT=plain`
for that environment and the run will use the static styles instead.
