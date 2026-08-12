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

## Everything you already supplied is kept

Options given on the command line, or set through their `BSI_*` environment variables, are not asked about again:

```bash
butler-sheet-icons qseow create-sheet-thumbnails --host sense.acme.com -i
```

```
Already supplied, so not asked about again: --host.
```

This makes `-i` useful for filling the gaps in a command you have partly written, not only for starting from nothing.

### Except which apps to update, which you always get to confirm

App selection is the exception, and it is asked about even when `--appid` — or `BSI_QSEOW_CST_APP_ID` in a `.env` file — already names one. The wizard says so:

```
Supplied, but asked about again so the answer can be picked from what is actually there: --appid.
```

You get the full list of apps from the server, with the ones you supplied already ticked. Pressing Enter accepts them unchanged, so the common case still costs one keystroke — but you can add an app, swap it for another, or notice that the ID in your `.env` file names an app that has since been deleted. If you choose to type an ID instead, that question opens on the value you supplied.

This is why the app question is treated differently from `--host` or `--certfile`: a hostname you set once stays correct, while a stored app ID quietly goes stale when someone deletes or republishes the app.

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
