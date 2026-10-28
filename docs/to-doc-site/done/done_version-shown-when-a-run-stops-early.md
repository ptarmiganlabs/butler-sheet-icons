<!--
PUBLISHED 2026-10-27 to the doc site via ptarmiganlabs/butler-sheet-icons-docs#126 (into `next`;
production follows when `next` is next merged to the doc site's `main`). Shipped in BSI 5.4.0
(abfe485, PR #1208, issue #1207).

Where it went:
- guide/concepts/run-card.md - new section "When a run stops before the header"
  (#when-a-run-stops-before-the-header), gated 5.4.0.
- reference/commands.md - a paragraph at the end of "Getting Help", linking to it.

The published sample differs from this draft's:
- It leads with the downloadable executables' line, `butler-sheet-icons x.y.z - built yyyy-mm-dd`.
- The Docker form, with no build date, is described in a bullet.
- The option left out is `--host`. That output was checked by running `qseow
  create-sheet-thumbnails` without `--host` from source at 576c744.

Imprecise here and on the site: "every run opens with a header naming the version" does not hold
for a real run of the three thumbnail commands at `--log-level warn` or `error`. Such a run prints
no header, because the header logs at `info` (run-card.md, "Log levels"). This was found after
publishing and had not been corrected on the site when the draft was archived.
-->

# The version is shown even when a run stops before it starts

Every Butler Sheet Icons run opens with a header naming the version, and that header is the first
thing to include when you report a problem. Until now, though, a run that stopped before it really
began — because a required option was missing, an option was misspelled, or a value was not one BSI
accepts — printed only the error. The version was missing exactly when something had gone wrong.

Such a run now prints a single version line just before its error.

::: warning Requires BSI 5.4.0 or later
Earlier versions print the error on its own.
:::

## What you will see

Leaving out a required option, for example:

```
butler-sheet-icons 5.4.0
error: required option '--apiuserdir <directory>' not specified
```

The line carries the same information as `butler-sheet-icons --version`, folded onto one line. A build
that reports more than one version, or a build date, shows them all, for example:

```
butler-sheet-icons 5.4.0 - built 2026-11-02
```

In a terminal there is also a blank line above the version line, to separate the failure from the
command you typed. When the output goes to a log file, a scheduler or another program, that blank
line is left out, so logs contain only the version line and the error.

## What does not change

- A run that gets as far as its normal header does not print the extra line. The header already
  shows the version.
- Exit codes are unchanged: a run that stops early still exits with code 1.
- The error text itself is unchanged.

::: tip When reporting a problem
Copy the version line along with the error. It tells whoever helps you which build produced the
message, which is often the first question asked.
:::
