# Use a browser that is already installed on the server

**Target pages:** a new section on `guide/concepts/browser-detection-and-environment-variables.md`,
option table refreshes on `reference/qseow.md` and `reference/qscloud.md`, and one troubleshooting
entry. This is also the first half of the air-gapped runbook — if that page is being written in the
same pass, this content belongs there as "Route A".

**Version gate:** confirm the next released version at publication time from the open release-please
pull request.

---

## What changed

Butler Sheet Icons can now be told exactly which browser to use:

```
butler-sheet-icons qseow create-sheet-thumbnails --browser-executable-path "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" ...
```

or, for a scheduled task where editing the command line is awkward, the same value as an environment
variable:

```
BSI_BROWSER_EXECUTABLE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

Butler Sheet Icons then uses that browser and neither downloads nor manages one.

## Why you might want this

**No internet access.** Getting a browser onto an isolated server is the whole difficulty of running
Butler Sheet Icons there. If the server already has a suitable browser — and Windows Server usually
does — this sidesteps the problem entirely, with nothing to copy across.

**Change control.** In estates where software is deployed centrally, a tool that downloads its own
browser is awkward to approve. Pointing at a browser your normal deployment process installed and
patches keeps Butler Sheet Icons out of that conversation.

**Disk space and time.** The browser Butler Sheet Icons downloads is around 150 MB per machine, and
it is downloaded again for each new version.

## Which browsers work

Any Chromium-based browser. On Windows Server that means **Microsoft Edge**, which is installed by
default on current builds, or **Google Chrome**. Both are Chromium underneath and both work with
Butler Sheet Icons unmodified.

Typical locations:

| Browser | Usual path on 64-bit Windows |
| --- | --- |
| Microsoft Edge | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` |
| Google Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` |

Confirm the real path before using it rather than trusting the table — installers vary, and both
vendors have moved these over the years.

If the server has no browser at all, both vendors publish **offline enterprise installers** designed
for exactly this: downloaded once on a connected machine, then distributed internally through your
normal software deployment process.

| Browser | Where |
| --- | --- |
| Microsoft Edge | [Microsoft Edge for Business download](https://www.microsoft.com/en-us/edge/business/download) |
| Google Chrome | [Chrome Enterprise download](https://chromeenterprise.google/download/) |

Link to those landing pages rather than to a versioned installer, and note that Butler Sheet Icons
does not update a browser installed this way — its patching stays with your normal process, which is
worth stating plainly because a browser on a Sense server is a security-review item.

## An important difference from the old environment variable

Butler Sheet Icons has always honoured `PUPPETEER_EXECUTABLE_PATH`, and it still does. The new option
differs in one deliberate way:

- **`--browser-executable-path` is a promise.** If the file is not there, the run **stops** with an
  error naming the path. Butler Sheet Icons does not quietly download a different browser instead.
- **`PUPPETEER_EXECUTABLE_PATH` is a hint.** If the file is not there, Butler Sheet Icons warns and
  carries on looking, exactly as before.

The difference is intentional. Naming a browser through a Butler Sheet Icons option states what you
want to happen; running some other browser instead is precisely the surprise a change-controlled
environment cannot tolerate. An environment variable inherited from a container image or a shell
profile is a much weaker signal, and many existing setups rely on it falling through.

When the file is missing, you will see:

```
--browser-executable-path is set to "D:\browsers\chrome.exe" but no such file exists on this
machine. Butler Sheet Icons will not fall back to downloading a browser when an executable path
has been given explicitly. Correct the path, or remove the option to let Butler Sheet Icons find
a browser itself.
```

## Precedence

When more than one is set, Butler Sheet Icons uses the first of these that names a file:

1. `--browser-executable-path` / `BSI_BROWSER_EXECUTABLE_PATH`
2. `PUPPETEER_EXECUTABLE_PATH`
3. A browser in the browser cache
4. A browser it downloads

An empty value means "not set" at every level, so `BSI_BROWSER_EXECUTABLE_PATH=` in a unit file or
`-e PUPPETEER_EXECUTABLE_PATH=""` in Docker both mean "ignore this and look further down the list".

**Docker users:** the official image sets `PUPPETEER_EXECUTABLE_PATH` to its built-in browser.
Setting `BSI_BROWSER_EXECUTABLE_PATH` overrides that, which is how you point a container at a
different browser.

## What `--browser-version` does when a browser is named

Nothing — the named browser is used as it is. If you asked for a specific build, Butler Sheet Icons
warns that the setting is being overridden, so the two settings cannot silently disagree. Version
keywords such as `recommended` do not produce that warning, because they are Butler Sheet Icons'
own choice rather than yours.

## Note for the publishing pass

Verify the flag names, the environment variable names and the error message against the
implementation before publishing, and quote the message verbatim. The option tables on the reference
pages are generated — refresh them with `npm run docs:cli-tables` rather than typing the new option
in by hand.

<!--
PUBLISHED to `next` on 2026-08-14, butler-sheet-icons-docs PR #95. Version gate 5.0.0,
read from release-please PR #974. Every message verified fragment-by-fragment against
browser-detect.js and browser-paths.js, in both directions.

This draft was ACCURATE. Precedence, the promise-vs-hint distinction, empty-value handling
and the error text all matched the implementation. Two things it did not say:

  - The option is only on `qseow create-sheet-thumbnails` and `qscloud create-sheet-thumbnails`.
    Confirmed against the Commander definitions, not assumed.
  - Publishing it required RENUMBERING the browser detection order on the concepts page, from
    three tiers to four.

THE RENUMBERING BROKE TWO LIVE LINKS, and this is the part worth remembering. The heading
"### 2. Cached browser (medium priority)" generated the anchor
`#_2-cached-browser-medium-priority`, which guide/troubleshooting.md and
guide/concepts/browser-management.md both linked to. Inserting a tier renamed it. VitePress
`docs:build` does NOT validate #fragments, so both would have shipped as dead links with a
green build.

Both were repointed, and all four headings now carry stable custom anchors:
#browser-you-named, #puppeteer-executable-path-browser, #cached-browser, #download-browser.
Use those, and add a custom anchor to any new numbered heading, rather than relying on the
generated one.

Published to:
  - guide/concepts/browser-detection-and-environment-variables.md - detection order, Strategy 2
    rewritten (#use-a-browser-already-installed-on-the-server), new BSI_BROWSER_EXECUTABLE_PATH
    env var entry, summary
  - guide/troubleshooting.md - new #browser-executable-path-missing entry
  - reference/qseow.md, reference/qscloud.md - option tables regenerated with docs:cli-tables

NOT done, deliberately: the page's "Thumbnail generation examples" still use
PUPPETEER_EXECUTABLE_PATH. They are not wrong - that variable still works - and converting
them all is a larger rewrite than this draft called for.
-->

