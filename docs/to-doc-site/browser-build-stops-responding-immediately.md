# "Browser build … started but stopped responding immediately"

Suggested target pages: `/guide/troubleshooting` (symptom → cause → fix) and
`/guide/concepts/browser-management` (the `recommended` / `stable` explanation).

::: warning Requires BSI 4.2.0 or later
In earlier versions the only remedy was to pin `--browser-version recommended`.
:::

## The symptom

A run that used to work starts failing for every app, with no configuration change on your side:

```
error: CLOUD APP: Browser build 151.0.7922.138 started but stopped responding immediately. This build cannot be driven by Butler Sheet Icons.
error: Use a different browser build: "--browser-version recommended" selects the build Butler Sheet Icons is tested with. The same value can be set via the command's BSI_*_BROWSER_VERSION environment variable.
error: CLOUD APP: Protocol error (Emulation.setTouchEmulationEnabled): Session closed. Most likely the page has been closed.
```

The prefix is `QSEOW:` instead of `CLOUD APP:` on a Qlik Sense Enterprise on Windows run, and the
build id changes over time — but the shape is the same: the browser starts, then stops answering
before the first sheet is captured.

## Who this affected

Only runs that let the browser build float ahead of the one Butler Sheet Icons is tested with:

| `--browser-version` (or `BSI_*_BROWSER_VERSION`)   | Affected?                                                |
| -------------------------------------------------- | -------------------------------------------------------- |
| `recommended` — the default                        | No                                                       |
| `stable`, or its old alias `latest`                | Yes, once Chrome's stable channel moved far enough ahead |
| A release channel: `beta`, `dev`, `canary`         | Yes                                                      |
| An explicit recent build id, e.g. `151.0.7922.138` | Yes                                                      |

If you never set `--browser-version` and never set a `BSI_*_BROWSER_VERSION` environment variable,
you were not affected — the default has always been `recommended`.

Because `stable` means "whatever Chrome publishes as stable today", this could appear overnight on
a machine whose configuration had not been touched for months. That is the nature of the setting,
not a fault in your environment.

## The cause

Butler Sheet Icons drives Chrome through a browser automation library, and that library is only
tested against the Chrome builds current when it was released. Chrome's stable channel moves faster
than the library does. When Chrome moved far enough ahead, the library could no longer establish a
working session with it — Chrome launched normally, then the very first instruction sent to it
failed.

Nothing was wrong with Chrome, and nothing was wrong with your Qlik Sense environment.

## The fix

Upgrade to Butler Sheet Icons 4.2.0 or later. It ships a newer browser automation library that
drives the current Chrome stable builds again. No configuration change is needed.

If you cannot upgrade yet, pin the tested build instead:

::: code-group

```bash [Bash]
butler-sheet-icons qseow create-sheet-thumbnails \
  --browser-version recommended \
  ...
```

```powershell [PowerShell]
butler-sheet-icons qseow create-sheet-thumbnails `
  --browser-version recommended `
  ...
```

:::

`recommended` needs no internet lookup and always names one exact build, so it is also the right
choice for air-gapped and tightly firewalled environments.

## What `recommended` now points at

The build behind `recommended` moves whenever Butler Sheet Icons upgrades its browser automation
library. In 4.2.0 it is Chrome `151.0.7922.71`; in 4.1.0 it was `151.0.7922.47`.

You will see this in the log on every run:

```
info: Browser version "recommended" resolved to chrome build 151.0.7922.71 (the build this version of Butler Sheet Icons is tested with)
```

The practical consequence is that the first run after upgrading downloads the new build. The
previous one stays in the browser cache until you remove it:

```bash
butler-sheet-icons browser list-installed
butler-sheet-icons browser uninstall --browser-version 151.0.7922.47
```

## Should you go back to `stable`?

Only if you have a specific reason to track Chrome's stable channel. `stable` will drift ahead of
the tested build again — that is what it is for — and the failure above is what that looks like
when it goes too far. `recommended` is the setting that stays working without attention.
