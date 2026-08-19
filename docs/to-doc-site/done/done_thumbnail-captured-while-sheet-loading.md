<!--
PUBLISHED to `next` on 2026-08-19, butler-sheet-icons-docs PR #112. Version gate 5.0.0, read
from release-please PR #974 at publish time. Publishing this completed the doc half of #1119.

NOT published as a page. The doc site has a single `/guide/troubleshooting` page rather than a
troubleshooting folder, so this became a section in it,
`#thumbnail-shows-loading-screen`, placed at the end of the run-failure material and before
`## Authentication Issues`.

DROPPED SECTION. "Why Butler Sheet Icons does not simply wait longer by itself" was left out.
It explains an implementation choice - that a readiness signal differs across Sense versions
and platforms - which reads as a design note rather than troubleshooting, and the section is
already long. The reasoning is preserved in the #1119 pull request if it is ever wanted.

FIXED BEFORE PUBLICATION. The draft's "Checking the result" section linked the after-run
overview screenshot as a placeholder `(#)`, which would have failed the doc-site build. It now
names `--capture-overview-after` in prose, and the published section links
`/guide/concepts/app-overview-screenshots` instead.
-->

# When a thumbnail shows the loading screen instead of the sheet

**Status:** pending publication
**Suggested target pages:** `/guide/troubleshooting`, and a note on `--pagewait` in `/reference/qseow` and `/reference/qscloud`
**Version gate:** not released yet — read the open release-please PR title for the version before publishing. Do not copy a version number from this draft.

---

## What changed, in one paragraph

Butler Sheet Icons now warns when it photographed a sheet before Qlik Sense had finished drawing it. Previously such a run reported complete success while quietly uploading a picture of Qlik's "opening the sheet" screen as that sheet's thumbnail. Nothing is captured differently and no run outcome changes — the situation simply stops being silent.

## The warning

```
Sheet 4 ('Regional sales') was still opening when its thumbnail was captured, so the image
shows Qlik Sense's loading screen rather than the sheet. It was uploaded and assigned anyway.
Raise --pagewait (currently 1) and run again.
```

## Why it happens

`--pagewait` is a **fixed wait, not a readiness check**. Butler Sheet Icons navigates to a sheet, waits that many seconds, and takes the picture — whatever is on screen at that moment. It does not know whether the sheet has finished rendering.

How long a sheet takes to draw depends on the chart count, the data volume, the server's load and the network. So the same `--pagewait` can be comfortably enough for one sheet and too short for the next, and the same app can produce good thumbnails one day and loading screens the next. It is a race, and the sheets that lose it are not always the same ones.

## What to do about it

**Raise `--pagewait`.** The default is 5 seconds. If you have lowered it, or your sheets are heavy, raise it until the warning stops appearing:

```bash
./butler-sheet-icons qseow create-sheet-thumbnails \
    --host sense.company.com \
    --appid a1b2c3d4-0000-4a1b-9c8d-000000000001 \
    --apiuserdir INTERNAL --apiuserid sa_api \
    --logonuserdir COMPANY --logonuserid svc_bsi --logonpwd password-here \
    --pagewait 15
```

The cost is run time, paid once per sheet: `--pagewait 15` over 40 sheets adds about seven minutes.

**Then run again.** A rerun overwrites the bad thumbnails, and the sheets that were captured correctly are simply recaptured. There is nothing to clean up.

## Checking the result

If the after-run overview capture is enabled (`--capture-overview-after`, on by default), `overview-after.png` in the image directory shows the app overview as Qlik Sense draws it once the run has finished — a sheet whose thumbnail is a loading screen is obvious there, because it appears blank or shows a faint monitor icon where the miniature should be.

## Why Butler Sheet Icons does not simply wait longer by itself

Waiting for a definitive "this sheet has finished" signal would be better than a fixed sleep, and may come later. It is not a small change: the signal differs between Qlik Sense versions and between client-managed and Qlik Cloud, and getting it wrong in the other direction — deciding a sheet is ready when it is not, or waiting forever for one that never settles — would be worse than the current honest report. Until then, the warning tells you when the fixed wait was too short for a given sheet, which is the information you need to choose a better value.
