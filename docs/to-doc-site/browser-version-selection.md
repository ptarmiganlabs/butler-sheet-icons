# Choosing which browser build Butler Sheet Icons uses (doc site update)

Target pages:

- `docs/guide/concepts/browser-management` — the main change. Rework the section describing
  `--browser-version` around the two keywords below.
- `docs/reference/` — update the `--browser-version` and `--browser` rows for
  `browser install`, `browser uninstall`, `qseow create-sheet-thumbnails` and
  `qscloud create-sheet-thumbnails`.
- `docs/guide/troubleshooting` — new symptom entry, see "Troubleshooting entry" below.

::: warning Requires BSI 3.12.0 or later
This describes behaviour that is not in the current release. Publish to the doc site's `next`
branch. The version number above is a placeholder — take the real one from the open
`release-please` pull request title before publishing.
:::

## Why this changed

Butler Sheet Icons needs a Chrome build to render sheets. Until now it defaulted to `latest`,
which meant "the newest Chrome build published". That sounds like the safe choice, and it is not:
Chrome ships new builds continuously, and a brand new build is sometimes one that the browser
automation library inside Butler Sheet Icons cannot control.

When that happened, every app in every run failed with a message like:

```
error: CLOUD APP (stack): TargetCloseError: Protocol error (Browser.getVersion): Target closed
error: Failed to process 2 of 2 app(s)
```

Nothing in that output suggested the browser version was the problem, and the same scheduled job
could work on one server and fail on another with identical configuration — because each server
had a different Chrome build sitting in its local cache.

## The two keywords

`--browser-version` now takes one of two words. Both work for Chrome and Firefox, so you do not
need to know what each browser vendor calls its release channels.

| Value | Meaning | How the build number is decided |
|---|---|---|
| `recommended` | The browser build this version of Butler Sheet Icons was tested with. **This is the default.** | Fixed inside Butler Sheet Icons |
| `stable` | The newest stable release of the browser. | Looked up online, each time the command runs |

**A browser is never included in the Butler Sheet Icons download.** Whichever value you use, the
browser itself has to be downloaded once and is then kept in a local cache
(`~/.cache/puppeteer`), so the first run on a new server always needs internet access. What the
two keywords differ on is *how Butler Sheet Icons decides which build number it wants* — and that
turns out to matter for a server that is offline afterwards.

**`recommended` is the right choice for almost everyone.** It is the build Butler Sheet Icons is
actually tested against, so it cannot get ahead of what Butler Sheet Icons can drive. It only
changes when you upgrade Butler Sheet Icons itself, which means:

- Every server running the same Butler Sheet Icons version uses exactly the same browser build. A
  fleet of scheduled jobs can no longer drift apart on its own.
- Once that build is in the cache, later runs need no internet access for the browser at all. The
  build number is baked into Butler Sheet Icons, so there is nothing to look up. With `stable`,
  every run first asks the vendor which build is currently newest. If that lookup fails — the
  machine is offline, or the service is unreachable — Butler Sheet Icons logs a warning and falls
  back to the newest browser already in its cache; on a machine with nothing cached, the run
  fails. A machine that is deliberately offline is better served by `recommended`: same build
  every time, and no warning noise.

Choose `stable` if you specifically need the newest stable Chrome — for example because your
security policy requires it. Two things to be aware of: it reintroduces the original risk, since
`stable` follows whatever the browser vendor has promoted and that can be a build newer than
Butler Sheet Icons has been tested with; and every run makes an internet lookup to resolve it —
when that lookup fails, the newest cached build is used instead, with a warning in the log.

Browser **release channels** are also accepted: `beta`, `dev` and `canary` for Chrome, and
`beta`, `nightly`, `devedition` and `esr` for Firefox. Like `stable`, these are looked up when
the command runs and select that channel's current build.

## Naming an exact build

You can still pin an exact build. Butler Sheet Icons now checks the format before doing anything,
so a typo is reported immediately and stops the run — it is never silently replaced with some
other build from the cache.

For **Chrome**, three forms are accepted:

| Form | Example | Selects |
|---|---|---|
| Milestone | `151` | The newest build of milestone 151 |
| Build prefix | `151.0.7922` | The newest patch of that build |
| Full build id | `151.0.7922.77` | Exactly that build |

For **Firefox**, the build id must include the channel prefix, for example `stable_153.0.3`. A
bare version number such as `152.0.1` is rejected — without the prefix it would be interpreted as
a nightly build, which is almost never what an administrator wants.

Run this to see what is available:

::: code-group

```powershell [PowerShell]
butler-sheet-icons.exe browser list-available --browser chrome
```

```bash [Bash]
./butler-sheet-icons browser list-available --browser chrome
```

:::

## If you currently use `latest`

`latest` still works — no scripts or scheduled tasks need editing. It is now treated as `stable`,
and the run logs a one-time note explaining that:

```
warn: --browser-version "latest" now means "stable" - the newest stable release of the browser.
```

This is a deliberate change. The old meaning of `latest` is what caused the failures described
above, so there is no way to ask for it any more.

If you want the safest behaviour, remove the option entirely and let the default apply, or set it
explicitly to `recommended`.

## What to expect on first run after upgrading

Butler Sheet Icons now matches the cached browser by exact build. On the first run after
upgrading, most servers will download the recommended Chrome build, because what they have cached
is whatever `latest` happened to fetch previously. This is a one-time download per server, not a
recurring cost, and it is what makes every server end up on the same known-good build.

To do it ahead of time, rather than during a scheduled run:

::: code-group

```powershell [PowerShell]
butler-sheet-icons.exe browser install --browser chrome
```

```bash [Bash]
./butler-sheet-icons browser install --browser chrome
```

:::

You can remove the old build afterwards. First list what is installed, then name the exact build
to remove:

::: code-group

```powershell [PowerShell]
butler-sheet-icons.exe browser list-installed
butler-sheet-icons.exe browser uninstall --browser chrome --browser-version <build id from the list>
```

```bash [Bash]
./butler-sheet-icons browser list-installed
./butler-sheet-icons browser uninstall --browser chrome --browser-version <build id from the list>
```

:::

`browser uninstall` accepts an exact build id, or `recommended` for the build Butler Sheet Icons
is tested with. It deliberately does **not** accept `stable` or `latest`: those refer to whatever
build the vendor currently publishes, not to a build on your machine, so they cannot safely name
a build to delete. Uninstalling never needs internet access.

## Firefox is no longer offered for thumbnails

`--browser firefox` is no longer accepted by `qseow create-sheet-thumbnails` or
`qscloud create-sheet-thumbnails`. It never actually worked there — Butler Sheet Icons drives the
browser using a Chrome-specific mechanism — but it was accepted and then failed in a way that was
hard to interpret. It is now rejected up front:

```
error: option '--browser <browser>' argument 'firefox' is invalid. Allowed choices are chrome.
```

Firefox can still be installed and removed with `browser install` and `browser uninstall`.

## Troubleshooting entry

**Symptom** — every app fails, with errors mentioning `TargetCloseError`, `Protocol error`,
`Target closed` or `Session closed`.

**Cause** — the Chrome build in use cannot be driven by Butler Sheet Icons.

**Fix** — run with `--browser-version recommended` (the default from 3.12.0). Butler Sheet Icons
now detects this itself and reports it directly, naming the build:

```
error: QSEOW: Browser build 151.0.7922.109 started but stopped responding immediately.
       This build cannot be driven by Butler Sheet Icons.
error: Use a different browser build: "--browser-version recommended" selects the build
       Butler Sheet Icons is tested with.
```

## Note for the reviewer publishing this

- Confirm the version gate against the open `release-please` PR before publishing; do not guess.
- The environment variable **names** are unchanged: `BSI_BROWSER_I_BROWSER_VERSION`,
  `BSI_BROWSER_UI_BROWSER_VERSION`, `BSI_QSCLOUD_CST_BROWSER_VERSION`,
  `BSI_QSEOW_CST_BROWSER_VERSION`. Their accepted values and the default have changed as this
  page describes. Note that `BSI_QSEOW_CST_BROWSER` and `BSI_QSCLOUD_CST_BROWSER` also changed:
  they now accept only `chrome`, and a value of `firefox` fails with
  `error: option '--browser <browser>' value 'firefox' from env 'BSI_QSEOW_CST_BROWSER' is
  invalid. Allowed choices are chrome.` — quote that variant too, it is what an admin whose
  scheduled job sets the env var will search for. There is no unprefixed `BSI_BROWSER_VERSION`
  variable — if the site claims one anywhere, that is wrong.
- An environment variable that is set but **empty** (a bare `BSI_..._BROWSER_VERSION=` line in a
  unit file) is treated as unset: the default applies.
- Cross-link the browser-management concept page and the troubleshooting entry both ways.
- The exact build ids used as examples here (`150.0.7871.24`, `151.0.7922.77`) were current in
  August 2026. Prefer describing the keywords over quoting build numbers on the published page,
  so it does not need updating every release.
