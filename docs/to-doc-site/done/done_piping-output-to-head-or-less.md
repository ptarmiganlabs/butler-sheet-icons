<!--
PUBLISHED 2026-08-13 to the doc site `next` branch, PR ptarmiganlabs/butler-sheet-icons-docs#89,
across the three pages the draft's own publishing notes asked for: guide/advanced/crash-dumps.md,
guide/troubleshooting.md and reference/commands.md.

Version gate: 5.0.0, not the "X.Y.Z from the open release-please PR" the notes below assume was
4.2.0. The Firefox removal made the next release a major.

Every claim verified verbatim against src/lib/util/fatal-handlers.js, including that
BROKEN_PIPE_EXIT_CODE is declared unconditionally -- which is what makes the "141 on Windows too"
claim true rather than aspirational.

One nuance not published, recorded here instead: the uncaughtException backstop is deliberately
narrow, and where it misreads a socket failure as a broken pipe the crash dump is lost but the run
is still reported as failed. That is a design note, not something an administrator acts on.
-->

# Piping output to `head` or `less` no longer leaves a crash report behind

Looking at the first few lines of a long list is an everyday thing to do:

```bash
butler-sheet-icons browser list-available --browser chrome --channel stable | head -12
```

Until now, that left two files in a `crash_dumps` folder in whatever directory you happened to be
standing in — a `.json` and a `.txt` crash report, saying that Butler Sheet Icons had crashed:

```
=== CRASH INFO ===
Error Type: Error
Source: uncaughtException
Exit Code: 1

=== ERROR MESSAGE ===
write EPIPE
```

Nothing had gone wrong. `head` stops reading once it has the twelve lines you asked for, and the next
line Butler Sheet Icons tried to print had nowhere to go. That is what `write EPIPE` means: *the thing
reading my output has gone away*.

The same thing happened with `less` when you quit before the end, with `grep -m1`, and with any other
command that stops reading early.

## What changed

Butler Sheet Icons now treats a closed output pipe as an ordinary end to the run. No crash report is
written, and nothing is printed about it. The command above now leaves your working directory exactly
as it found it.

Nothing about the output itself has changed — you still get the same twelve lines.

## The exit code

A run that ends because its output pipe closed exits with code **141**.

That is the standard convention on Linux and macOS for a program stopped by a closed pipe — `128 + 13`,
where 13 is the `SIGPIPE` signal number. `ls | head`, `yes | head` and most other tools report the same.
Butler Sheet Icons uses 141 on Windows too, for consistency.

**It is deliberately not 0.** Piping to `head` usually cuts a run short rather than letting it finish,
and Butler Sheet Icons' exit code is meant to tell a scheduler whether the run did its job. Reporting
success for work that was abandoned halfway would be misleading.

In practice this affects almost nobody:

- **Running a command by hand** — you will never see it. The shell reports the exit code of the *last*
  command in the pipeline, which is `head`, not Butler Sheet Icons.
- **In a script using `set -o pipefail`** — the pipeline is reported as failed, exactly as it would be
  for `ls | head` in the same script. If you are piping Butler Sheet Icons into something that stops
  reading early and you want the script to carry on, check for 141 specifically, or do not use
  `pipefail` for that line.
- **In a scheduled task** — no change. A scheduled run writes to a log file or to the console, not into
  a pipe that closes early.

## What has not changed

Real failures are still reported exactly as before. This is worth being clear about, because the two
can happen together:

- A genuine error still writes one `.json` and one `.txt` crash report and exits with code **1**, with
  its `FATAL:` line in the log.
- That remains true **even when the output pipe has already closed**. If a run crashes for a real
  reason while you happen to be piping it through `head`, you still get the crash report you need.
- A failure to write output for any *other* reason — a full disk, a permission problem — is still a
  genuine error and still produces a crash report.

The `BSI_CRASH_DUMP_*` environment variables are unchanged, and so is the limit of one crash dump per
run.

## Notes for the publishing pass

- Not released at the time of writing. Gate with a `::: warning Requires BSI X.Y.Z or later` callout
  using the version from the open release-please pull request.
- Best placed as a short section on the **existing crash dump page**, next to the one-dump-per-run
  material, rather than as a page of its own — the reader who needs it arrives asking "why is there a
  crash_dumps folder here?".
- The **troubleshooting page** is the natural home for the symptom itself: *"I piped output to `head`
  and got a crash report."* Cross-link to the crash dump page.
- If the reference pages list exit codes anywhere, 141 belongs there alongside 0 and 1.
- Verified on macOS against `browser list-available` piped to `head`, and in the test suite on both
  Linux and Windows runners.
