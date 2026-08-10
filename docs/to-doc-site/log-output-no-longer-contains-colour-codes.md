# Log output no longer contains colour codes when redirected

Butler Sheet Icons colours its log output so that `info`, `warn` and `error` lines are easy to tell apart
on screen. Until now it did that **always** — including when the output was not going to a screen at all.

If you redirected the output to a file, piped it into another tool, or let a scheduler capture it, the
colour instructions were captured too. They are invisible in a terminal but they are ordinary characters
in a file, so the log you opened later looked like this:

```
2026-06-24T10:30:45.123Z ←[32minfo←[39m: App version: 4.0.0
2026-06-24T10:30:45.124Z ←[32minfo←[39m: No browsers installed
```

instead of this:

```
2026-06-24T10:30:45.123Z info: App version: 4.0.0
2026-06-24T10:30:45.124Z info: No browsers installed
```

From this version, Butler Sheet Icons checks where its output is actually going and only sends colour to
a real terminal.

## What changes for you

Nothing needs to be reconfigured. The improvement applies automatically.

| How you run it | Before | Now |
|---|---|---|
| Interactively, in a terminal | Coloured | Coloured — unchanged |
| Redirected to a file (`> bsi.log`) | Colour codes in the file | Clean text |
| Piped to another command | Colour codes passed along | Clean text |
| From Windows Task Scheduler, cron, or a CI job | Colour codes in the captured log | Clean text |
| In Docker without a terminal attached | Colour codes in `docker logs` | Clean text |

If you have been stripping these characters yourself — with a `sed` filter, a PowerShell replace, or a
log-shipper rule — that workaround is no longer needed. Leaving it in place does no harm.

## Why this matters beyond tidiness

Colour codes in a captured log are not just ugly. They break things that read the log afterwards:

- **Searching.** A search for `info:` did not match `←[32minfo←[39m:`, because the text is not what it
  appears to be on screen.
- **Log shipping.** Tools that parse the log level out of each line — Splunk, Elastic, Grafana Loki — saw
  a level field with unexpected characters in it, and either mis-parsed it or stored the noise.
- **Sharing.** Pasting a captured log into a support ticket or an email carried the codes along, where
  they render as stray characters.

## Can I still force colour on, or off?

Yes. Two standard environment variables are honoured, and they take precedence over the automatic
detection.

| Variable | Effect |
|---|---|
| `NO_COLOR` set to any value | Never use colour, even in a terminal |
| `FORCE_COLOR=1` | Always use colour, even when redirecting to a file |
| `FORCE_COLOR=0` | Never use colour — the same as `NO_COLOR` |

`FORCE_COLOR=1` is the one to reach for if you deliberately want a coloured transcript — for example when
capturing output with a tool that renders colour back to you later.

::: code-group

```powershell [PowerShell]
$env:FORCE_COLOR = "1"
butler-sheet-icons.exe browser list-installed > coloured.log
```

```bash [Bash]
FORCE_COLOR=1 butler-sheet-icons browser list-installed > coloured.log
```

:::

A terminal that reports itself as `TERM=dumb` is also treated as unable to show colour.

## What is not affected

- **The log text itself is unchanged.** Only the colour instructions are removed. Timestamps, log levels
  and messages are all exactly as before, so anything matching on message text keeps working.
- **Log files written by other tools.** Butler Sheet Icons writes to the console; where that console
  output ends up is decided by you or your scheduler.
- **Secret redaction.** Passwords and API keys are still removed from log output exactly as before. See
  [Secret redaction in logs](./done/done_log-redaction.md).
