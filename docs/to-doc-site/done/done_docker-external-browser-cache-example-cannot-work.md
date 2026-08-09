# The "Docker image with external browser" example cannot work as written

<!--
PUBLISHED 2026-08-09.

Doc site PR ptarmiganlabs/butler-sheet-icons-docs#61 (into next), published to production by #62.
Landed on /guide/concepts/browser-detection-and-environment-variables, replacing the
"Docker image with external browser" section. Published together with
docker-browser-management-section-is-wrong.md, since the two cross-link.

Not verified before publication:
  * The `browser install` command in the published text was never executed - it needs internet
    access. See the note in the neighbouring draft.

Still open, and NOT a documentation problem:
  * detectAvailableBrowser() in src/lib/browser/browser-detect.js filters cached browsers by type
    and build id but not by platform, which is why a win64 build mounted into a Linux container is
    accepted and returned as a .exe to run. Refusing it, or at least logging the mismatch, would
    turn a confusing browser-launch failure into an obvious one.
  * Unverified on Linux: when the container adopts the owner of the mounted image directory, the
    entrypoint runs chown -R on /home/nodejs, which contains the mounted browser cache. Harmless
    when both belong to the same person; not reproducible on macOS, where bind mounts appear
    root-owned and adoption never triggers.
-->


Target page: `docs/guide/concepts/browser-detection-and-environment-variables.md` — **replace the
"Docker image with external browser" section** (currently lines 325–357).

This is a correction. The published example mounts a **Windows** browser folder into a **Linux**
container, and omits the one option that decides whether the mounted browser is accepted at all.
Following it produces a failure that does not explain itself.

::: tip No version gate needed
Both faults are in how the example was written, not in a behaviour that changed. The cache matching
described here is the 4.0.0 behaviour the same page already documents under "Cached browser
(medium priority)".
:::

::: warning One link depends on another draft
The closing paragraph links to `/guide/advanced/docker#air-gapped-environments`, an anchor created by
the `docker-air-gapped-environments.md` draft in this folder. The site build does not check
`#anchor` fragments, so publish that draft first or drop the fragment.
:::

---

## What is wrong with the published example

The example tells a Windows administrator to mount `%USERPROFILE%\.cache\puppeteer` into the
container and empty `PUPPETEER_EXECUTABLE_PATH`. Two separate things go wrong.

**1. A browser downloaded on Windows cannot run in a Linux container.** Butler Sheet Icons stores
each browser under a folder named for the operating system it was downloaded for — `win64-…` on
Windows, `linux…` on Linux. Mounting a Windows folder into the container does not fail cleanly:
Butler Sheet Icons accepts the entry and hands back a path ending in `chrome.exe`, which the
container then tries to start. The run fails at the browser, with an error about the browser rather
than about the mount.

**2. The example passes no `--browser-version`, so nothing in the folder will match.** Butler Sheet
Icons works out one exact build id first, then looks for that build and no other. The default,
`recommended`, means the build Butler Sheet Icons itself was tested with — which is almost certainly
not the build the administrator installed on their desktop.

The result is a pair of log lines that look like a contradiction:

```
info: Found 1 cached browser(s)
info: No local browser found. Downloading and installing browser...
```

Both lines are correct. A browser was found; it was not the requested build; so it was not used. On
a machine with internet access the run then downloads the right build and carries on, and the
mounted folder was pointless. On a machine without internet access the run fails:

```
error: Error installing browser: Browser "chrome" version "recommended" cannot be downloaded. Please use the "list-available" command to check available versions
```

## Proposed replacement

> ### Docker image with external browser
>
> Sometimes you want the container to use a specific browser build rather than the Chromium that
> comes with the image — usually because your organization approves browser versions centrally.
>
> This takes three things, and leaving out any one of them breaks the run:
>
> 1. A folder on the host holding a **Linux** browser build, mounted at
>    `/home/nodejs/.cache/puppeteer` in the container.
> 2. `PUPPETEER_EXECUTABLE_PATH` set to an empty string, so the embedded browser stops taking
>    priority.
> 3. `--browser-version` set to **the same build** that is in the folder.
>
> #### Fill the folder from inside a container
>
> The browser has to be a Linux build, because the container is Linux. The reliable way to get one
> is to let the container download it — then it cannot be the wrong kind. This step needs internet
> access, and is done once:
>
> ::: code-group
>
> ```bash [macOS/Linux]
> mkdir -p "$HOME/bsi/browser-cache"
>
> docker run --rm \
>   -v "$HOME/bsi/browser-cache:/home/nodejs/.cache/puppeteer" \
>   ptarmiganlabs/butler-sheet-icons:latest \
>   browser install --browser chrome --browser-version 151.0.7922.77
> ```
>
> ```powershell [Windows PowerShell]
> $cachePath = 'C:\bsi-browser-cache'
> New-Item -ItemType Directory -Path $cachePath -Force | Out-Null
>
> docker run --rm `
>   -v "${cachePath}:/home/nodejs/.cache/puppeteer" `
>   ptarmiganlabs/butler-sheet-icons:latest `
>   browser install --browser chrome --browser-version 151.0.7922.77
> ```
>
> :::
>
> ::: danger Do not mount your own desktop's browser folder
> On Windows, `%USERPROFILE%\.cache\puppeteer` holds browsers downloaded **for Windows**. Mounting it
> into the container does not produce a clear error — Butler Sheet Icons accepts the entry and then
> tries to run a `.exe` inside a Linux container. The same applies to a macOS cache.
>
> Use the command above instead, which downloads a Linux build into a folder you nominate.
> :::
>
> #### Use it
>
> ::: code-group
>
> ```bash [macOS/Linux]
> docker run --rm \
>   -v "$HOME/bsi/browser-cache:/home/nodejs/.cache/puppeteer" \
>   -v "$HOME/bsi/img:/nodeapp/img" \
>   -e PUPPETEER_EXECUTABLE_PATH="" \
>   ptarmiganlabs/butler-sheet-icons:latest \
>   qscloud create-sheet-thumbnails \
>   --browser-version 151.0.7922.77 \
>   --tenanturl "$BSI_CLOUD_TENANT_URL" \
>   --apikey "$BSI_CLOUD_API_KEY" \
>   --appid "$BSI_CLOUD_APP_ID" \
>   --imagedir ./img
> ```
>
> ```powershell [Windows PowerShell]
> $cachePath = 'C:\bsi-browser-cache'
> $imgPath = 'C:\bsi-img'
> New-Item -ItemType Directory -Path $imgPath -Force | Out-Null
>
> docker run --rm `
>   -v "${cachePath}:/home/nodejs/.cache/puppeteer" `
>   -v "${imgPath}:/nodeapp/img" `
>   -e PUPPETEER_EXECUTABLE_PATH="" `
>   ptarmiganlabs/butler-sheet-icons:latest `
>   qscloud create-sheet-thumbnails `
>   --browser-version 151.0.7922.77 `
>   --tenanturl $env:BSI_CLOUD_TENANT_URL `
>   --apikey $env:BSI_CLOUD_API_KEY `
>   --appid $env:BSI_CLOUD_APP_ID `
>   --imagedir ./img
> ```
>
> :::
>
> A run that picked up the mounted browser says so:
>
> ```
> info: Found 1 cached browser(s)
> info: Using cached browser: chrome 151.0.7922.77
> info: Browser ready from cache: chrome 151.0.7922.77
> ```
>
> ::: warning "Found 1 cached browser(s)" followed by "No local browser found"
> These two lines together mean the folder was read, but the browser in it is not the build that was
> asked for — so it was skipped. Both lines are accurate; it is the pair that is confusing.
>
> The fix is to make `--browser-version` name the build that is actually in the folder. Run
> `browser list-installed` with the folder mounted to see what that is:
>
> ```bash
> docker run --rm \
>   -v "$HOME/bsi/browser-cache:/home/nodejs/.cache/puppeteer" \
>   ptarmiganlabs/butler-sheet-icons:latest \
>   browser list-installed
> ```
> :::
>
> #### The simpler alternative
>
> If a specific build is not actually a requirement, do nothing: the browser inside the image is
> already there, already Linux, and needs no internet access. See
> [Air-gapped environments](/guide/advanced/docker#air-gapped-environments).

---

## How this was verified

Executed on 2026-08-09 against
`ptarmiganlabs/butler-sheet-icons@sha256:20f3621e937f0b9763dac6a69a53a8979a04debca2ac2666b53785a89cd1f617`
(linux/arm64). Each check ran `resolveBrowserExecutablePath()` inside the container under
`--network none`, with a prepared folder mounted at `/home/nodejs/.cache/puppeteer`.

| Claim | Folder contained | Result |
|---|---|---|
| A matching build is used | `chrome/linux_arm-151.0.7922.77` | `Using cached browser: chrome 151.0.7922.77`, `source: "cache"` |
| A Windows build is accepted rather than rejected | `chrome/win64-151.0.7922.77` | Returned `…/chrome-win64/chrome.exe` as the browser to run |
| A non-matching build is skipped, with the confusing log pair | `chrome/linux_arm-151.0.7922.77`, asked for `recommended` | `Found 1 cached browser(s)` then `No local browser found. Downloading and installing browser...`, then the download failure quoted above |
| `recommended` resolves to a fixed build | Same run | `Browser version "recommended" resolved to chrome build 150.0.7871.24` |
| The cache folder path in the container | `os.homedir()` inside the container | `/home/nodejs`, so `/home/nodejs/.cache/puppeteer` — the mount point the page already uses is correct |
| `browser install` writes there too | `src/lib/browser/browser-install.js` | Installs into `homedir()/.cache/puppeteer` |

Exact-build matching is implemented in `src/lib/browser/browser-detect.js`; the platform of a cached
entry is **not** part of that match, which is what lets the Windows build through.

## Notes for the doc pass

**The `browser install` command in the proposed text was not executed**, because it needs internet
access to Google's browser download service, which was not available while this was written. The
mechanism it relies on — that `browser install` writes into `homedir()/.cache/puppeteer`, and that
detection reads the same folder — was verified from the code and by mounting a folder that was
prepared by hand. Run it once before publishing.

**The build id `151.0.7922.77` is an example.** Confirm it still exists, or pick a current one, when
the page is written.

**`$env:PUPPETEER_EXECUTABLE_PATH = ''` in the published example does nothing** and is dropped in the
replacement. It sets the variable in the administrator's own PowerShell session; the `-e` flag on
`docker run` is what reaches the container.

**One thing to check on a Linux host before publishing.** When the container adopts the owner of the
mounted image directory, its entrypoint runs `chown -R` on `/home/nodejs` so the adopted account has
a usable home. A browser folder mounted at `/home/nodejs/.cache/puppeteer` sits inside that path. In
the normal case the folder and the image directory belong to the same person, so the ownership does
not change — but this was not reproducible on macOS, where Docker Desktop presents bind mounts as
root-owned and the adoption never triggers. Worth confirming on Linux, especially if anyone mounts a
shared browser folder.

**This may be worth a code issue rather than only a doc fix.** A cached browser whose platform does
not match the machine is silently treated as usable. Refusing it — or at least logging that a
`win64` build was found on Linux — would turn a confusing browser-launch failure into an obvious
one. That is a change to `detectAvailableBrowser` in `src/lib/browser/browser-detect.js`, which
already filters by browser type and build id and could filter by platform in the same place.
