# `browser install` now works without internet access for a browser you already have

**Target pages:** `reference/browser.md` (the `browser install` entry), plus a troubleshooting entry
in `guide/troubleshooting.md`.

**Version gate:** confirm the next released version at publication time from the open release-please
pull request, and add `::: warning Requires BSI X.Y.Z or later` to each section.

---

## What changed

`butler-sheet-icons browser install` used to check whether the browser could be **downloaded**
before it looked at what was already on the machine. On a server with no internet access that check
fails, so the command reported:

```
Browser "chrome" version "..." cannot be downloaded. Please use the "list-available"
command to check available versions
```

— about a browser that was already installed and sitting on disk. The suggested next step,
`browser list-available`, needs internet access too, so there was no way forward.

Butler Sheet Icons now looks in the browser cache first. If the browser you asked for is already
there, it says so and stops:

```
chrome 151.0.7922.47 is already installed at
C:\butler-sheet-icons\browser-cache\chrome\win64-151.0.7922.47. Nothing to download.
To replace it, remove it first with "butler-sheet-icons browser uninstall
--browser-version 151.0.7922.47".
```

No network connection is used, and no download is attempted.

## Why this matters

This is what lets you **confirm a staged browser on the air-gapped machine itself**. Copying a
browser cache onto a server with no internet access is the documented way to set Butler Sheet Icons
up in such an environment, and running `browser install` is the natural way to check the copy
worked. Until now that check was the one thing that could not be done there.

It also works with **no options at all**. `--browser-version` defaults to `recommended`, which is a
specific browser build recorded inside Butler Sheet Icons itself rather than something it has to
look up. So on a machine with the matching browser staged:

```
butler-sheet-icons browser install
```

completes offline. Other version settings — `latest`, `stable`, or a release channel — still need
internet access, because Butler Sheet Icons has to ask the browser vendor which build those names
currently mean. That lookup happens before the cache is consulted, so those settings fail offline
even when the browser is present.

## What this changes about repeated installs

`browser install` used to install again every time it was run. It is now a **no-op when the
requested build is already present**: it reports what is installed and exits successfully without
re-downloading. If you need to replace an installed browser, uninstall it first:

```
butler-sheet-icons browser uninstall --browser-version 151.0.7922.47
```

## Three cases where it still downloads

Butler Sheet Icons only skips the download when the browser in the cache is genuinely the one it
was asked for.

**A different build.** The cache holds a different version from the one requested. See the
troubleshooting entry on version pinning — the message lists the build ids you have.

**A build for a different operating system.** A cache copied from a machine running a different
operating system cannot be used, and installing is about placing *this* machine's build, so a
foreign build never counts as already installed. Note this is stricter than the check made when
taking screenshots, which will accept a 32-bit Windows build on 64-bit Windows, or an Intel macOS
build on Apple Silicon.

**A folder with no browser in it.** If the build's folder exists but the browser program inside it
is missing — an incomplete copy, or an interrupted download — you will see:

```
A cached chrome 151.0.7922.47 directory exists at
C:\butler-sheet-icons\browser-cache\chrome\win64-151.0.7922.47, but the browser executable
is missing from it. Butler Sheet Icons will remove that directory and install the build
again, which needs internet access.
```

Butler Sheet Icons removes the incomplete folder itself and installs the build again, which works on
a machine with internet access. Nothing is lost by the removal: a folder with no browser program in
it cannot be used for anything.

On an air-gapped machine the reinstall cannot succeed, so copy the browser across again, making sure
your archiving tool includes hidden files — several skip them by default, and one of the files
Butler Sheet Icons needs is hidden.

## Note for the publishing pass

Verify every message above against the implementation before publishing, and quote them verbatim.
The `browser install` option table on `reference/browser.md` is generated — refresh it with
`npm run docs:cli-tables` rather than editing it by hand — but the prose describing what the command
does needs the update above.
