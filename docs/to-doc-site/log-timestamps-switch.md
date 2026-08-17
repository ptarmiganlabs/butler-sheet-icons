# Turning off the timestamp prefix on log output

> **Publisher note:** this is an **edit to an existing page**, not a new page —
> `docs/guide/concepts/environment-variables.md` in the doc site repo. Two changes there:
> add `BSI_LOG_TIMESTAMPS` to the **"Output and interaction"** table, and add the section
> below alongside **"Colour codes in captured logs"**, which this mirrors in shape.
> No sidebar change needed. Establish the version for the gate from the open
> release-please PR title at publication time, per this folder's README.

## Table row for "Output and interaction"

| Variable                  | Effect                                             |
| ------------------------- | -------------------------------------------------- |
| `BSI_LOG_TIMESTAMPS=false` | Remove the timestamp prefix from every log line   |

## New section: "Timestamps in log output"

---

::: warning Requires BSI X.Y.Z or later
In earlier versions the timestamp prefix cannot be turned off.
:::

Every log line Butler Sheet Icons writes starts with a timestamp and a log level:

```
2026-08-17T09:14:22.105Z info: Starting creation of thumbnails for Qlik Sense Enterprise on Windows (QSEoW)
```

That prefix is about 31 characters before any content. It is useful when the console is the
only record of when something happened — and pure duplication when something else already
records the time, which is the case in most scheduled setups:

- **Docker / Kubernetes** — the container runtime stamps every line (`docker logs -t`,
  `kubectl logs --timestamps`)
- **systemd / journald** — the journal stamps every line
- **Most log shippers** — the collector adds its own receive time

In those environments each line effectively carries two timestamps, and the one Butler Sheet
Icons adds is the less trustworthy of the two.

Set the environment variable `BSI_LOG_TIMESTAMPS` to `false`, `0`, `no`, or `off` (any
capitalisation; surrounding whitespace is ignored) and the prefix is dropped:

```
info: Starting creation of thumbnails for Qlik Sense Enterprise on Windows (QSEoW)
```

The log level and the message are unchanged — only the timestamp goes away. Any other value,
and an unset variable, leave timestamps on.

Set it anywhere Butler Sheet Icons reads its environment:

::: code-group

```powershell [PowerShell]
$env:BSI_LOG_TIMESTAMPS = 'false'
.\butler-sheet-icons.exe qseow create-sheet-thumbnails ...
```

```bash [Bash]
BSI_LOG_TIMESTAMPS=false ./butler-sheet-icons qseow create-sheet-thumbnails ...
```

:::

In Docker, pass it with `-e BSI_LOG_TIMESTAMPS=false`. It also works from a `.env` file next
to where you run Butler Sheet Icons, together with your other `BSI_` settings.

If you are unsure whether the variable is reaching Butler Sheet Icons — or whether the value
you set was understood — run `butler-sheet-icons interactive --self-test`: the **Logging**
rows show the raw value received and whether timestamps are on or off as a result.

**What it does not affect.** This switch applies to log lines only. Output that never carried
a timestamp is unchanged: the JSON document from `doctor check --outputformat json`, the
interactive wizard's prompts and tables, and `--help`/`--version` text. `--log-level`
filtering and the messages themselves are also unchanged.

**If you parse Butler Sheet Icons log output:** nothing changes unless you set the variable.
With it set, anything matching on the leading timestamp (log filters, monitoring rules,
scripts using the timestamp column) will need adjusting — log lines then start directly with
the level, e.g. `info:` or `error:`.
