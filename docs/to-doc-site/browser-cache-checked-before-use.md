# Butler Sheet Icons now checks a cached browser before using it

**Target pages:** `guide/troubleshooting.md` (new entries), with a short pointer added to
`guide/concepts/browser-detection-and-environment-variables.md`.

**Version gate:** confirm the next released version at publication time from the open release-please
pull request, and add `::: warning Requires BSI X.Y.Z or later` at the top of each new entry.

---

## What changed

Butler Sheet Icons keeps downloaded browsers in a cache directory, and reuses one from there instead
of downloading it again. Until now it checked only two things about a cached browser: that it was the
right browser, and that it was the right version.

That was not enough. A browser copied from a machine running a different operating system was
accepted and used, as was a cache folder whose browser files were incomplete. In both cases the run
appeared to start normally — the log even said which browser it was using — and then failed later
with an error that gave no hint of the real cause.

Butler Sheet Icons now also checks that a cached browser was **built for the operating system it is
running on**, and that the **browser program is actually present** in the cache. A browser that fails
either check is not used, and Butler Sheet Icons says why.

## Why this matters if you copy a browser cache between machines

Copying a browser cache from a machine with internet access to one without is a documented way to set
up Butler Sheet Icons in a network with no internet access. The mistake it invites is easy to make:
the machine with internet access is often an administrator's Mac or Windows laptop, while the target
is a Windows Server running Qlik Sense.

**A browser cache only works on the same operating system it was downloaded for.** A cache prepared
on macOS cannot be used on Windows, and neither can be used on Linux. If you are staging a browser
this way, download it on a machine running the same operating system as the Qlik Sense server.

Previously, getting this wrong produced a confusing failure with no obvious cause. Now it produces a
clear message, and Butler Sheet Icons falls back to downloading a browser — which succeeds if the
machine has internet access, and fails with an explanation if it does not.

## New messages, and what to do about each

### The cache came from a different operating system

```
Found 1 cached chrome build(s), but none built for this machine (platform "win64").
Cached chrome builds are for: mac_arm. A browser cache copied from a machine with a
different operating system cannot be used.
Browser cache directory: C:\butler-sheet-icons\browser-cache
```

The message names both sides: the operating system this machine needs, and the one the cached
browsers were built for. The names are the ones the browser download service uses:

| Name | Operating system |
| --- | --- |
| `win64` | 64-bit Windows |
| `win32` | 32-bit Windows |
| `mac_arm` | macOS on Apple Silicon |
| `mac` | macOS on Intel |
| `linux` | 64-bit Linux |
| `linux_arm` | Linux on ARM |

There are two combinations that are **not** a mismatch, because the machine can run the build even
though the names differ. Butler Sheet Icons accepts both without a warning:

- A **32-bit Windows** (`win32`) build on **64-bit Windows** (`win64`).
- An **Intel macOS** (`mac`) build on **Apple Silicon** (`mac_arm`), which runs through Rosetta.
  This assumes Rosetta is installed, as it normally is; if it is not, the browser will fail to
  start.

Everything else must match. In particular, no Windows build runs on Linux or macOS, and no 64-bit
build runs on a 32-bit or ARM host.

**What to do:** download the browser again on a machine running the same operating system as this
one, and copy that cache across instead. On a machine with internet access you can simply let Butler
Sheet Icons download a browser itself.

### The cache is incomplete

```
Found 1 cached chrome build(s) for this machine, but none has a usable executable. The
cache directory may be incomplete - for example copied without the browser binary, or
left behind by a failed install.
Browser cache directory: C:\butler-sheet-icons\browser-cache
```

The cache folder is there and looks right, but the browser program inside it is missing. This
usually means the copy did not include everything — some archiving tools skip hidden files by
default — or that an earlier download was interrupted.

**What to do:** delete the incomplete folder and copy or download the browser again. If you are
copying from another machine, make sure your archiving tool includes hidden files — several skip
them by default, and one of the files Butler Sheet Icons needs is hidden.

To check a copy, list the installed browsers and then confirm that the browser program is really
present in the folder shown:

```
butler-sheet-icons browser list-installed
```

That command prints the installation folder for each cached build. Note that it lists a build
whether or not the browser program inside it survived the copy, so seeing the build listed is not
by itself proof that the copy is complete — open the folder and confirm the browser program is
there.

### The requested browser version is not the one you have

```
No cached chrome build matches --browser-version "recommended" (build 138.0.7204.94).
Cached chrome builds that this machine can run: 131.0.6778.204. Set --browser-version to
one of those build ids to use it instead.
Butler Sheet Icons will now try to download chrome 138.0.7204.94, which needs internet
access. On a machine without internet access this will fail.
```

The version Butler Sheet Icons was asked for is not the one in the cache. On a machine with internet
access this is only a warning: the requested version is downloaded and the run continues. On a
machine without internet access the download cannot succeed, so the run will fail.

The message names the version **as you set it**, with the exact build it resolved to in brackets.
You will see a bracketed build even if you never set `--browser-version` at all: the default,
`recommended`, is a name for a specific build that Butler Sheet Icons ships with, and that build is
what gets looked for in the cache.

**What to do:** set `--browser-version` to one of the build ids the message lists, which uses the
browser you already have. The alternative is to stage the exact build it asked for.

::: warning Version keywords are not wildcards
`latest`, `stable` and `recommended` each resolve to **one specific build** before the cache is
searched. Switching from one keyword to another will not make Butler Sheet Icons accept a build it
already rejected — it will simply look for a different specific build. Only an exact build id from
the list in the message is guaranteed to match what you have.
:::

## What has not changed

- A healthy cache behaves exactly as before, with no new messages. A single unusable folder sitting
  beside a working browser is ignored quietly.
- Pointing Butler Sheet Icons at a browser with `PUPPETEER_EXECUTABLE_PATH` is unaffected — that
  browser is used as-is, without these checks.
- Where the browser cache lives, and how to change it with `--browser-cache-dir` or
  `BSI_BROWSER_CACHE_DIR`, is unchanged.

## Note for the publishing pass

Verify each message above against the current implementation before publishing, and quote it
**verbatim** — administrators search for these strings, so a paraphrase on the doc site is worse
than no entry at all.
