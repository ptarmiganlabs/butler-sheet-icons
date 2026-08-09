# Third-party software in the Butler Sheet Icons container image

Butler Sheet Icons itself is MIT licensed - see `LICENSE` in the source repository.

The container image is not only Butler Sheet Icons. It redistributes a browser and a set of
supporting libraries, and those carry their own licences and their own attribution requirements.
This file records what is in the image and where the corresponding notices are, so that a security
or compliance review can answer that question from inside the image rather than from a web search.

## Chromium

The image bundles **Chromium**, installed from the Alpine Linux `community` repository, so that
Butler Sheet Icons can take screenshots without downloading a browser at run time. This is what
makes the image usable in air-gapped environments.

Chromium is **not** Google Chrome, and it is not Chrome for Testing. Those are Google-branded builds
distributed under Google's own terms. Chromium is the open-source project underneath them, and the
Alpine package is recorded as `BSD-3-Clause`.

| | |
| --- | --- |
| Licence of Chromium itself | BSD-3-Clause - full text in `chromium-LICENSE`, next to this file |
| Licences of Chromium's ~740 bundled components | `chrome://credits`, inside the browser in this image |
| Source | <https://chromium.googlesource.com/chromium/src/> |
| Alpine packaging | <https://gitlab.alpinelinux.org/alpine/aports/-/tree/master/community/chromium> |
| Version in this image | run `chromium-browser --version` |

Chromium incorporates code under a number of other licences besides BSD-3-Clause - including LGPL,
MPL and MIT. Those components, and their licence texts, are enumerated on the `chrome://credits`
page built into the browser binary. To read it:

```bash
docker run --rm --entrypoint /usr/bin/chromium-browser \
    ptarmiganlabs/butler-sheet-icons:latest \
    --headless --no-sandbox --remote-debugging-port=9222 about:blank
```

then open `chrome://credits` against that browser.

### A note on media codecs

The Alpine Chromium build has proprietary codecs enabled, so the binary can decode H.264 and AAC.
Those formats are covered by patent pools, which is a separate matter from the copyright licences
above. Butler Sheet Icons does not use video or audio decoding for anything - it screenshots Qlik
Sense sheets - so the capability is present only because it comes with the distribution package.
Organisations with strict patent-licensing policies should be aware it is there.

## Node.js and npm dependencies

The base image is the official `node:24-alpine` image. Butler Sheet Icons' own npm dependencies are
installed under `/nodeapp/node_modules`, and **their licence files are retained there**, next to the
code they apply to. The image build strips documentation and build artefacts from `node_modules` to
keep the image small, but it deliberately does not strip `LICENSE`, `LICENCE`, `COPYING` or `NOTICE`
files - removing those would drop the attribution that the MIT and BSD licences require to travel
with the code.

To list them:

```bash
docker run --rm --entrypoint sh ptarmiganlabs/butler-sheet-icons:latest \
    -c 'find /nodeapp/node_modules -iname "LICENSE*" | head -50'
```

## Alpine system packages

The image installs `chromium`, `nss`, `freetype`, `harfbuzz`, `ca-certificates`, `font-dejavu`,
`tini` and `su-exec` from the Alpine repositories. Licence metadata for every installed package is
in the Alpine package database inside the image:

```bash
docker run --rm --entrypoint sh ptarmiganlabs/butler-sheet-icons:latest \
    -c 'grep -E "^(P|V|L):" /lib/apk/db/installed'
```
