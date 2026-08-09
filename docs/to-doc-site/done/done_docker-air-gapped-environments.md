# Running the Docker image in an air-gapped environment

<!--
PUBLISHED 2026-08-09.

Doc site PR ptarmiganlabs/butler-sheet-icons-docs#57 (into next), published to production by #58.
Landed on /guide/advanced/docker as the "Air-gapped environments" section, with cross-links added
from /examples/docker and /guide/concepts/browser-detection-and-environment-variables.

Changed at publication:
  * The link to "What is inside the image" was dropped and replaced with plain text. That section
    does not exist on the doc site - its draft still lives only on the unmerged branch
    claude/docker-chromium-licensing-50d429 - and the site build does not catch dead #anchors.
    Restore the link if that draft is ever published.

Still open, and NOT a documentation problem:
  * --port is accepted by the CLI but never read anywhere in the codebase, so the web UI is always
    reached on 443/80. reference/qseow.md still documents it as "Web port" with the example
    --port 8443. The published ports table avoids the question rather than repeating the error.
-->

Closes [#936](https://github.com/ptarmiganlabs/butler-sheet-icons/issues/936).

Target page: `docs/guide/advanced/docker.md` — **an edit to an existing page, not a new one.**

Two changes there:

1. Replace the single bullet on line 8, which today is the entire coverage of air-gapped support.
2. Add a new section, **"Air-gapped environments"**, after "Writing thumbnails to a mounted folder
   on Linux".

Also worth a one-line cross-link from `docs/examples/docker.md` (line 5 already claims air-gapped
support without explaining it) and from
`docs/guide/concepts/browser-detection-and-environment-variables.md` ("Docker image (embedded
browser)" section).

::: tip No version gate needed
Everything below is true of the published **4.0.0** image and of earlier images — the embedded
browser and the two environment variables that point at it have been in the image for a long time.
4.0.0 is the current release (published 2026-08-09) and there is no open release-please PR, so
nothing here is unreleased.

The one exception is the `--user` / mounted-folder-ownership behaviour referenced from the worked
example, which the doc site already gates at 4.0.0 on the same page.
:::

::: warning Depends on a neighbouring draft
The proposed text links to a **"What is inside the image"** section that does not exist on the site
yet. It comes from `docs/to-doc-site/docker-image-third-party-licences.md`, which currently lives
only on the unmerged branch `claude/docker-chromium-licensing-50d429` and is **not** in
`docs/to-doc-site/` on `main`.

If that draft is published first, keep the link. If not, replace
`[What is inside the image](#what-is-inside-the-image)` with a plain sentence — the site build fails
on dead links, but an anchor within the same page is **not** checked by the build, so a stale anchor
would ship silently.
:::

---

## Replacement for the bullet on line 8

> - Includes an embedded Chromium browser, so it needs no internet access at all — see
>   [Air-gapped environments](#air-gapped-environments)

---

## New section

> ## Air-gapped environments
>
> The Docker image is the easiest way to run Butler Sheet Icons on a server that has no internet
> access. Everything it needs to open your Qlik Sense sheets and photograph them — including the
> browser — is already inside the image. Nothing is downloaded at run time.
>
> ### "Air-gapped" does not mean "no network"
>
> This is the one thing to get right before anything else.
>
> The container needs **no internet access**. That is what the embedded browser buys you: on a
> machine with internet, Butler Sheet Icons would download a browser the first time it needed one,
> and inside this image it never has to.
>
> The container still needs **network access to your Qlik Sense server**. That is not internet
> access — it is a route to a server on your own network — but it is a network requirement, and a
> container with no networking at all cannot do the job.
>
> If you take away the container's network entirely, the run fails as soon as it tries to talk to
> Qlik Sense:
>
> ```
> error: QSEOW CONTENT LIBRARY 1 (stack): Error: QRS request error:Error: getaddrinfo EAI_AGAIN qlik-server.company.com
> ```
>
> ::: warning `--network none` is a test, not a deployment mode
> You will see `--network none` used further down this page. It is there to **prove** that the
> browser inside the image works with no internet whatsoever. A real run started that way cannot
> reach Qlik Sense and will always fail. Do not carry it over into your scheduled job.
> :::
>
> ### What the container needs to reach
>
> For **Qlik Sense Enterprise on Windows**, all three of these are on your own Sense server:
>
> | Destination | Port | Used for | Option that changes it |
> |---|---|---|---|
> | Qlik Sense proxy (the web UI) | 443 for `https`, 80 for `http` | The browser opens each sheet here, the same way a user would | — |
> | Qlik Sense Engine Service | 4747 | Reading which sheets an app contains | `--engineport` |
> | Qlik Sense Repository Service (QRS) | 4242 | Looking up apps and tags, and uploading the finished thumbnails to the content library | `--qrsport` |
>
> Ports 4747 and 4242 are certificate-authenticated, which is why the QSEoW examples mount a
> certificate directory.
>
> **Outbound internet access is not needed for any of this**, provided you leave `--browser-version`
> alone — see [Browser versions on an air-gapped host](#browser-versions-on-an-air-gapped-host)
> below.
>
> ::: tip Qlik Sense Cloud is a different story
> Qlik Sense Cloud lives on the public internet, so a genuinely air-gapped host cannot use the
> `qscloud` commands at all. Everything on this page is about **QSEoW**.
> :::
>
> ### Why the image is the easiest option
>
> The image already contains a Chromium browser — around 260 MB of the image, and the reason it is
> as large as it is. See [What is inside the image](#what-is-inside-the-image) for the full
> inventory.
>
> Two environment variables are set inside the image and point Butler Sheet Icons at that browser:
>
> ```
> PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
> PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
> ```
>
> You do not need to set these yourself, and in normal use you should not change them. They are what
> makes the container decide which browser to use **without asking the internet first**.
>
> ### Getting the image across the gap
>
> The image itself has to get onto the air-gapped host somehow. There are two usual routes; pick
> whichever matches how your organization already moves software.
>
> #### Decide which version you are approving
>
> Before either route, decide what you are transferring. `:latest` moves whenever a new release
> ships, which is usually not what a change-controlled environment wants. These tags are published:
>
> | Tag | Points at |
> |---|---|
> | `latest` | The newest release. Changes over time. |
> | `4` | The newest 4.x release. |
> | `4.0` | The newest 4.0.x release. |
> | `4.0.0` | Exactly that release. Does not move. |
>
> Even a version tag can in principle be re-pushed. For an audit trail that cannot move at all, pin
> by digest:
>
> ```bash
> docker pull ptarmiganlabs/butler-sheet-icons@sha256:20f3621e937f0b9763dac6a69a53a8979a04debca2ac2666b53785a89cd1f617
> ```
>
> That digest is the 4.0.0 image. Find the digest of any image you already have with:
>
> ```bash
> docker image inspect ptarmiganlabs/butler-sheet-icons:4.0.0 --format '{{index .RepoDigests 0}}'
> ```
>
> #### Route 1: transfer the image as a file
>
> On a machine that **does** have internet access:
>
> ```bash
> docker pull --platform linux/amd64 ptarmiganlabs/butler-sheet-icons:4.0.0
> docker save ptarmiganlabs/butler-sheet-icons:4.0.0 -o butler-sheet-icons-4.0.0.tar
> ```
>
> Move `butler-sheet-icons-4.0.0.tar` across the gap by whatever means your organization allows, then
> on the air-gapped host:
>
> ```bash
> docker load -i butler-sheet-icons-4.0.0.tar
> ```
>
> which reports:
>
> ```
> Loaded image: ptarmiganlabs/butler-sheet-icons:4.0.0
> ```
>
> ::: warning `--platform` is not optional if the two machines differ
> `docker save` only packs the processor architecture the staging machine actually pulled. Pull on an
> Apple Silicon Mac and you get an ARM64-only archive, which will not run on an x64 Linux server —
> even though the tag itself covers both architectures.
>
> Almost every Qlik Sense server is x64, so `--platform linux/amd64` is the right choice for nearly
> everyone. If you prefer, the per-architecture tags `4.0.0-amd64` and `4.0.0-arm64` do the same job
> and are harder to get wrong.
> :::
>
> The archive is about **355 MB**. Compressing it is not worth the effort — the layers inside are
> already compressed, so gzip saves well under 1%.
>
> #### Route 2: publish to an internal registry
>
> If you run an internal registry — Artifactory, Harbor, ECR, or similar — mirror the image into it
> once, and the air-gapped hosts pull from there like any other internal image:
>
> ```bash
> # On a machine with internet access
> docker pull --platform linux/amd64 ptarmiganlabs/butler-sheet-icons:4.0.0
> docker tag ptarmiganlabs/butler-sheet-icons:4.0.0 registry.internal.company.com/qlik/butler-sheet-icons:4.0.0
> docker push registry.internal.company.com/qlik/butler-sheet-icons:4.0.0
> ```
>
> ```bash
> # On the air-gapped host
> docker pull registry.internal.company.com/qlik/butler-sheet-icons:4.0.0
> ```
>
> This is the better route if more than one host needs the image, or if you already scan images
> centrally before they are allowed in.
>
> ### Verify it before going near production
>
> These checks need nothing except the image itself. Run them on the air-gapped host after loading
> the image, before you point anything at a production Qlik Sense server.
>
> `--network none` gives the container no networking at all, which is exactly the point: whatever
> succeeds under it cannot possibly have used the internet.
>
> **1. Butler Sheet Icons starts with no network:**
>
> ```bash
> docker run --rm --network none ptarmiganlabs/butler-sheet-icons:4.0.0 --version
> ```
>
> ```
> 4.0.0
> ```
>
> **2. The embedded browser is present and runs:**
>
> ```bash
> docker run --rm --network none \
>   --entrypoint /usr/bin/chromium-browser \
>   ptarmiganlabs/butler-sheet-icons:4.0.0 --version
> ```
>
> ```
> Chromium 150.0.7871.181 Alpine Linux
> ```
>
> The exact build depends on which Chromium version Alpine Linux was publishing when the image was
> built, so a different image may print a different number. What matters is that a version prints at
> all — that means the browser is there and can start.
>
> **3. The browser can actually render a page with no network:**
>
> ```bash
> docker run --rm --network none \
>   --entrypoint /usr/bin/chromium-browser \
>   ptarmiganlabs/butler-sheet-icons:4.0.0 \
>   --headless --no-sandbox --disable-gpu --dump-dom about:blank 2>/dev/null
> ```
>
> ```
> <html><head></head><body></body></html>
> ```
>
> ::: tip The `2>/dev/null` is deliberate
> Without it this command prints around 130 lines of Chromium diagnostics — complaints about D-Bus,
> Vulkan and the GPU, all marked `ERROR`. They are normal for a browser running headless in a
> container with no desktop and no graphics card, and they do not mean the check failed. The
> `2>/dev/null` hides them so you can see the one line that matters.
>
> Judge this check on the `<html>` line, not on the absence of error text.
>
> The commands on this page are written for a Linux shell, since that is where an air-gapped Docker
> host almost always is. In PowerShell the equivalent is `2>$null`.
> :::
>
> **4. A real run says which browser it chose.** Once you point the container at Qlik Sense, a
> healthy air-gapped run logs this sequence. It is worth searching your logs for, because it is the
> proof that Butler Sheet Icons never went looking for a browser on the internet:
>
> ```
> info: Browser version "recommended" resolved to chrome build 150.0.7871.24 (the build this version of Butler Sheet Icons is tested with)
> info: Checking for available browsers...
> info: Found system browser at: /usr/bin/chromium-browser
> info: Using system browser (PUPPETEER_EXECUTABLE_PATH is set)
> info: Browser ready from system: chrome system-installed
> ```
>
> ::: tip Two different version numbers, and that is fine
> The first line names the build Butler Sheet Icons was tested against. The browser that actually
> runs is the one in the image, which is a different build — the last line says `system-installed`
> rather than a version number for exactly that reason.
>
> The two numbers are not supposed to match, and a mismatch is not something to fix.
> :::
>
> ### A complete QSEoW example
>
> On the air-gapped host, with the image already loaded:
>
> ```bash
> mkdir -p "$HOME/bsi/img"
> # $HOME/bsi/cert holds client.pem and client_key.pem, exported from the QMC
>
> docker run -it --rm \
>   --name butler-sheet-icons \
>   -v "$HOME/bsi/img:/nodeapp/img" \
>   -v "$HOME/bsi/cert:/nodeapp/cert" \
>   ptarmiganlabs/butler-sheet-icons:4.0.0 \
>   qseow create-sheet-thumbnails \
>   --host qlik-server.company.com \
>   --appid a3e0f5d2-000a-464f-998d-33d333b175d7 \
>   --apiuserdir Internal \
>   --apiuserid sa_api \
>   --logonuserdir Internal \
>   --logonuserid your-username \
>   --logonpwd your-password \
>   --contentlibrary "Butler sheet thumbnails" \
>   --sense-version 2025-Nov \
>   --imagedir ./img
> ```
>
> Notice what is **not** in that command: nothing about browsers. That is the whole point — on an
> air-gapped host the browser question is already answered by the image.
>
> Two details that matter more here than elsewhere:
>
> - **Mount a folder you own** for the images. On a Linux host the container adopts the owner of the
>   mounted image directory so the thumbnails belong to you — see
>   [Writing thumbnails to a mounted folder on Linux](#writing-thumbnails-to-a-mounted-folder-on-linux).
>   That directory has to be writable; a `:ro` mount there stops the run.
> - **The certificate directory is only ever read**, so mounting it `:ro` is fine and is a reasonable
>   precaution for files that authenticate you to Qlik Sense.
>
> ### Browser versions on an air-gapped host
>
> Leave `--browser-version` alone. The default, `recommended`, is the only value that never needs the
> internet.
>
> This surprises people, because the image contains a browser and it seems like the version question
> is settled. It is not quite: Butler Sheet Icons works out which browser build was asked for
> **before** it looks at which browsers are available, and some values can only be answered by asking
> the browser vendor's version service — a service that does not exist on your network.
>
> | `--browser-version` | On an air-gapped host |
> |---|---|
> | `recommended` (the default) | **Works.** No lookup — the answer is built into Butler Sheet Icons. |
> | `stable`, `latest`, a channel such as `beta` | **Works, but slowly and noisily.** The lookup fails, two warnings are logged, and the run continues with the embedded browser. Costs several seconds per run, waiting for a name lookup that cannot succeed. |
> | A milestone or build prefix, e.g. `151` or `151.0.7922` | **Fails the whole run.** The lookup fails and Butler Sheet Icons stops rather than quietly running a build you did not ask for. |
> | A full build id, e.g. `151.0.7922.77` | **Works, but is ignored.** No lookup is needed, and the embedded browser is used regardless. Butler Sheet Icons warns that your pin was overridden. |
>
> In the failing case, the reported error names the host that could not be reached:
>
> ```
> getaddrinfo EAI_AGAIN googlechromelabs.github.io
> ```
>
> That host is Google's index of Chrome builds. It is on the public internet, so an air-gapped host
> will never reach it — which is the whole reason to leave `--browser-version` at `recommended`.
>
> The two warnings in the second case are:
>
> ```
> warn: Could not resolve --browser-version "stable": getaddrinfo EAI_AGAIN googlechromelabs.github.io
> warn: Falling back to the newest browser already in the local cache.
> ```
>
> The second warning mentions a local cache. Inside the Docker image that cache is empty, and the
> run does not need it — the embedded browser is found first, and the next line will be
> `Found system browser at: /usr/bin/chromium-browser`. There is no cache to go and populate.
>
> The bottom line: **inside the Docker image, `--browser-version` cannot change which browser runs.**
> All it can do is decide whether your run needs the internet. See
> [Browser detection and environment variables](/guide/concepts/browser-detection-and-environment-variables)
> for the full picture.
>
> ### If you do not want the embedded browser
>
> Some organizations require a centrally approved browser build rather than the one in the image.
> Set `PUPPETEER_EXECUTABLE_PATH` to an empty string and mount a browser cache from the host, and
> Butler Sheet Icons will use that instead. This needs no internet either, as long as the cache is
> populated before the machine goes offline.
>
> That is described on
> [Browser detection and environment variables](/guide/concepts/browser-detection-and-environment-variables#docker-image-with-external-browser)
> and is not repeated here.
>
> ### Running Butler Sheet Icons air-gapped without Docker
>
> The pre-built binaries contain no browser, so an air-gapped host running them has to be given one
> up front. See
> [Strategy 3: use a pre-cached browser](/guide/concepts/browser-detection-and-environment-variables#strategy-3-use-a-pre-cached-browser-semi-offline).

---

## How this was verified

All of it was executed on 2026-08-09 against the published image
`ptarmiganlabs/butler-sheet-icons@sha256:20f3621e937f0b9763dac6a69a53a8979a04debca2ac2666b53785a89cd1f617`,
which is what `ptarmiganlabs/butler-sheet-icons:latest`, `:4`, `:4.0` and `:4.0.0` all resolved to at
the time. Re-run before publishing rather than trusting these numbers.

| Claim | How it was checked | Result |
|---|---|---|
| Chromium runs with no network at all | `docker run --rm --network none --entrypoint /usr/bin/chromium-browser … --dump-dom about:blank` | `<html><head></head><body></body></html>`, exit 0 |
| …and prints ~130 lines of stderr while doing so | Same command, `2>&1 >/dev/null \| wc -l` | 130 |
| Chromium version | `--entrypoint /usr/bin/chromium-browser … --version` | `Chromium 150.0.7871.181 Alpine Linux` |
| Chromium size | `apk info -s chromium` inside the container | 263 MiB installed |
| Butler Sheet Icons starts offline | `docker run --rm --network none … --version` | `4.0.0` |
| The two environment variables | `docker image inspect … --format '{{json .Config.Env}}'` | Both present, values as quoted |
| Browser detection resolves offline | `detectAvailableBrowser({browser:'chrome'})` run inside the container under `--network none` | `{"executablePath":"/usr/bin/chromium-browser","source":"system","browser":"chrome","buildId":"system-installed"}` |
| The healthy-run log sequence | `resolveBrowserExecutablePath()` under `--network none` | Exactly as quoted, including the `resolved to chrome build 150.0.7871.24` line |
| `--browser-version` behaviour | `resolveBrowserExecutablePath()` under `--network none` with `recommended`, `stable`, `151`, `151.0.7922.77` | Works / warns and continues / throws / works but overridden. Elapsed: 0 s, ~6 s, ~5 s, 0 s |
| Losing the network fails at Qlik Sense | Full `qseow create-sheet-thumbnails` under `--network none` with a self-signed certificate pair | `QRS request error:Error: getaddrinfo EAI_AGAIN qlik-server.company.com`, after about 5 s |
| A read-only certificate mount is fine | Same run with `-v …/cert:/nodeapp/cert:ro` | Reached the Qlik Sense connection, so the certificates were read successfully |
| Published tags | Docker Hub API, `/v2/repositories/ptarmiganlabs/butler-sheet-icons/tags/` | `latest`, `4`, `4.0`, `4.0.0` all share one multi-arch digest; `…-amd64` and `…-arm64` variants are single-architecture |
| The multi-arch manifest, from the registry | `docker buildx imagetools inspect ptarmiganlabs/butler-sheet-icons:latest` | `linux/amd64` (`ae7892c8…`) and `linux/arm64` (`1a39c8ed…`), each with an attestation manifest |
| `4.0.0-amd64` really is amd64 | `docker buildx imagetools inspect ptarmiganlabs/butler-sheet-icons:4.0.0-amd64` | One `linux/amd64` manifest, `ae7892c8…` — the same one the multi-arch tag carries |
| Pinning by digest works | `docker pull ptarmiganlabs/butler-sheet-icons@sha256:20f3621e…` | `Status: Image is up to date for …@sha256:20f3621e…` |
| `docker save` is single-architecture | Unpacked the archive and compared the manifests it references against the blobs it contains | Index lists `linux/amd64` and `linux/arm64`; only the `linux/arm64` manifest blob (`1a39c8ed…`) is present — the `linux/amd64` one (`ae7892c8…`) is not |
| Archive size | `docker save` then `gzip -c` | 355 MB, gzip 354 MB |
| `docker load` round trip | `docker load -i` | `Loaded image: ptarmiganlabs/butler-sheet-icons:latest` |
| Ports | `src/lib/qseow/qseow-enigma.js`, `qseow-qrs.js`, `qseow-process-app.js` | Engine `--engineport` 4747, QRS `--qrsport` 4242, browser URL built with no port so 443/80 |

### Two things deliberately **not** claimed as end-to-end verified

**The `--browser-version 151` failure was verified one level down, not through a full run.** A
complete `qseow create-sheet-thumbnails` under `--network none` never reaches the browser at all —
it fails earlier, at the content library check, because Qlik Sense is unreachable too. On a real
air-gapped host, where Qlik Sense *is* reachable, that earlier check succeeds and the run proceeds
to the browser, which is the point at which the pin fails. The behaviour was therefore confirmed by
calling `resolveBrowserExecutablePath()` directly inside the container.

**The image was *run* on `linux/arm64` only.** The `linux/amd64` manifest was confirmed to exist and
to be what `4.0.0-amd64` points at, and it is built from the same `src/Dockerfile` in the same
workflow run — but no command was executed inside it. The Chromium build number quoted above
therefore comes from the ARM64 image, which is why the text tells readers to judge that check on "a
version prints" rather than on matching the string.

## Notes for the doc pass

**`--port` does nothing, and `reference/qseow.md` says otherwise.** The option is defined
(`BSI_QSEOW_CST_PORT`, described as "Qlik Sense http/https port") but its value is never read
anywhere in the codebase. The browser URL is built as `https://<host>[/<prefix>]/sense/app/<id>`
with no port, so the web UI is always reached on 443, or 80 when `--secure false` is used. The
reference page currently documents it as "Web port" with the example `--port 8443`, which will not
work.

This is a **code** defect rather than a documentation one, and the ports table above is written to
be correct either way — it simply does not offer `--port` as the thing that changes the web port.
Worth raising as its own issue rather than papering over on the doc site.

**When #809 lands**, the native/Windows air-gapped page and this section should link to each other.
This section deliberately says only one sentence about binaries, so there is nothing to keep in
sync.
