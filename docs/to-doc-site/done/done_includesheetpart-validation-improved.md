# --includesheetpart now shows its valid values in --help

Both the QSEoW and QS Cloud commands accept `--includesheetpart` to control how much of a sheet
is captured in the thumbnail. Until now, the valid values were described in the help text but not
enforced at the command line. An invalid value was accepted, the run started, and the error only
appeared deeper in the processing - after certificates had been checked, connections opened, and
the browser started.

That has changed. Invalid values are now rejected immediately, before any connection is made, and
`--help` lists the valid values so they can be discovered without reading the documentation.

## What changed

### QSEoW

|                      |                                                    |
| -------------------- | -------------------------------------------------- |
| Command              | `butler-sheet-icons qseow create-sheet-thumbnails` |
| Environment variable | `BSI_QSEOW_CST_INCLUDE_SHEET_PART`                 |

`--help` now shows the valid choices:

```
--includesheetpart <value>  Which part of sheets should be used to take screenshots.
                            1=object area only, 2=1 + sheet title, 3=2 + selection bar,
                            4=3 + menu bar (choices: "1", "2", "3", "4")
```

An invalid value is rejected immediately:

```
$ butler-sheet-icons qseow create-sheet-thumbnails --includesheetpart 9 ...
error: option '--includesheetpart <value>' argument '9' is invalid.
Allowed choices are 1, 2, 3, 4.
```

### QS Cloud

|                      |                                                      |
| -------------------- | ---------------------------------------------------- |
| Command              | `butler-sheet-icons qscloud create-sheet-thumbnails` |
| Environment variable | `BSI_QSCLOUD_CST_INCLUDE_SHEET_PART`                 |

`--help` now shows the valid choices:

```
--includesheetpart <value>  Which part of sheets should be used to take screenshots.
                            1=object area only, 2=1 + sheet title, 3 not used,
                            4=full screen (choices: "1", "2", "4")
```

Value `3` is not offered on QS Cloud because Qlik Sense Cloud has no equivalent sheet part.
An invalid value is rejected immediately:

```
$ butler-sheet-icons qscloud create-sheet-thumbnails --includesheetpart 3 ...
error: option '--includesheetpart <value>' argument '3' is invalid.
Allowed choices are 1, 2, 4.
```

## What to check

Nothing, if you are already passing a valid value. The change is purely about *when* an invalid
value is reported: before the run starts, not part-way through it.

If you have a script or scheduled job that sets `--includesheetpart` from an environment variable
or a configuration value, and that value has ever been wrong, the run will now fail immediately
with a clear message rather than starting and failing later. That is an improvement: the failure
is faster, cheaper, and easier to diagnose.
