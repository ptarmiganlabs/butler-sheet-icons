# One crash dump per run, and a cap on how many can ever be written

Butler Sheet Icons writes a *crash dump* when it stops because of an unrecoverable error. This draft covers a change to how many of those files a single run can produce, and to whether the run reliably ends at all.

It updates the existing crash dump material — the page describing where dumps are written, what they contain, and the `BSI_CRASH_DUMP_*` environment variables.

## What changed

**A run now writes at most one crash dump.**

Previously, a run that failed with several errors at once wrote a separate crash dump for each of them. In the worst case the errors kept arriving faster than Butler Sheet Icons could shut down, and the run produced crash dump files continuously without ever exiting. One report described a single run leaving **479,178 files** in its `crash_dumps` folder over about fifteen minutes, every one of them empty, while the run itself never finished.

Three things are different now:

1. **Only the first error produces a crash dump.** Once Butler Sheet Icons has begun writing a dump, any further errors in the same run are ignored rather than starting dumps of their own. The first error is the one worth having — the ones that follow are usually consequences of it.
2. **The run always ends.** Butler Sheet Icons now exits with code `1` even when the crash dump cannot be written, and even when writing it hangs. Previously a failure while writing the dump could leave the run stuck indefinitely, so a scheduled task would sit there rather than reporting a failure.
3. **There is a hard limit on crash dump files per run**, as a safety net. See below.

## What you may notice

- **One `.json` and one `.txt` file per failed run**, instead of a pair per error. This is the normal case and needs no configuration.
- **One `FATAL:` line in the log** describing the first error, instead of one per error. Log output from a failing run is correspondingly shorter and easier to read.
- **Scheduled tasks now fail properly.** A run that hits a fatal error returns exit code `1` promptly. If you previously had scheduled Butler Sheet Icons tasks that occasionally hung and had to be killed, this is a likely cause.

## If you have a folder full of empty crash dumps

If you find a `crash_dumps` folder containing a very large number of zero-byte files that all share the same process ID in their names, they are the symptom described above. **They are safe to delete** — a zero-byte dump contains nothing.

Because there can be a great many of them, a plain wildcard delete may fail with an "argument list too long" error. Delete them in batches instead.

### macOS / Linux

```bash
# Count them first
find crash_dumps -type f -size 0 | wc -l

# Then delete
find crash_dumps -type f -size 0 -delete
```

### Windows PowerShell

```powershell
# Count them first
(Get-ChildItem crash_dumps -File | Where-Object Length -eq 0).Count

# Then delete
Get-ChildItem crash_dumps -File | Where-Object Length -eq 0 | Remove-Item
```

## New environment variable: `BSI_CRASH_DUMP_MAX_PER_PROCESS`

This is the safety net behind the change: a hard ceiling on how many crash dumps a single run may write, no matter what goes wrong.

| Environment variable | Default | What it controls |
|---|---|---|
| `BSI_CRASH_DUMP_MAX_PER_PROCESS` | `10` | Maximum crash dumps a single run may write. Set to `0` for no limit. |

It belongs with the crash dump variables already documented — `BSI_CRASH_DUMP_ENABLE`, `BSI_CRASH_DUMP_DIR`, `BSI_CRASH_DUMP_CREATE_JSON`, and `BSI_CRASH_DUMP_CREATE_TEXT`.

Because a run now writes one dump, **you should never reach this limit in normal operation**, and there is no reason to change it. It exists so that a future defect cannot fill a disk. If you do see the limit reached, Butler Sheet Icons says so once in the log:

```
CRASH DUMP: Limit of 10 dumps per process reached, no further dumps will be written. Set BSI_CRASH_DUMP_MAX_PER_PROCESS to raise or remove the limit.
```

Seeing that line means something is repeatedly failing inside a single run, and is worth reporting as a bug along with the dumps that *were* written.

A value that is not a whole number of zero or more — a typo such as `ten` or `-1` — is ignored and the default of `10` is used instead, so that a mistake in configuration cannot quietly remove the ceiling.

### Setting it

```bash
# macOS / Linux
BSI_CRASH_DUMP_MAX_PER_PROCESS=25 butler-sheet-icons qseow create-sheet-thumbnails ...
```

```powershell
# Windows PowerShell
$env:BSI_CRASH_DUMP_MAX_PER_PROCESS = "25"
butler-sheet-icons.exe qseow create-sheet-thumbnails ...
```

## Correction to existing content

The crash dump page currently answers the question "Can I keep just the last few dumps and discard the rest?" by explaining that Butler Sheet Icons does not clean up old dumps and suggesting a scheduled job to remove files older than 30 days.

That advice is still correct — dumps accumulate across runs and nothing removes them — but the answer was written when a single run could produce many files. It is worth adding that **each run contributes at most one dump**, so the folder grows by one dump per failed run, not by an unpredictable number. That makes a simple age-based cleanup far more predictable than it used to be.

## Notes for the publishing pass

- The behaviour described here is **not released yet** at the time of writing. Gate it with a `::: warning Requires BSI X.Y.Z or later` callout using the version from the open release-please pull request.
- Prefer **editing the existing crash dump page** over adding a new one: the environment variable table, the FAQ entry noted above, and a short section on the one-dump-per-run guarantee.
- The troubleshooting page is the natural home for the "folder full of empty crash dumps" symptom, cross-linked to the crash dump page.
