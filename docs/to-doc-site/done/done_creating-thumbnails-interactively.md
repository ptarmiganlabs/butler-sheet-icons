<!--
PUBLISHED 2026-08-13 to the doc site `next` branch, PR ptarmiganlabs/butler-sheet-icons-docs#79,
into guide/interactive-mode.md, plus a pointer on each of the two thumbnail reference pages.

The question counts below are RIGHT but the draft states them inconsistently: the heading says "It
asks about ten questions, not thirty-six", which mixes the two platforms. Measured by running each
wizard's refine() over the real command definitions with both gates declined:

  qseow create-sheet-thumbnails   36 options -> 14 questions (15 via the "choose a tag" path)
  qscloud create-sheet-thumbnails 25 options -> 10 questions

NOTHING IN THE TEST SUITE LOCKS THESE NUMBERS. Re-measure rather than trust them if the option
lists change. The QSEoW wizard repeats the 36/14 figure in a code comment, which is also unlocked.

Everything else -- gate messages, app-source choices, the certificate error, the app and collection
labels, the fallback to typing an id -- was verified verbatim.
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
❯ Choose from all apps on the server
  Choose a tag, then apps carrying it
  Type an app id

? Which apps?
❯ ◯ Finance dashboard  (id: a1b2c3d4-1111-2222-3333-444455556666)
  ◯ Sales overview  (id: 9f8e7d6c-aaaa-bbbb-cccc-ddddeeeeffff)
```

On Qlik Sense Cloud the middle choice is a collection instead of a tag, and collections show how many items they hold so an empty one is obvious before you pick it.

**The app ID is always shown.** App names are not unique — two apps on the same server can share one — so the name alone would not tell you which is which. The full ID is displayed so you can also copy it into `--appid` later.

Typing an ID directly is still offered, for when you already have it.

If the list cannot be fetched — a network problem, or an account without permission to read the app list — the wizard falls back to asking you to type the ID rather than stranding you.

## Everything you already supplied is kept

Options given on the command line, or set through their `BSI_*` environment variables, are not asked about again:

```bash
butler-sheet-icons qseow create-sheet-thumbnails --host sense.acme.com -i
```

```
Already supplied, so not asked about again: --host.
```

This makes `-i` useful for filling the gaps in a command you have partly written, not only for starting from nothing.

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
