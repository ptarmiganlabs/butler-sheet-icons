# Blurring sheets by tag now works — and no longer pretends to on Qlik Sense Cloud

`--blur-sheet-tag` lets you mark sheets in Qlik Sense with a tag and have Butler Sheet Icons blur
their thumbnails, so sensitive content is not readable from the hub.

The option has been accepted on the command line for a long time. On client-managed Qlik Sense it
never did anything: nothing ever asked Qlik Sense which sheets carried the tag, so no sheet was
ever blurred because of it. On Qlik Sense Cloud it could never work at all.

Both situations are now resolved, in different ways.

## Client-managed Qlik Sense (QSEoW) — the option works

|                      |                                                      |
| -------------------- | ---------------------------------------------------- |
| Command              | `butler-sheet-icons qseow create-sheet-thumbnails`   |
| Environment variable | `BSI_QSEOW_CST_BLUR_SHEET_TAG`                       |

**What happened before.** Butler Sheet Icons accepted the tag name and then never looked it up.
Sheets carrying the tag got an ordinary, readable thumbnail. In version 4.0.0 each run said so:

```
--blur-sheet-tag is not yet implemented for QSEoW and will be ignored. See https://github.com/ptarmiganlabs/butler-sheet-icons/issues/840
```

**That warning is gone in this version**, because the option now does what it says. If you have a
monitoring rule or a log filter matching that line, it will stop firing — remove it.

**What happens now.** Sheets carrying the tag get a blurred thumbnail, in the same way as sheets
selected by `--blur-sheet-number`, `--blur-sheet-title` or `--blur-sheet-status`. At log level
`verbose` each one is named:

```
Blurred sheet thumbnail (via tags): 3: 'Salaries', ID abcd1234-..., description ''
```

Every run now also reports, at the default log level, how many sheets in each app carried the tag:

```
Sheets carrying a tag named by --blur-sheet-tag: 2 (tags: 🔒 Contains sensitive data)
```

**Check that number.** A count of `0` for every app means no sheet anywhere matched — almost
always a misspelled tag, or a tag applied to the app instead of to its sheets. The run still
succeeds, and the thumbnails stay readable.

**You can now give more than one tag** on the command line. The option takes a list, matching
`--exclude-sheet-tag`:

```bash
butler-sheet-icons qseow create-sheet-thumbnails \
  --blur-sheet-tag "🔒 Contains sensitive data" "🔒 Draft" \
  ...
```

A single tag works exactly as before, so existing commands need no change.

**The environment variable holds one tag only.** `BSI_QSEOW_CST_BLUR_SHEET_TAG` is taken as a
single tag name, whatever it contains — setting it to `Secret,Draft` or `Secret Draft` looks for
one tag with that exact name, including the comma or space, and matches nothing. There is no
separator that would work, because tag names may themselves contain both. To name more than one
tag, pass them on the command line. `BSI_QSEOW_CST_EXCLUDE_SHEET_TAG` behaves the same way.

### What to check before your next run

**This will change the thumbnails you get.** If you have been passing `--blur-sheet-tag` and have
sheets tagged with that tag, those sheets have had readable thumbnails until now and will get
blurred ones from the next run. That is the behaviour the option always promised — but if your
tagged sheets were relying on being readable, remove the tag or drop the option before running.

**The blur tag and the exclude tag are separate.** `--blur-sheet-tag` and `--exclude-sheet-tag`
are looked up independently. A sheet tagged for exclusion is skipped entirely and is never blurred
as a side effect, and a sheet tagged for blurring is still processed. Using the same tag name for
both is possible but pointless: exclusion wins, because an excluded sheet never gets a new
thumbnail at all.

**Tag names with punctuation are safe.** Names containing apostrophes, ampersands and similar
characters are handled correctly, the same as for `--exclude-sheet-tag`.

## Qlik Sense Cloud — the option is now reported as unsupported

|                      |                                                        |
| -------------------- | ------------------------------------------------------ |
| Command              | `butler-sheet-icons qscloud create-sheet-thumbnails`   |
| Environment variables| `BSI_QSCLOUD_CST_BLUR_SHEET_TAG`, `BSI_QSCLOUD_CST_EXCLUDE_SHEET_TAG` |

Qlik Sense Cloud has no way to tag an individual sheet — tags there apply to apps, not to the
sheets inside them. Both `--blur-sheet-tag` and `--exclude-sheet-tag` are therefore impossible to
honour on Qlik Sense Cloud, and neither has ever done anything there.

**What happens now.** Both options are still accepted — with one tag or several, so a command
copied from the client-managed examples above still parses — but each one now says plainly that it
is being ignored:

```
--blur-sheet-tag is not supported for Qlik Sense Cloud and will be ignored: individual sheets
cannot be tagged there. Use the sheet number, title or status options instead.
```

**What to do instead.** Select sheets by position, title or published status:

| Instead of                | Use on Qlik Sense Cloud                                    |
| ------------------------- | ---------------------------------------------------------- |
| `--blur-sheet-tag`        | `--blur-sheet-number`, `--blur-sheet-title`, `--blur-sheet-status` |
| `--exclude-sheet-tag`     | `--exclude-sheet-number`, `--exclude-sheet-title`, `--exclude-sheet-status` |

These options are unchanged and work on both Qlik Sense Cloud and client-managed Qlik Sense.

**A future version will remove the two tag options from the `qscloud` command entirely**, along
with their environment variables. Removing them now would break scripts that pass them, so for
this release they warn instead. If you have either of them in a Qlik Sense Cloud command, take
them out at your convenience — doing so changes nothing about how the run behaves.

## Verify before publishing

- **Add the version gate.** This page documents changed behaviour and needs
  `::: warning Requires BSI X.Y.Z or later` under the title, filled in with the release that
  carries it. The change is not released as of writing; 4.0.0 is the last release without it.
- Confirm the warning text matches `src/lib/cloud/cloud-create-thumbnails.js` — this page quotes
  it verbatim and the two must not drift apart. The same applies to the two QSEoW log lines
  quoted above, against `src/lib/qseow/qseow-updatesheets.js` and `src/lib/qseow/qseow-process-app.js`.
- The removed 4.0.0 warning is quoted verbatim from the commit that deleted it. Confirm no other
  released version emitted a different wording before promising readers it is the line they saw.
- The claim that tags on Qlik Sense Cloud apply to apps rather than sheets is the reason the
  options cannot work. It matches the existing statement on the `--exclude-sheet-tag` page; keep
  the two consistent if either is reworded.
- Check whether the existing `--blur-sheet-tag` reference entry still says "QSEoW only" and reads
  as though the option works. It should now describe the multi-tag form as well.
- The removal from the `qscloud` command is stated as a future change with no version attached.
  Fill in the version only once it is actually scheduled.
