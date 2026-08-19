<!--
PUBLISHED to `next` on 2026-08-19, butler-sheet-icons-docs PR #112. Version gate 5.0.0, read
from release-please PR #974 at publish time. Publishing this completed the doc half of #735.

Published as a NEW Core Concepts page, `/guide/concepts/app-overview-screenshots`, with a
sidebar entry. The draft hedged between "new page or a section on run output"; a page won
because the material is a concept (what the pair is for) rather than an option reference, and
the reference tables carry the option itself.

DROPPED CLAIM. This draft costs the second sign-in as "one extra browser launch and one extra
web UI login, roughly ten seconds". The ten seconds was an estimate, never measured - a real
run's second sign-in was never timed in isolation. The published page states the extra launch
and login and says nothing about duration. Do not reinstate the figure without measuring it.

ADDED AT PUBLICATION. A `See also` section, and the note that the wizard asks about the option
under Advanced. The login-screenshot warning was reworded to say the `loginpage-after-*` files
exist only when the after-capture actually runs.
-->

# Before/after app overview screenshots on every thumbnail run

**Status:** pending publication
**Suggested target pages:** `/guide/concepts/` (new page or a section on run output), `/reference/qseow`, `/reference/qscloud`
**Version gate:** not released yet — read the open release-please PR title for the version before publishing. Do not copy a version number from this draft.

---

## What changed, in one paragraph

`qseow create-sheet-thumbnails` and `qscloud create-sheet-thumbnails` now photograph the app overview page **twice**: once before any sheet is touched, and once after the new thumbnails are in place. The two files are `overview-before.png` and `overview-after.png`, side by side in the same per-app image directory the sheet thumbnails already go to. Together they show what the run actually did to the app, in the form the people who asked for the change will recognise — the app overview as Qlik Sense draws it.

**This renames an existing file.** What used to be written as `overview-1.png` is now `overview-before.png`. If you have a script, a CI job or a report template that reads `overview-1.png` by name, it needs updating.

## Why administrators should care

A thumbnail run overwrites sheet icons in place, with no undo. Its log tells you what it decided — which sheets it updated, which it skipped and why — but a log is not evidence you can hand to the person who requested the change. The before/after pair is: two pictures of the same page, one showing rows of identical grey placeholders, the other showing each sheet carrying a miniature of its own layout.

That matters most in three situations:

| Situation                                  | What the pair gives you                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| A change request that has to be signed off | Visual proof the app now looks the way it was supposed to, without asking the requester to log in |
| A run that partly failed                   | The "after" image shows exactly which sheets ended up with an icon and which did not              |
| An audit trail in CI                       | Two artifacts per app per run, in a predictable location, with no extra tooling                   |

## Where the files are written

Below the directory named by `--imagedir` (default `./img`), per app:

```
img/qseow/<app-id>/overview-before.png     (client-managed Qlik Sense)
img/qseow/<app-id>/overview-after.png

img/cloud/<app-id>/overview-before.png     (Qlik Sense Cloud)
img/cloud/<app-id>/overview-after.png
```

::: warning The image directory also holds login screenshots
The same directory contains `loginpage-1.png`, `loginpage-2.png`, `loginpage-after-1.png` and `loginpage-after-2.png` — screenshots of the Qlik Sense login page, **with the password field filled in**. Copy out the two overview files by name. Never publish or attach the image directory wholesale.
:::

## The cost: a second sign-in

Getting an honest "after" picture requires a browser session that exists _after_ the thumbnails have been uploaded and assigned — and by that point in a run the first browser session has already logged out and closed. Butler Sheet Icons therefore signs in a second time, purely to take the closing screenshot.

Concretely, per app:

- one extra browser launch and one extra web UI login, roughly ten seconds
- two extra login-page screenshots, named `loginpage-after-1.png` and `loginpage-after-2.png` so they cannot overwrite the first sign-in's

On a single-app run that is not noticeable. On a run that sweeps fifty apps by tag or collection it is paid fifty times, and that is when you may want it off.

## Turning it off

```bash
./butler-sheet-icons qseow create-sheet-thumbnails \
    --host sense.company.com \
    --appid a1b2c3d4-0000-4a1b-9c8d-000000000001 \
    --apiuserdir INTERNAL --apiuserid sa_api \
    --logonuserdir COMPANY --logonuserid svc_bsi --logonpwd password-here \
    --capture-overview-after false
```

The option defaults to `true` and can also be set from the environment, as `BSI_QSEOW_CST_CAPTURE_OVERVIEW_AFTER` and `BSI_QSCLOUD_CST_CAPTURE_OVERVIEW_AFTER`. With it off, the run signs in once, writes `overview-before.png` and no `overview-after.png`, and behaves exactly as earlier versions did apart from that file's name.

The interactive wizard asks about it under **Advanced**, alongside the other tuning options; a guided run that accepts the defaults gets the capture.

## What it does not do

- **It never fails a run.** The screenshot is taken after the thumbnails have been created, uploaded and assigned — the work is already done and saved. If the second sign-in cannot be made, the run logs a warning naming the reason and finishes successfully. A missing `overview-after.png` means the picture is missing, never that the thumbnails are.
- **It does not run on a dry run.** A dry run changes nothing, so there is no "after" state to photograph. Dry runs open no browser at all.
- **It does not apply to the removal commands.** `qseow remove-sheet-icons` and `qscloud remove-sheet-icons` work entirely over the Qlik Sense APIs and never open a browser, so they have no web UI session to take a screenshot from — and adding one would mean requiring web UI credentials they do not otherwise need.
- **It photographs the app overview, not the hub.** Thumbnails also appear on the Qlik Sense hub, which is a different page and is not captured.

## Upgrade note

| Before           | Now                                              |
| ---------------- | ------------------------------------------------ |
| `overview-1.png` | `overview-before.png`                            |
| —                | `overview-after.png`                             |
| —                | `loginpage-after-1.png`, `loginpage-after-2.png` |

Anything reading `overview-1.png` by name should be pointed at `overview-before.png`. The positional name was renamed because, with two overview screenshots per run, a number no longer says which state the picture shows.
