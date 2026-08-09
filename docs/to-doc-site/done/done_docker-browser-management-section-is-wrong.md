# The "Docker usage" section of the Browser Management examples is wrong

<!--
PUBLISHED 2026-08-09.

Doc site PR ptarmiganlabs/butler-sheet-icons-docs#61 (into next), published to production by #62.
Landed on /examples/browser-management, replacing the "Docker usage" section. Published together
with docker-external-browser-cache-example-cannot-work.md, since the two cross-link.

Not verified before publication:
  * The `browser install` command in the published text was never executed - it needs internet
    access to Google's browser download service. Its mechanism was confirmed from the code and by
    mounting a hand-prepared cache folder. The build id 151.0.7922.77 is an example and was not
    checked against Google's current index.

Not done, deliberately:
  * 121.0.6167.85 (a Chrome 121 build from early 2024) still appears 12 times elsewhere on that
    page. Normalising it is cosmetic and would have buried the corrections in an unrelated diff.
-->


Target page: `docs/examples/browser-management.md` — **replace the "Docker usage" section**
(currently lines 226–276). Nothing else on that page needs to change.

This is a correction, not new material. The section as published tells administrators to do three
things in a row, and **none of the three does what the page says it does**. Someone following it
will conclude that browser management in Docker is broken, when in fact there is simply nothing to
manage.

::: tip No version gate needed
This has always been how the image behaves. It is not a change in 4.0.0 — the published text was
never right.
:::

::: warning Publish after `docker-air-gapped-environments.md`, or adjust two links
The replacement text links to `/guide/advanced/docker#air-gapped-environments` and
`/guide/advanced/docker#browser-versions-on-an-air-gapped-host`. Both anchors are created by the
`docker-air-gapped-environments.md` draft in this folder.

The site build catches a dead **page** link but not a dead `#anchor`, so publishing this one first
would leave two links that quietly go nowhere. Either publish that draft first, or point both links
at `/guide/advanced/docker` without the fragment.
:::

---

## What the page says today

> ## Docker usage
>
> Browsers in Docker are downloaded inside the container.
>
> ```bash
> # List browsers in container
> docker run -it --rm ptarmiganlabs/butler-sheet-icons:latest browser list-installed
>
> # Install a specific Chrome build in container
> docker run -it --rm ptarmiganlabs/butler-sheet-icons:latest browser install --browser chrome --browser-version 121.0.6167.85
>
> # Use that build for sheet icons
> docker run -it --rm \
>   -v $(pwd)/images:/nodeapp/img \
>   ptarmiganlabs/butler-sheet-icons:latest \
>   qscloud create-sheet-icons \
>   … \
>   --browser chrome \
>   --browser-version 121.0.6167.85 \
>   --headless true
> ```

## Why each part is wrong

**"Browsers in Docker are downloaded inside the container."** No download happens. The image ships
with a Chromium browser already installed at `/usr/bin/chromium-browser`, and
`PUPPETEER_EXECUTABLE_PATH` inside the image points Butler Sheet Icons straight at it. That is the
whole reason the image works without internet access.

**`browser list-installed`** reports nothing, which reads like a fault but is correct:

```
info: No browsers installed
```

That command lists the *managed browser cache* — browsers Butler Sheet Icons downloaded itself. The
embedded Chromium is a system package, not a cache entry, so it is not listed. Nothing is wrong.

**`browser install` in a `--rm` container** downloads into a container that is deleted the moment
the command finishes, so the download is thrown away. It also needs internet access, which defeats
the main reason to choose the image in the first place.

**The third command does not use the build the second one installed.** Each `docker run` is a
separate container, so nothing carries over — but even within one container it would make no
difference, because the embedded browser wins. Butler Sheet Icons says so explicitly:

```
warn: PUPPETEER_EXECUTABLE_PATH overrides --browser-version "121.0.6167.85": the browser at /usr/bin/chromium-browser will be used instead. Unset PUPPETEER_EXECUTABLE_PATH to use the requested build.
```

## Proposed replacement

> ## Docker usage
>
> **The Docker image already contains a browser, and the `browser` commands are not how you manage
> it.**
>
> Chromium is installed inside the image, and the image is configured to use it. This is deliberate:
> it is what lets the container run on a server with no internet access. See
> [Air-gapped environments](/guide/advanced/docker#air-gapped-environments).
>
> ### What to expect
>
> `browser list-installed` reports nothing when run against the image:
>
> ```bash
> docker run --rm ptarmiganlabs/butler-sheet-icons:latest browser list-installed
> ```
>
> ```
> info: No browsers installed
> ```
>
> **This is correct, not a fault.** That command lists browsers Butler Sheet Icons downloaded and
> cached for itself. The browser in the image is a system package installed when the image was
> built, so it does not appear there.
>
> To see which browser the container will actually use:
>
> ```bash
> docker run --rm --entrypoint /usr/bin/chromium-browser \
>   ptarmiganlabs/butler-sheet-icons:latest --version
> ```
>
> ```
> Chromium 150.0.7871.181 Alpine Linux
> ```
>
> ### `--browser-version` has no effect inside the image
>
> Passing `--browser-version` to a thumbnail command in the container does not change which browser
> runs. Butler Sheet Icons uses the embedded one and tells you it has done so:
>
> ```
> warn: PUPPETEER_EXECUTABLE_PATH overrides --browser-version "121.0.6167.85": the browser at /usr/bin/chromium-browser will be used instead. Unset PUPPETEER_EXECUTABLE_PATH to use the requested build.
> ```
>
> Worse, on a machine without internet access, some values of `--browser-version` will make the run
> **fail** while still not changing the browser — because the version has to be resolved before the
> browser is chosen. Leave it at its default, `recommended`, when running in Docker. The reasoning is
> in [Browser versions on an air-gapped host](/guide/advanced/docker#browser-versions-on-an-air-gapped-host).
>
> ### If you need a different browser build
>
> `browser install` on its own achieves nothing here: in a `--rm` container the download lands
> somewhere that is deleted seconds later. Using a browser other than the embedded one takes three
> things together, and leaving out any one of them breaks the run.
>
> **1. Put a browser in a folder on the host that the container can see.** Mount the folder and run
> `browser install` *inside the container*, so the browser that gets downloaded is a Linux build —
> which is what a Linux container can run. This step needs internet access:
>
> ```bash
> mkdir -p "$HOME/bsi/browser-cache"
>
> docker run --rm \
>   -v "$HOME/bsi/browser-cache:/home/nodejs/.cache/puppeteer" \
>   ptarmiganlabs/butler-sheet-icons:latest \
>   browser install --browser chrome --browser-version 151.0.7922.77
> ```
>
> **2. Mount that folder on every later run, and empty `PUPPETEER_EXECUTABLE_PATH`** so the embedded
> browser stops winning.
>
> **3. Ask for the same build you installed.** Butler Sheet Icons looks for the exact build id that
> `--browser-version` resolves to, so the two have to agree:
>
> ```bash
> docker run --rm \
>   -v "$HOME/bsi/browser-cache:/home/nodejs/.cache/puppeteer" \
>   -v "$HOME/bsi/img:/nodeapp/img" \
>   -e PUPPETEER_EXECUTABLE_PATH="" \
>   ptarmiganlabs/butler-sheet-icons:latest \
>   qscloud create-sheet-thumbnails \
>   --browser-version 151.0.7922.77 \
>   --tenanturl mytenant.eu.qlikcloud.com \
>   --apikey "$BSI_API_KEY" \
>   --logonuserid user@company.com \
>   --logonpwd "$BSI_PASSWORD" \
>   --appid 12345678-1234-1234-1234-123456789012 \
>   --imagedir ./img
> ```
>
> A successful run says which one it picked:
>
> ```
> info: Using cached browser: chrome 151.0.7922.77
> info: Browser ready from cache: chrome 151.0.7922.77
> ```
>
> ::: warning Do not mount a browser folder built on Windows or macOS
> The folder has to contain a **Linux** browser. A cache filled by running Butler Sheet Icons on a
> Windows desktop contains Windows builds, and mounting it into the container does not fail cleanly —
> Butler Sheet Icons accepts the entry and then tries to start a `.exe` inside a Linux container.
>
> Filling the folder with the command in step 1 avoids this, because the download then happens inside
> the container. See
> [Docker image with external browser](/guide/concepts/browser-detection-and-environment-variables#docker-image-with-external-browser).
> :::
>
> ::: warning Clearing `PUPPETEER_EXECUTABLE_PATH` without providing a browser breaks the run
> With the variable emptied and no usable cache mounted, the container has no browser and tries to
> download one. On a host with no internet access that ends the run:
>
> ```
> info: No local browser found. Downloading and installing browser...
> error: Error installing browser: Browser "chrome" version "recommended" cannot be downloaded. Please use the "list-available" command to check available versions
> ```
>
> Mount the folder, or leave the embedded browser alone.
> :::

---

## How this was verified

Executed on 2026-08-09 against
`ptarmiganlabs/butler-sheet-icons@sha256:20f3621e937f0b9763dac6a69a53a8979a04debca2ac2666b53785a89cd1f617`
(the image `:latest` and `:4.0.0` both resolved to).

| Claim | How it was checked | Result |
|---|---|---|
| The image contains a browser and points at it | `docker image inspect … --format '{{json .Config.Env}}'` | `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`, `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` |
| `browser list-installed` reports nothing | `docker run --rm --network none … browser list-installed` | `info: No browsers installed` |
| Chromium version | `--entrypoint /usr/bin/chromium-browser … --version` | `Chromium 150.0.7871.181 Alpine Linux` |
| `--browser-version` is overridden | `resolveBrowserExecutablePath({browser:'chrome',browserVersion:'151.0.7922.77'})` inside the container | Warning quoted above; `source: "system"` returned |
| Emptying the variable with no cache fails offline | Same call with `-e PUPPETEER_EXECUTABLE_PATH=""` under `--network none` | Two log lines quoted above |
| A mounted cache is used, and the build ids must match | Same call with a cache mounted at `/home/nodejs/.cache/puppeteer` containing build `151.0.7922.77` | `Using cached browser: chrome 151.0.7922.77`, `source: "cache"` |
| A Windows build in that cache is accepted, not rejected | Same, with the cache entry named `chrome/win64-151.0.7922.77` | Returned `…/chrome-win64/chrome.exe` as the browser to run |
| `browser install` writes to the mounted folder | `src/lib/browser/browser-install.js` | Installs into `homedir()/.cache/puppeteer`, which is `/home/nodejs/.cache/puppeteer` in the container |

The override warning is emitted from `src/lib/browser/browser-detect.js`; the ordering that makes
version resolution happen before browser detection is in `src/lib/browser/browser-launch.js`.

## Note for the doc pass

The version `121.0.6167.85` used throughout the current page is a Chrome 121 build from early 2024.
Everything else on the site now uses 151-series examples. Worth normalising while the page is open,
including in the sections above the Docker one — but that is cosmetic, unlike the corrections here.
