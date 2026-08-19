<!--
PUBLISHED to `next` on 2026-08-19, butler-sheet-icons-docs PR #112. Version gate 5.0.0, read
from release-please PR #974 at publish time. Publishing this completed the doc half of #1122.

NOT published as a page. Became a section of `/guide/troubleshooting`,
`#too-many-sessions-active-in-parallel`, placed at the top of `## Authentication Issues` -
it is an access failure, and that is where a reader looks for one.

RESHAPED AT PUBLICATION. The draft's "Let runs log out" bullet was dropped from the advice
list, because it told the reader to do something that is no longer theirs to do: 5.0.0 logs
out on both paths by itself. It became a `Fixed in 5.0.0` tip container explaining what the
old behaviour was and why it made the problem self-reinforcing, which is the part a reader on
an older version still needs.

WORTH KNOWING. Everything in the symptom section was observed rather than reasoned: the
selector-timeout wording, the Qlik dialog text, and the fact that QRS and the hub keep
answering while the web client is unusable all came from hitting this on the lab server on
2026-08-18. See the `qseow-lab-server` memory note for the full signature.
-->

# "Too many sessions active in parallel"

**Status:** pending publication
**Suggested target pages:** `/guide/troubleshooting`
**Version gate:** not released yet — read the open release-please PR title for the version before publishing. Do not copy a version number from this draft.

---

## What changed, in one paragraph

Butler Sheet Icons now logs out of the Qlik Sense web UI even when a run fails partway through. Previously the logout only ran on the success path, so a failed run left its session alive on the server until Qlik Sense timed it out. Because each stranded session counts against the logon user's parallel-session limit, one failed run made the next one more likely to fail — a spiral that ends with Qlik Sense refusing to open apps at all.

## The symptom this prevents

On client-managed Qlik Sense, a run that has exhausted the limit fails like this:

```
error: QSEOW: qseowProcessApp: Waiting for selector `#grid-wrap` failed
       [caused by: Waiting failed: 90000ms exceeded]
error: QSEOW PROCESS APP: Failed to process app <app id>: Waiting for selector `#grid-wrap` failed
```

That message names a selector and says nothing about sessions, which sends most people looking at the wrong thing. Two facts identify it quickly:

- **The run's own screenshots show the real error.** Open `loginpage-1.png` or `overview-before.png` in the image directory. When this is the cause, the page shows a Qlik Sense dialog reading _"You cannot access Qlik Sense because you have too many sessions active in parallel."_
- **The APIs stay healthy.** The repository API and the hub keep answering normally while the web client is unusable, so "Qlik Sense is up" does not rule this out. Only the browser-driven part of a run is affected — a `--dry-run`, which opens no browser, still works.

## If you are already in this state

Sessions are released when they time out, which is governed by the Qlik Sense proxy's session-inactivity setting. If you cannot wait, restarting the Qlik Sense Engine and Proxy services clears them. Note that a low current session count does not always mean the limit has stopped being enforced.

## Reducing the pressure

- **Let runs log out.** This happens automatically now, on both the success and failure paths. If a logout itself fails, Butler Sheet Icons says so and names the consequence rather than passing over it.
- **Watch the per-app cost.** A thumbnail run signs in once per app, plus a second time per app if `--capture-overview-after` is on (its default). Over a large tag or collection that is a lot of sessions in a short window; `--capture-overview-after false` halves it.
- **Give the runs their own account.** A dedicated service account for `--logonuserid` keeps a failed run from locking a human out of Qlik Sense, and makes the session count attributable.
