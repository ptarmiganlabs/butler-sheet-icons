# What is inside the Docker image, and its licensing (doc site update)

Target page: `docs/guide/advanced/docker.md` — **an edit to an existing page, not a new one.**

Two changes there:

1. Replace the single bullet on line 8 that currently reads "Includes an embedded Chromium browser
   and is designed to work well in air-gapped environments".
2. Add a new section, **"What is inside the image"**, after the intro bullets and before
   "Writing thumbnails to a mounted folder on Linux".

Also worth a one-line cross-link from the **"Docker Image Information"** section of
`docs/examples/docker.md`, pointing at the new section.

::: warning Version gate to fill in at publication time
Two things below are **new and unreleased**, and both need to sit behind the same version gate:

- the `/nodeapp/licenses/` directory, which did not exist before;
- the licence files kept in `/nodeapp/node_modules`. Earlier images stripped most of these to save
  space. On the 4.0.0 image the `find` command in the section below returns **23** results; on an
  image built after the fix it returns **162**. A reviewer running it against an older image will
  see a nearly empty list, so the gate has to cover this command too, not just the new directory.

Butler Sheet Icons 4.0.0 shipped on 2026-08-09 and both changes landed after it, as a `fix:` commit,
so at the time of writing there is no open release-please PR naming the next version. Read the
version from that PR before publishing rather than assuming a bump —
`docs/to-doc-site/README.md` §4.

Everything else in this draft — the embedded Chromium, `chrome://credits`, the Alpine package
database — is true of images already published and needs no gate.
:::

---

## Replacement for the bullet on line 8

> - Includes an embedded Chromium browser, so it works in air-gapped environments with no internet
>   access — see [What is inside the image](#what-is-inside-the-image)

## New section

> ## What is inside the image
>
> The image is not only Butler Sheet Icons. It also contains a **Chromium browser**, because Butler
> Sheet Icons works by opening your Qlik Sense sheets in a browser and photographing them.
>
> Shipping the browser inside the image is deliberate. It is what allows the container to run in an
> environment with no internet access — nothing has to be downloaded the first time you use it.
>
> Chromium accounts for roughly 260 MB of the image. That is most of the reason the image is as
> large as it is.
>
> ### Chromium is not Google Chrome
>
> This distinction matters if someone in your organization has to approve the image, and the two
> names are used interchangeably almost everywhere else:
>
> - **Google Chrome** and **Chrome for Testing** are Google-branded browsers, distributed under
>   Google's own terms. The Butler Sheet Icons image contains neither of them.
> - **Chromium** is the open-source project that Chrome is built from. The image uses the Chromium
>   package published by Alpine Linux, the same one Alpine ships to everybody else. It is recorded
>   as BSD-3-Clause.
>
> When you run Butler Sheet Icons **outside** Docker — as a pre-built binary — it downloads Chrome
> for Testing onto your own machine the first time it needs a browser. That is a download you
> perform, not something Butler Sheet Icons redistributes, which is why the two situations are
> handled differently.
>
> ### Where to find the licence information
>
> Every licence that applies to the image is inside the image, so a review can be completed without
> searching the internet for any of it.
>
> Start with the notice file, which lists each component and where its licence and source can be
> found:
>
> ```bash
> docker run --rm --entrypoint sh ptarmiganlabs/butler-sheet-icons:latest \
>   -c 'cat /nodeapp/licenses/NOTICE.md'
> ```
>
> The same directory holds the full licence text for Butler Sheet Icons itself and for Chromium:
>
> ```bash
> docker run --rm --entrypoint sh ptarmiganlabs/butler-sheet-icons:latest \
>   -c 'ls /nodeapp/licenses/'
> ```
>
> Three further sources, all inside the image:
>
> | What | How to see it |
> |---|---|
> | The ~740 components bundled inside Chromium itself, with their licences | The `chrome://credits` page built into the browser |
> | Licences of the Node.js packages Butler Sheet Icons uses | `find /nodeapp/node_modules -iname "LICENSE*"` |
> | Licences of every Alpine system package | `grep -E "^(P\|V\|L):" /lib/apk/db/installed` |
>
> To check which Chromium version a particular image contains:
>
> ```bash
> docker run --rm --entrypoint /usr/bin/chromium-browser \
>   ptarmiganlabs/butler-sheet-icons:latest --version
> ```
>
> ::: tip Media codecs
> The Chromium build in the image can decode the H.264 and AAC media formats. These are covered by
> patent pools, which is a separate question from the licences above.
>
> Butler Sheet Icons never decodes audio or video — it takes still pictures of Qlik Sense sheets —
> so this capability is present only because it comes as part of the standard Chromium package. It
> is mentioned here because organizations with strict patent-licensing policies will want to know
> it is there.
> :::

---

## Why this matters to administrators

The people who ask this question are usually not the Qlik Sense administrator. They are a security
reviewer, or someone in procurement, who has been handed a container image and asked what is in it
and whether the organization is allowed to run it.

Today the doc site tells them only that the image "includes an embedded Chromium browser". There is
nothing anywhere on the site about licensing, so the reviewer has to either take that on trust or go
digging. The realistic outcome is a delay, and a question that lands back on the administrator who
proposed using Butler Sheet Icons in the first place.

The section above is written so the administrator can forward the page as the answer.

## Verify before publishing

- **Read `src/licenses/NOTICE.md` in the main repository and keep this page consistent with it.**
  That file is what ships to users; this page is a pointer to it. If they disagree, the file wins.
- **Re-measure the sizes.** The ~260 MB figure was taken from the `latest` image on 2026-08-09
  (`apk info chromium` reports the installed size; `docker images` gives the total). Both move with
  every base-image and Chromium bump, and they differ between architectures — the figure above came
  from the arm64 variant. Keep the wording approximate.
- **Do not publish a specific Chromium version number.** It changes with every image build, which is
  why the section gives the command instead.
- **Confirm `/nodeapp/licenses/` exists in the published image for the version being documented**
  before the version gate is filled in. The directory is created by `COPY` lines in `src/Dockerfile`;
  if those are ever reorganized this page becomes wrong in a way no link checker can catch.
- The `#what-is-inside-the-image` anchor in the replacement bullet must match the generated heading
  anchor. Check it against the built HTML — `docs/to-doc-site/README.md` §6 explains why anchors are
  not covered by the link check.
