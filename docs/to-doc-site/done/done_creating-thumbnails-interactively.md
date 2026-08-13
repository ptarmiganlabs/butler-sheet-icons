<!--
PUBLISHED 2026-08-13 to the doc site `next` branch, into guide/interactive-mode.md.

Published TWICE. PR ptarmiganlabs/butler-sheet-icons-docs#79 published an earlier version of this
draft; #90 republished it after this file was substantially rewritten mid-pass.

THAT REWRITE IS WHY THE "re-read against main before archiving" RULE EXISTS. About 130 lines were
added here while the earlier version was being published, and two strings already published from it
were reworded in the code at the same time:

  "Choose from all apps on the server" / "Choose a tag, then apps carrying it" / "Type an app id"
    -> "Pick apps from a list" / "Update every app carrying a tag" / "Type app id(s)"
  "Supplied, but asked about again so the answer can be picked from what is actually there"
    -> "Supplied, but asked about again so you can change it for this run"

Both were wrong on the live site until #90. The archive commit hit a merge conflict, which is the
only reason it was caught at all.

ONE CLAIM BELOW IS STILL WRONG. The empty-selection message is quoted as offering to "go back and
choose a tag". There is no way back to a previous question, and the code says "press Ctrl+C and
start again to choose <tag|collection> instead". Published as the code has it.

A section that stopped being true: browser uninstall's picker was documented as "One exception, and
it says so" to the option-skipping rule. Under the two-kinds framing it is not an exception at all,
and is now a note under that rule.

Question counts (36->14, 25->10) were measured by running each wizard's refine(), not taken from
here. Nothing in the test suite locks them.
-->

# Creating sheet thumbnails without assembling a command line

`qseow create-sheet-thumbnails` takes 36 options. `qscloud create-sheet-thumbnails` takes 25. Getting a first run working has meant reading `--help`, assembling a long command line, and finding out only at the end if a certificate path or an API key was wrong.

Both commands now accept `-i`:

```bash
butler-sheet-icons qseow create-sheet-thumbnails -i
butler-sheet-icons qscloud create-sheet-thumbnails -i
```

Butler Sheet Icons asks what it needs, checks the answers as you give them, and shows the equivalent command line before doing anything.

## It asks about ten questions, not thirty-six

Most options have sensible defaults, so you are not asked about them unless you say you want to be. Two questions gate the rest:

```
? Exclude or blur any sheets? (y/N)
? Configure advanced options (ports, certificates, schema version, browser)? (y/N)
```

Answer no to both — the common case — and QSEoW asks 14 questions instead of 36, Qlik Sense Cloud 10 instead of 25. Answer yes and the relevant block is asked in full. Nothing is hidden permanently; the defaults are simply not worth your time when they are already right.

## Mistakes are reported where you make them

This is the main practical difference from the command line.

On **Qlik Sense Cloud**, the tenant is contacted as soon as you give the API key:

```
? Qlik Sense cloud tenant URL … acme.eu.qlikcloud.com
? API key … ********
✖ Request failed with status code 401
? API key …
```

On **QSEoW**, the certificate files are checked the moment you name them, and the content library is checked when you choose it:

```
? Qlik Sense certificate file … ./cert/client.pem
? Qlik Sense certificate key file … ./cert/wrong.pem
✖ Certificate file(s) not found. Check --certfile and --certkeyfile.
? Qlik Sense certificate key file …
```

Running the same thing as a plain command line, a bad certificate path is reported only after every one of the 36 options has been typed, and a missing content library only after every screenshot has already been taken.

## You choose apps from a list

Rather than typing an app ID from memory:

```
? Which apps should be updated?
❯ Pick apps from a list
  Update every app carrying a tag
  Type app id(s)

? Which apps?
❯ ◯ Finance dashboard  (id: a1b2c3d4-1111-2222-3333-444455556666)
  ◯ Sales overview  (id: 9f8e7d6c-aaaa-bbbb-cccc-ddddeeeeffff)
```

On Qlik Sense Cloud the middle choice is a collection instead of a tag, and collections show how many items they hold so an empty one is obvious before you pick it.

**The app ID is always shown.** App names are not unique — two apps on the same server can share one — so the name alone would not tell you which is which. The full ID is displayed so you can also copy it into `--appid` later.

Typing an ID directly is still offered, for when you already have it.

If the list cannot be fetched — a network problem, or an account without permission to read the app list — the wizard falls back to asking you to type the ID rather than stranding you.

### Choosing by tag or collection updates all of them

The middle route does not show you a list to tick. It cannot: a tag reaches Butler Sheet Icons as `--qliksensetag`, which selects every app carrying it, so a list there would invite a choice that could not be honoured. Instead the wizard resolves the tag and tells you what it found:

```
? Which tag? BSI
  7 app(s) carry the tag 'BSI' and will be updated.
```

A tag that matches no apps is rejected there and then, so you fix it at the prompt rather than discovering it when the run reports that it had nothing to do.

If you want only some of the tagged apps, pick them from the list route instead.

### A run with nothing to do is refused

Untick every app and the wizard says so rather than letting you confirm a run that would process nothing:

```
? Which apps?
✖ No apps selected, so there would be nothing to do. Pick at least one app, or go back and choose a tag instead.
? Which apps?
```

Naming no apps is still fine when a tag or collection is carrying the selection — the two add together, and one of them having apps is enough.

## Two kinds of options, and only one of them is skipped

Options given on the command line, or set through their `BSI_*` environment variables, are treated in one of two ways, and the wizard opens by telling you which is which:

```
Already supplied, so not asked about again: --host, --certfile, --certkeyfile,
  --apiuserdir, --apiuserid, --logonuserdir, --logonuserid, --logonpwd, --contentlibrary.
Supplied, but asked about again so you can change it for this run: --appid, --includesheetpart.
```

**Options that describe your environment are skipped.** A hostname, a port, a certificate path, a credential, a browser build, the content library — properties of the server you are pointing at. They stay true until the environment itself changes, so re-asking them every run is exactly the tedium `-i` exists to remove. This is what makes `-i` useful for filling the gaps in a command you have partly written:

```bash
butler-sheet-icons qseow create-sheet-thumbnails --host sense.acme.com -i
```

**Options that describe this run are always asked**, opening on whatever you supplied. Which apps to update, which tag or collection to include, how much of each sheet to capture, which sheets to exclude or blur. These are decisions, not facts — and a decision taken once and left in a `.env` file should not be taken again silently on every later run, where you can neither see it nor change it without editing the file.

Confirming one costs a single keystroke, because the question opens on the value that was already there.

### Skipped does not mean unchecked

A skipped option is still **verified against your server**. Not asking you about it does not mean trusting it: an API key can be revoked, a content library deleted, a certificate moved, long after the `.env` file that names them was written.

**With a complete `.env` file, the checks run before the first question.** Everything the checks need is already in the file, so there is nothing to wait for:

```
── Checking what you supplied ────────────────────

  ✓ --certfile (from BSI_QSEOW_CST_CERT_FILE) checked
  ✓ --certkeyfile (from BSI_QSEOW_CST_CERTKEY_FILE) checked

  ✓ --contentlibrary (from BSI_QSEOW_CST_CONTENT_LIBRARY) checked
```

This is the common case once you have saved your answers, and it is the one worth having: a content library that was deleted last month is reported immediately, rather than after you have picked your way through a list of several hundred apps.

**A check waits when it depends on something you have not given yet.** The content library check opens a connection to the Qlik Sense repository service built from the host, the certificates and the API user — so if the host is not in your `.env` file, the check cannot run until you have typed it, and happens further down instead, at the point the question would have been asked. Nothing is skipped either way; only the timing differs.

Those lines are also why the wizard pauses for a moment — it is contacting your server.

**One check often covers several options**, and each gets its own line. The certificate check needs both paths and verifies both, and says so rather than naming only the key file. On Qlik Sense Cloud the connection test does the same for `--tenanturl` and `--apikey`: a wrong tenant URL fails it as surely as a revoked key does.

If the check fails, the wizard names the option, the environment variable the value came from, and what is wrong. It then asks you the question after all, opening on the value that failed, so correcting it is an edit rather than a retype — except for a credential such as `--apikey`, which is asked as a masked prompt and cannot be pre-filled:

```
  ✗ --contentlibrary (from BSI_QSEOW_CST_CONTENT_LIBRARY):
    Content library 'Deleted last year' does not exist on sense.acme.com.
    This check also uses these values you supplied: --host, --certfile.
```

That last line matters when the value being complained about is not the one at fault. A wrong `--host` in the same `.env` file makes the content library check fail too, and no amount of retyping the library name will fix it — press **Ctrl+C**, correct the file, and start again. Only the values this particular check reads are listed, so the line stays short even when your `.env` file sets everything.

Without this, a stale `.env` file failed only once the run had started: on QSEoW, a missing content library aborts after every screenshot has already been taken.

### What that looks like for app selection

You get the full list of apps from the server, and **the ones you supplied are listed first and already ticked**:

```
  Apps you already supplied are listed first, ticked. Untick to leave one out.
? Which apps?
❯◉ Employee salaries  (id: ded8d27d-53b1-4d46-8d4e-44f552aeb8bc)
 ◯ _s_QVD Generator - App scriptlog extract  (id: ede067b0-cbf9-4a2c-a422-bac1ffbdd4de)
 ◯ User reload demo(2)  (id: ec31f83b-e8cd-41f8-846e-abd8b4e193ff)
```

First, not merely ticked. On a server with several hundred apps, a ticked row sorted somewhere into the middle of the list is one you will never see — so pressing Enter would quietly update an app you had not chosen for this run. At the top it takes one keystroke to remove.

If an app ID in your `.env` file names an app the server no longer has, the wizard says so rather than letting it disappear from the selection without comment:

```
  ded8d27d-53b1-4d46-8d4e-44f552aeb8bc - supplied, but no longer on the server, so not listed below.
```

If you choose to type an ID instead, that question opens on the value you supplied.

### And for the sheet filters

A supplied `--exclude-sheet-number` or `--blur-sheet-tag` is shown even if you answer **no** to "Exclude or blur any sheets?". Declining that question means "nothing more", not "and forget what I already set" — the alternative would be a filter from your `.env` file silently skipping sheets behind a question you just declined. Filters you have not set stay behind the gate as before.

### A supplied tag or collection is shown too, whichever way you pick apps

`--qliksensetag` on Qlik Sense Enterprise on Windows, and `--collectionid` on Qlik Sense Cloud, are not alternatives to naming apps — they are a second way of naming them. The run covers every app you name **and** every app carrying the tag or held in the collection.

So when one of them is already set, the wizard asks about it on every route, not only when you chose to pick apps by tag or collection:

```
── Apps ──────────────────────────────────────────

✓ Which apps should be updated? Pick apps from a list

? Which tag?
  Every app carrying it is updated, on top of any apps named below. Leave empty for none.
> BSI
  7 app(s) carry the tag 'BSI' and will be updated.
```

Leave the tag empty — or choose `None - do not add a collection` in the collection list — and only the apps you picked are updated. Keep it, and the tagged apps are added, exactly as they would be from the command line. Without this the tag would sit in your `.env` file and quietly widen every interactive run to apps you were never shown.

## Nothing happens until you confirm

The wizard finishes with a summary of what it will do and the equivalent command line, and asks before running anything. Credentials are never displayed. From there you can run it, start over, save the answers to a `.env` file, or cancel.

## It needs a terminal

Interactive mode requires one. Under `cron`, in `docker run` without `-it`, or with piped input, Butler Sheet Icons says so and stops immediately rather than waiting for an answer that cannot arrive:

```
Interactive mode needs a terminal. Standard input is not a terminal - this happens
with piped input, cron, "docker run" without -it, and most CI runners. Re-run with
the options on the command line, or start the container with "docker run -it".
```

The exit code is 1, so a scheduler sees a failure rather than a hung job. Automation is unaffected: without `-i`, both commands behave exactly as they always have.
