# Two log messages were renamed — corrections to already-published pages

**This page is not a new topic.** It is a correction list: two messages quoted verbatim on pages
that are **already live** have changed wording, and the live pages now quote text Butler Sheet Icons
no longer emits.

Both were changed by the work that added `--browser-executable-path`. Neither is a behaviour change
on its own — only the wording moved — but both are quoted as literal sample output, which is exactly
the case where a stale quote does damage: administrators search for the string they saw.

---

## 1. The version-override warning

**Page to fix:** `guide/advanced/docker.md` — staged originally as
`docs/to-doc-site/done/done_docker-browser-management-section-is-wrong.md`, which quotes this
message in two places.

**What the page currently shows:**

```
warn: PUPPETEER_EXECUTABLE_PATH overrides --browser-version "121.0.6167.85": the browser at
/usr/bin/chromium-browser will be used instead. Unset PUPPETEER_EXECUTABLE_PATH to use the
requested build.
```

**What Butler Sheet Icons now emits:**

```
warn: The browser executable from PUPPETEER_EXECUTABLE_PATH overrides --browser-version
"121.0.6167.85": the browser at /usr/bin/chromium-browser will be used instead. Unset
PUPPETEER_EXECUTABLE_PATH to use the requested build.
```

The message had to name *which* setting was winning, because there are now two that can: the new
`--browser-executable-path` / `BSI_BROWSER_EXECUTABLE_PATH`, and the long-standing
`PUPPETEER_EXECUTABLE_PATH`. When the new option is what won, the same message reads:

```
warn: The browser executable from --browser-executable-path / BSI_BROWSER_EXECUTABLE_PATH
overrides --browser-version "121.0.6167.85": the browser at C:\Program Files\Google\Chrome\
Application\chrome.exe will be used instead. Remove --browser-executable-path /
BSI_BROWSER_EXECUTABLE_PATH to use the requested build.
```

While updating that page, it is worth adding a line pointing Docker users at
`BSI_BROWSER_EXECUTABLE_PATH` as the way to override the browser the image ships with — it takes
precedence over the image's own `PUPPETEER_EXECUTABLE_PATH`.

## 2. The browser failure wrapper

**Page to fix:** `guide/advanced/crash-dumps.md` — staged originally as
`docs/to-doc-site/done/done_crash-dump-files.md`, which shows this message twice in an annotated
crash-dump example, once bare and once as `QseowError: ...`.

**What the page currently shows:**

```
Failed to install a browser for QSEoW app a3e0f5d2-000a-464f-998d-33d333b175d7
```

**What Butler Sheet Icons now emits:**

```
Could not obtain a browser for QSEoW app a3e0f5d2-000a-464f-998d-33d333b175d7
```

The old wording claimed an install had been attempted. That is no longer true in general: with
`--browser-executable-path` set to a file that does not exist, the run stops before any download is
considered, and telling the reader an install failed sent them looking for a network problem they
did not have. The same rename applies to the Qlik Sense Cloud form of the message
(`... for Qlik Sense Cloud app <id>`).

Crash-dump documentation is read while someone is comparing strings against a real dump, so this one
matters more than its size suggests.

## Note for the publishing pass

Check both pages for any other occurrence of either string before publishing — the quotes above are
the ones found in the staging files, and the live pages may have picked up more during editing. The
`done_` staging files themselves are history and should be left alone; this page is the record of
what changed.

<!--
PUBLISHED to `next` on 2026-08-14, butler-sheet-icons-docs PR #96. All quotes verified
fragment-by-fragment against browser-detect.js, browser-paths.js and browser-launch.js, in
both directions.

TWO CORRECTIONS to this draft. Do not trust its target list.

  1. WRONG PAGE for the version-override warning. This draft says
     guide/advanced/docker.md, "which quotes this message in two places". The string is
     NOT on docker.md at all. It is on docs/examples/browser-management.md, ONCE.
     Following the draft literally would have edited nothing and left the stale quote live.

  2. A THIRD RENAMED MESSAGE the draft does not mention:
        old: info: Using system browser (PUPPETEER_EXECUTABLE_PATH is set)
        new: info: Using system browser (from PUPPETEER_EXECUTABLE_PATH)
     The suffix is EXECUTABLE_SOURCE_LABELS in browser-paths.js, the same table that
     reworded the override warning - so it changed for the same reason and was missed.
     It was on guide/advanced/docker.md, inside the block that page presents as PROOF an
     air-gapped run never reached the internet. All five lines of that block were checked;
     the other four are correct.

The lesson is the one this draft states and then does not itself follow: sweep the site for
the string, do not trust a draft's list of where it appears.

Published to:
  - docs/examples/browser-management.md - override warning + a "wording changed" callout
  - guide/advanced/crash-dumps.md - both occurrences, + a callout so older dumps still match
  - guide/advanced/docker.md - the system-browser line, + BSI_BROWSER_EXECUTABLE_PATH added
    to "If you do not want the embedded browser", which previously offered only the
    mounted-cache route

Verified on the deployed site that the old strings appear zero times in sample output.
-->

