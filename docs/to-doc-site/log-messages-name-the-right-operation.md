# Log messages now name the right operation

Several log lines described an operation Butler Sheet Icons was not performing, or labelled it
inconsistently between Qlik Sense Enterprise on Windows and Qlik Sense Cloud. The wording has
been corrected.

Nothing about how Butler Sheet Icons behaves has changed — only what it writes to the log. This
page matters if you search your logs for these lines, or if log monitoring alerts on them.

## Removing sheet icons no longer claims to be updating them

When removing sheet icons, the log said the icons had been updated or generated:

| Command                      | Old text                                                                 | New text                                                      |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `qscloud remove-sheet-icons` | `Closed session after updating sheet thumbnail images in QS Cloud app …` | `Closed session after removing sheet icons in QS Cloud app …` |

Neither "updating" nor "generating" describes removing an icon. The same wording is used
internally on the Qlik Sense Enterprise on Windows side, where it has been corrected too, though
no command exposes it there yet.

## Per-app failures name the command that failed

When one app in a multi-app run fails, the failure line is prefixed with the command. One of
those prefixes was wrong:

| Command                      | Old prefix                                     | New prefix                                          |
| ---------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `qscloud remove-sheet-icons` | `CLOUD PROCESS APP 2: Failed to process app …` | `CLOUD REMOVE SHEET ICONS: Failed to process app …` |

The `2` was a leftover, and it did not name the command actually running.

**If you have log monitoring that matches on `CLOUD PROCESS APP 2`, update it.** The old prefixes
no longer appear.

## Browser errors are punctuated the same way on both platforms

A failure to start the built-in browser was written differently depending on platform — Qlik
Sense Cloud used a colon after the prefix, Qlik Sense Enterprise on Windows did not:

```
CLOUD APP: Could not launch virtual browser: …
QSEOW Could not launch virtual browser: …
```

Both now use the colon.

## One line appears at the default log level that did not before

Running `qscloud remove-sheet-icons`, this line was written at `verbose` and so was hidden at the
default log level of `info`:

```
Created session to <server or tenant>, engine version is <version>
```

It is now written at `info`, matching every other command that works on an app you named, and
matching the `Opened app …` line that the same command already wrote at `info`.

If you run with `--loglevel info` (the default) you will see one extra line per app. Set
`--loglevel warn` to suppress it along with the other progress messages.

Commands that re-open an app already reported by the step above them — the internal thumbnail
update — still log at `verbose`, so an app is not announced twice in the same run.
