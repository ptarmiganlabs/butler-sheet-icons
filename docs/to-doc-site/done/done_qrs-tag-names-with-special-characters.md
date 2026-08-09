# Tags and content library names with special characters now work

Butler Sheet Icons looks up apps, sheets and content libraries by asking the Qlik Sense
Repository Service (QRS) for things matching a name you supply. Until now, a name containing
certain punctuation was passed to Qlik Sense unprotected, and the lookup either failed outright
or quietly matched nothing.

This affects `butler-sheet-icons qseow create-sheet-thumbnails` and these options:

| Option                | Environment variable              |
| --------------------- | --------------------------------- |
| `--qliksensetag`      | `BSI_QSEOW_CST_QLIKSENSE_TAG`     |
| `--exclude-sheet-tag` | `BSI_QSEOW_CST_EXCLUDE_SHEET_TAG` |
| `--contentlibrary`    | `BSI_QSEOW_CST_CONTENT_LIBRARY`   |

<!--
Published 2026-08-09 to the doc site's `next` branch (butler-sheet-icons-docs#51). Landed on
/guide/concepts/sheet-exclusion (danger callout for the several-exclude-tags case, warning callout
for punctuation), /guide/troubleshooting ("Tag or content library name fails or matches nothing",
carrying the per-character error table) and /reference/qseow.

Verified against src/lib/qseow/qrs-filter.js rather than taken on trust: qrsFilterAnyOf now emits
`(tags.name eq 'A' or tags.name eq 'B')` where it previously interpolated the single literal
'A,B'; qrsFilterValue backslash-escapes before the whole filter is encodeURIComponent-ed; and the
three options listed above are exactly the ones reaching those helpers. All correct as written.

The silent multi-tag case was given the strongest callout on the site, because an affected reader
has no signal at all - the run reported success while updating every sheet they had tagged to keep
out.
-->

## What went wrong before

**An ampersand stopped the command.** A tag named `R&D` produced this, and no apps were
processed at all:

```
Received error code: 400::Missing parameter value(s)
```

The ampersand has a special meaning in the address used to talk to Qlik Sense, so everything
after it was discarded and Qlik Sense received an incomplete request.

**An apostrophe stopped the command.** A tag named `Q1'25` produced:

```
400::Cannot parse the expression
```

Names are wrapped in quotes when sent to Qlik Sense, so an apostrophe inside the name ended
the name early and left Qlik Sense reading the remainder as gibberish.

**Other punctuation failed in its own way.** Each of these was tested against a real Qlik Sense
server. If you saw one of these messages and could not work out why, an awkward character in a
tag or content library name is a likely cause:

| Character in the name | What you would have seen                                       |
| --------------------- | -------------------------------------------------------------- |
| `&`                   | `400::Missing parameter value(s)`                              |
| `'`                   | `400::Cannot parse the expression:` followed by the query      |
| `#`                   | `403::XSRF prevention check failed. Possible XSRF discovered.` |
| `?` or `/`            | `Request path contains unescaped characters`                   |
| `%`                   | `URI malformed`                                                |

Names containing `+`, `=` or `,` did **not** produce an error and were unaffected.

**Several exclude tags matched nothing.** This is the one that failed silently, and it is the
most likely to have gone unnoticed:

```
--exclude-sheet-tag "Finance" "HR"
```

Butler Sheet Icons joined the two tags into the single name `Finance,HR` and asked Qlik Sense
for sheets carrying a tag with that exact name. No such tag exists, so nothing matched, no
sheet was excluded, and **every sheet had its icon updated** — including the ones you had
tagged to keep out. There was no error and no warning; the run looked completely normal.

Supplying a single `--exclude-sheet-tag` never hit _this_ problem — it only appeared once two
or more tags were given. A single tag containing an ampersand or apostrophe was still affected
by the two problems above.

## What happens now

Names are protected before being sent to Qlik Sense, so punctuation is treated as part of the
name rather than as instructions. You can use tags and content library names such as `R&D`,
`Q1'25`, `Finance/HR` or `Sprint #4` without quoting them any differently on the command line
than you would any other name containing spaces.

Supplying several `--exclude-sheet-tag` values now excludes sheets carrying **any** of them,
which is what the option always described.

## What you should check

**If you use two or more `--exclude-sheet-tag` values, review the affected apps.** Sheets you
intended to exclude have been receiving new icons on every run. After upgrading they will be
excluded correctly, but icons already replaced are not restored automatically — Butler Sheet
Icons has no record of what they were before. Use
`butler-sheet-icons qseow create-sheet-thumbnails` again once the exclusions are working, or
set the affected sheet icons back by hand.

**If you renamed a tag or content library to work around this, you can rename it back.** A
common workaround was to strip the punctuation — `R&D` to `RandD`, for example. That is no
longer necessary. Remember to update the matching `--qliksensetag`, `--exclude-sheet-tag` or
`--contentlibrary` value, or the environment variable holding it, at the same time.

**No change is needed if your names are plain.** Tags and content libraries made up of
letters, digits, spaces, hyphens and underscores behaved correctly before and behave
identically now.
