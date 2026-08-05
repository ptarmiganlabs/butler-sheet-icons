# Cached browser reuse (doc site update)

Target page: `docs/guide/concepts/browser-detection-and-environment-variables.md` on the doc site
(section **"### 2. Cached browser (medium priority)"**).

This is an edit to an existing page, not a new page. The page already describes step 2 correctly as
an intention — but until Butler Sheet Icons 3.12.0 the step never actually ran, so no reader could
have observed the behaviour the page describes. From 3.12.0 the description becomes true, and the
version-matching rule below needs stating because the page currently only says "a compatible
browser" without defining compatible.

## Replacement text for section 2

> ### 2. Cached browser (medium priority)
>
> If no system browser is configured, Butler Sheet Icons looks in the Puppeteer cache directory
> (for example `C:\Users\<user>\.cache\puppeteer` on Windows, or `~/.cache/puppeteer` on macOS and
> Linux).
>
> A cached browser is used when it matches both of these:
>
> - **Browser type** — the browser requested with `--browser` (`chrome` or `firefox`).
> - **Version** — if you specify an exact `--browser-version`, only a cached browser with exactly
>   that build is used. If a different version is cached, Butler Sheet Icons treats it as no match
>   and downloads the version you asked for. If `--browser-version` is `latest`, any cached build of
>   the requested browser type is accepted.
>
> When a cached browser matches, it is used as-is and nothing is downloaded. This is what makes
> repeat runs fast: the browser is downloaded once and reused on every later run, with no network
> access needed for the browser itself.
>
> Use `butler-sheet-icons browser list-installed` to see which browsers are currently cached, and
> `browser install` to add one deliberately — for example when preparing a machine that will later
> run without internet access.

## Why this matters to administrators

Before version 3.12.0 a defect prevented Butler Sheet Icons from ever finding a cached browser. In
practice it re-downloaded a browser on **every run** unless `PUPPETEER_EXECUTABLE_PATH` was set.

From 3.12.0 onwards:

- Repeat runs no longer re-download a browser, so they start faster and use far less bandwidth.
- Preparing a machine in advance with `browser install` now works as intended: the browser you
  installed is actually picked up on later runs.
- An environment with no internet access can be prepared by installing a browser once while
  connectivity is available.

Nothing needs to be reconfigured — the improvement applies automatically.

## Note for the reviewer publishing this

If a "what's new in 3.12.0" note exists, the bandwidth and startup-time improvement is worth
mentioning there too. Administrators who worked around the old behaviour by setting
`PUPPETEER_EXECUTABLE_PATH` purely to avoid repeated downloads can now drop that workaround if they
prefer, although keeping it remains perfectly valid and is still the recommended approach for
Docker and centrally managed browsers.
