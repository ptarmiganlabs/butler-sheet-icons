<!--
DRAFT — not yet published.

Covers issue #1107: Butler Sheet Icons now handles SIGINT and SIGTERM instead of being
killed outright.

PUBLISHER NOTES — three things, in this order:

1. NEW PAGE, suggested at `/guide/concepts/interrupting-a-run`, with a sidebar entry in
   `docs/.vitepress/config.js` next to the live view page (`/guide/concepts/live-view`),
   which it cross-links.

2. CORRECT AN ALREADY-PUBLISHED PAGE. `/guide/concepts/live-view` carries a Ctrl-C caveat
   saying an interrupted run can leave the cursor hidden, because there was no signal
   handler. That is now wrong — it was flagged as the claim most likely to rot in
   `done/done_run-output-live-view.md`, and this change is what rots it. Replace that
   paragraph with a sentence saying an interrupted run collapses the live view and restores
   the terminal like any other ending, and link here. Publish that correction in the SAME
   PR as this page, or the site contradicts itself.

3. EXIT CODES. If a general exit-code reference page exists by publication time, add 130 and
   143 to its table rather than leaving them stated only here. Issue #1090 is building that
   table; if it has not landed, this page is the only home for them and that is fine.

VERSION GATE: read the open release-please PR title at publish time. It said
`chore(main): release butler-sheet-icons 5.0.0` when this draft was written — do not trust
that number, re-read it.

EVERY log line, exit code and timing below was taken from real interrupted runs against the
QSEoW lab server, not from reading the source. The 130/143/129 codes and the eight-second
shutdown bound were measured.

CORRECTED IN DRAFT, before publication. An earlier version of this page said the QSEoW web
session is signed out on the way past. It is not, and cannot be: stopping the run closes the
browser the logout needs. The "What is cleaned up" section now says the session stays until
Qlik Sense times it out, and quotes the line the run actually prints. That claim had been
written from intent rather than from a run — exactly what README step 3 warns about.
-->

# Stopping a run part-way through

::: warning Requires BSI 5.0.0 or later
In earlier versions there was no signal handling at all. Pressing Ctrl-C, or stopping a
container, killed Butler Sheet Icons on the spot: no summary, no record of which apps had
already been changed.
:::

A thumbnail run can take a long time. Fifty apps, a handful of sheets each, several seconds
per sheet to let it render — that is a job you start and walk away from. Sometimes you come
back and need to stop it: you pointed it at the wrong tag, someone needs the Sense server
left alone, or a scheduled job has to make way.

Stopping it is safe, and Butler Sheet Icons tells you where it got to.

## What happens when you press Ctrl-C

The run stops as soon as it can and then prints its normal end-of-run summary, covering the
apps it had already finished:

```
warn: SIGINT received. Stopping the run and reporting what has already been done - press Ctrl-C again to exit immediately.
info: Interrupted while processing app ded8d27d-53b1-4d46-8d4e-44f552aeb8bc - it was abandoned: The operation was aborted
info: Interrupted: stopping here. 12 of 15 app(s) were not started.

RESULT  INTERRUPTED
  apps          2 ok, 1 interrupted, 12 not started
  sheets        6 seen, 6 captured, 0 excluded
  thumbnails    6 sheet(s) given new thumbnails in content library "Sheet thumbnails"
```

`The operation was aborted` on that middle line is not a problem — it is how stopping works
under the bonnet, and it is reported at `info` rather than as an error for exactly that
reason. Nothing failed.

That summary is the reason this behaviour exists. Thumbnails are written to Qlik Sense as the
run proceeds, app by app, and **there is no undo**. Before, an interrupted run left you
guessing which apps had new thumbnails and which still had their old ones. Now the run tells
you, and the three counts say exactly what you are looking at:

| Count         | Meaning                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| `ok`          | Finished completely. New thumbnails are in Qlik Sense.                            |
| `interrupted` | Was being worked on when you stopped it. See below — usually nothing was changed. |
| `not started` | Never touched. Exactly as they were.                                              |

The same three counts appear whichever output style you get. On a normal terminal Butler Sheet
Icons draws the summary as a card, where the line reads `INTERRUPTED after 3m 12s · 2 app(s) ok
· 1 interrupted · 12 not started`; piped to a file or a log collector it is the plainer block
shown above. The words and the numbers match.

## What happens to the app it was in the middle of

For `create-sheet-thumbnails` on both Qlik Sense Cloud and Qlik Sense Enterprise on Windows:
**nothing is changed in that app.**

That is not luck, it is the order of the work. Butler Sheet Icons captures every sheet in an
app first, and only then uploads the images and points the sheets at them. Stopping during
the capture means it never reaches the part that writes, so the app keeps the thumbnails it
already had.

::: warning `remove-sheet-icons` is different
The removal commands clear icons **one sheet at a time**, so an app that was being processed
when you stopped the run can be left part-way: some sheets cleared, the rest still with their
icons. The summary's `cleared` count tells you how many were done. Re-run the command on that
app to finish the job — clearing an icon that is already gone is harmless.
:::

## How long it takes

Well under a second in normal use — it does not sit and wait for the sheet it was capturing.

This matters most in a container. `docker stop` sends the stop signal and then kills the
container about ten seconds later whatever is happening, so a slow shutdown would lose you the
very summary you need. Butler Sheet Icons is designed around that deadline, and it does not
grow with your settings: a run using `--pagewait 45` stops just as quickly as one using the
default.

If shutdown somehow cannot finish, two things end it anyway:

- **Press Ctrl-C a second time.** It exits immediately.
- **It gives up on its own after eight seconds**, prints whatever the summary holds by then,
  and exits — so an unattended container job is never left hanging.

## Exit codes

Butler Sheet Icons follows the standard shell convention, so a scheduler or CI job can tell an
interrupted run apart from a failed one:

| How the run ended                     | Exit code |
| ------------------------------------- | --------- |
| Finished, everything worked           | `0`       |
| Finished, something failed            | `1`       |
| Stopped with Ctrl-C (SIGINT)          | `130`     |
| Stopped with SIGTERM                  | `143`     |
| Terminal closed or connection dropped | `129`     |

`129` is the one to expect when a terminal window is closed or an SSH session drops mid-run.
Butler Sheet Icons treats that like any other stop: it shuts the browser down and reports what
it had done.

`143` is the one to watch for in a container or an orchestrator: `docker stop`,
`kubectl delete pod` and a Kubernetes rolling update all send `SIGTERM`. A job that reports
`143` was **stopped**, not broken — no Qlik Sense server to investigate, no credentials to
check. Re-run it and it will pick the work up from scratch.

An interrupted run never exits `0`, even when nothing went wrong before you stopped it. It did
not do the job you asked for, and a scheduler must not be told otherwise.

## What is cleaned up

Whatever it was doing, Butler Sheet Icons closes the browser it was driving and releases its
engine session.

On Qlik Sense Enterprise on Windows there is one loose end it cannot tidy. Signing the web
session out needs the browser, and stopping the run is what closes the browser — so an
interrupted run leaves that session on the server until Qlik Sense times it out. The run says
so, once, at the end:

```
info: The run was interrupted before the browser session could be logged out. Qlik Sense will release it when it times out.
```

It is worth knowing because Qlik Sense limits how many sessions one user may hold at a time.
Stopping a run repeatedly in quick succession can leave enough sessions behind to make the next
run fail to sign in. They clear themselves; if you need them gone sooner, an administrator can
end them from the QMC.

If you are watching the [live run view](/guide/concepts/live-view), the progress display
collapses and your terminal is handed back with the cursor where it belongs — the same as
when a run finishes normally.

## What it does not do

Stopping a run does not undo anything. Apps reported as `ok` keep their new thumbnails; there
is no rollback, and none is planned. If you stopped a run because it was pointed at the wrong
apps, you will need to put those apps' thumbnails back yourself.

Nor is there anything to resume. Butler Sheet Icons does not remember where it got to between
runs. To finish the job, run the same command again — apps that already have their new
thumbnails are simply done again, harmlessly. To do only what is left, name the remaining apps
with `--appid`.
