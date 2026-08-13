<!--
PUBLISHED 2026-08-13 to the doc site `next` branch, PR ptarmiganlabs/butler-sheet-icons-docs#78,
into guide/interactive-mode.md.

One claim below is WRONG and was not published. The "Which commands accept it" table says the
thumbnail commands do not take `-i` -- "not yet - planned for the next release". They do, in the
same 5.0.0 release: `addInteractiveOption` is called on browser install, browser uninstall, qseow
create-sheet-thumbnails and qscloud create-sheet-thumbnails. The published table lists all four.
The doc site page carried the same stale claim ("planned for a later release") and was corrected
at the same time.

Also changed while publishing: the worked example used `--browser firefox`, which 5.0.0 rejects.

Everything else -- both banner lines, the browser uninstall exception, the no-terminal behaviour --
was verified verbatim against src/lib/interactive/.
-->

# Interactive mode without leaving the command you were typing

Interactive mode used to be reachable only through its own command:

```bash
butler-sheet-icons interactive
```

That is still there and still works. But it meant starting from a menu, even when you already knew which
command you wanted and had half of it typed.

You can now add `-i` to the command itself:

```bash
butler-sheet-icons browser uninstall -i
```

## Anything you already supplied is kept

This is the part worth knowing about. Options you have already given are treated as answers, not asked
about again. So you can supply the parts you know and let Butler Sheet Icons ask for the rest:

```bash
butler-sheet-icons browser install --browser chrome -i
```

```
Already supplied, so not asked about again: --browser.

  Type to filter, or take one of the first two entries.
? Which build should be installed?
❯ Recommended - the build this version of Butler Sheet Icons is tested with
  Latest stable - whatever the vendor currently publishes
```

This works for `BSI_*` environment variables too. If `BSI_BROWSER_UI_BROWSER` is set in your shell or in
a `.env` file, the browser question is skipped in exactly the same way.

Values that merely fall back to a **default** are still asked about, with the default offered as the
pre-filled answer. Only values you actually chose are treated as settled.

### One exception, and it says so

`browser uninstall` asks a single question that stands in for both `--browser` and `--browser-version`,
because it offers the builds that are actually in the cache. Supplying either of those does not skip
that question — a build id you gave from memory may name something that is no longer installed, so the
list wins. Butler Sheet Icons tells you when this is happening:

```
Supplied, but asked about again so the answer can be picked from what is actually there: --browser.
```

## Which commands accept it

`-i` appears on the commands that have something worth asking about:

| Command | `-i` |
|---|---|
| `browser install` | yes |
| `browser uninstall` | yes |
| `browser list-installed`, `browser list-available`, `browser uninstall-all` | no — they take nothing but a log level |
| `qseow create-sheet-thumbnails`, and the `qscloud` commands | not yet — planned for the next release |

Running `-i` on a command that does not accept it reports `unknown option '-i'` rather than doing
something unexpected. The commands still without it are the ones with the longest option lists, and they
are next.

## Nothing else changes

Worth stating plainly, because this release touches how every command is parsed:

- Without `-i`, every command behaves exactly as it did before — same options, same error messages, same
  exit codes. This was checked command by command against the previous release.
- `--help` is unchanged apart from the new `-i` entry on the two commands that have it.
- Scripts, scheduled tasks and container runs are unaffected. They do not pass `-i`, so none of this
  applies to them.

## If there is no terminal

Interactive mode needs one. When standard input is not a terminal — piped input, `cron`, `docker run`
without `-it`, most CI runners — Butler Sheet Icons says so and stops immediately rather than waiting
forever for an answer that cannot arrive:

```
Interactive mode needs a terminal. Standard input is not a terminal - this happens with piped
input, cron, "docker run" without -it, and most CI runners. Re-run with the options on the
command line, or start the container with "docker run -it".
```

The exit code is 1, so a scheduler sees a failure rather than a hung job.
