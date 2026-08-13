<!--
PUBLISHED 2026-08-13 to the doc site `next` branch, PR ptarmiganlabs/butler-sheet-icons-docs#74.

Two claims below were wrong by the time this was published. Do not reuse them:

1. "None of the option tables on those pages are generated" (below) was true of the doc site's
   `main` when this was written, but doc site PR #73 landed on `next` first. `reference/browser.md`
   carries 10 `generated:cli-options` blocks. Every `--browser` row was REGENERATED from the
   Commander definitions, not hand-edited. The per-line instructions for those rows were ignored.
2. The line numbers throughout "Page-by-page" are from `main` and did not match `next`. The Firefox
   mention count for `reference/browser` was 20 on `next`, not the 18 stated below.

Also corrected while publishing: the `uninstall-all` sample transcript on `reference/browser`
carried a log line ("Removing any remaining files and directories in the browser cache directory")
that the code no longer prints. Current wording is in `browser-uninstall.js`.

Version gate used: 5.0.0, as this draft predicted. Confirmed against release PR #974.
-->

# Firefox is no longer a browser Butler Sheet Icons knows about

Butler Sheet Icons no longer accepts `--browser firefox` anywhere. `chrome` is the only value the
`--browser` option takes, on every command that has it.

> [!IMPORTANT]
> **Confirm the version number before publishing.** This ships as a breaking change, so
> release-please cuts the next major — **5.0.0**, from the current 4.1.0. If anything else lands
> first, use whatever version actually contains the change and update every mention below.

Target pages: `guide/concepts/browser-management` (the main one),
`guide/concepts/browser-detection-and-environment-variables`, `reference/browser`,
`examples/browser-management`, and `guide/troubleshooting`. Note that the last two are **not** in
the list issue #934 gave — they also carry Firefox instructions and were found by grepping the
whole site.

None of the option tables on those pages are generated: `npm run docs:cli-tables --check` reports
no `generated:cli-options` blocks in `reference/browser.md`, so every table row below has to be
edited by hand.

## What changed

Three commands used to accept `--browser firefox`:

- `butler-sheet-icons browser install`
- `butler-sheet-icons browser uninstall`
- `butler-sheet-icons browser list-available`

They no longer do. Each rejects the value while reading the command line:

```
error: option '--browser <browser>' argument 'firefox' is invalid. Allowed choices are chrome.
```

Environment values are checked against the same list, so these now fail the run before anything
else happens:

| Command | Environment variable |
| --- | --- |
| `browser install` | `BSI_BROWSER_I_BROWSER` |
| `browser uninstall` | `BSI_BROWSER_UI_BROWSER` |
| `browser list-available` | `BSI_BROWSER_LA_BROWSER` |

```
error: option '--browser <browser>' value 'firefox' from env 'BSI_BROWSER_LA_BROWSER' is invalid. Allowed choices are chrome.
```

`browser list-installed` and `browser uninstall-all` have no `--browser` option and are unchanged.

Three Firefox release channel names — `nightly`, `devedition` and `esr` — are also no longer
accepted as a `--browser-version` value, and neither are Firefox's channel-prefixed build ids such
as `stable_153.0.3`. Chrome's channels are `beta`, `dev` and `canary`:

```
error: "esr" is not a valid --browser-version for chrome.
error: Use a keyword - "recommended" (the build Butler Sheet Icons is tested against) or "stable" (the newest stable release) - or a release channel ("beta", "dev", "canary"), a milestone such as "151", a build prefix such as "151.0.7922", or a full build id such as "151.0.7922.77".
```

## Why

Thumbnails are produced by driving the browser over the **Chrome DevTools Protocol**, with a list
of startup switches only Chromium-based browsers understand. A Firefox binary cannot be driven that
way.

4.0.0 removed `firefox` from the two `create-sheet-thumbnails` commands for that reason. What it
left behind was a browser that could be installed and removed but never used: a successful
`browser install --browser firefox` put a real Firefox in the cache that no Butler Sheet Icons
command would ever launch, and nothing said so. Removing the option states plainly what was already
true.

## A note on tone for these edits

The site is single-version, so it describes the current release. Prefer "Chrome is the browser
Butler Sheet Icons uses" over "Firefox support was removed" wherever the reader does not need the
history. Keep one short historical note — the version callout on `browser-management` — for
administrators who have `--browser firefox` in a script and need to know what happened. Everywhere
else, the Firefox text should simply go.

## Page-by-page

Line numbers are from the doc site's `main` at the time of writing; confirm before editing.

### `guide/concepts/browser-management` — 16 mentions

The main page, and the only one that should keep any history.

- **Line 20** — "**Firefox**: can be installed, listed and removed with the `browser` commands, but
  **cannot be used to create thumbnails**." Delete this bullet.
- **Lines 22–37** — the "Firefox is not available for thumbnails — BSI 4.0.0 or later" warning
  block. Replace with a version callout for the new release, saying `--browser firefox` is no
  longer accepted by any command, listing the three environment variables, and giving the parse
  error above. Line 37 currently says the `browser` commands "still accept `--browser firefox`" —
  that sentence is now false and is the single most important correction on the site.
- **Lines 85–86 and 96–97** — the two "Install Firefox" examples. Delete both.
- **Line 139** — "Both work for Chrome and Firefox, so you do not need to know what each vendor
  calls its channels." Reword: the keywords work for Chrome.
- **Line 150** — drop the Firefox half of the channel list, leaving `beta`, `dev` and `canary`.
- **Line 168** — the Firefox channel-prefixed build id paragraph. Delete.
- **Lines 233–235** — the whole "Firefox Versions" section. Delete, and check the page's table of
  contents and any anchor links to `#firefox-versions`.

### `reference/browser` — 18 mentions

The command reference. Every table row and every sample transcript needs attention.

- **Lines 75, 123, 184** — the `--browser` rows for `list-available`, `install` and `uninstall`.
  Change the description from `Browser to … (chrome, firefox)` to Chrome only, and replace the
  `--browser firefox` example in the Example column.
- **Line 105** — "For Firefox the command makes no network call at all …". Delete; the command now
  always queries Google's version history service.
- **Lines 139–146** — the "Install latest Firefox (macOS)" transcript. Delete the whole example.
  Note it also uses `--browser-version latest`, which has been a deprecated alias for `stable`
  since 4.0.0, so it was doubly out of date.
- **Line 153** — the "**Firefox:** a channel-prefixed build id …" paragraph. Delete.
- **Lines 196, 209, 269, 277, 280** — sample `list-installed` and `uninstall-all` output showing a
  cached `firefox` build. Re-run the commands and paste real current output, or hand-edit the
  firefox lines out so the transcripts show Chrome builds only.
- **Lines 298–299 and 340** — two more `browser install --browser firefox` examples. Delete.

### `examples/browser-management` — 11 mentions

Not named in issue #934, but it is entirely worked examples, so every Firefox one is now a command
that fails.

- **Line 34** — sample output with a cached firefox build.
- **Lines 60–69** — the "Install Firefox (latest)" section, both the macOS/Linux and Windows
  variants. Delete.
- **Line 186** — "Firefox can be installed and removed with the `browser` commands, but cannot
  render thumbnails." Now false; replace with Chrome being the only browser.
- **Lines 339–351** — the "Available Firefox builds" examples for `list-available`. Delete both.
- **Lines 366 and 378** — two more `browser install --browser firefox` examples. Delete.

### `guide/troubleshooting` — 4 mentions

- **Line 646** — "Firefox is not an alternative here — it cannot render thumbnails." The advice is
  still right but the framing is stale; simplify to "Chrome is the only browser Butler Sheet Icons
  can use", keeping the link to Supported Browsers.
- **Line 752** — "# For Firefox dependencies:" in a Linux shared-library snippet. Delete the
  Firefox package list.
- **Lines 769 and 777** — `list-available --browser firefox` and `install --browser firefox`.
  Delete or change to `chrome`.

### `guide/concepts/browser-detection-and-environment-variables` — 2 mentions

- **Line 59** — "The thumbnail commands accept `chrome` only; the `browser` commands also accept
  `firefox`". Now false: every command accepts `chrome` only.
- **Line 96** — the `browser list-available` network-access row, "(For Firefox the command …)".
  Delete the parenthetical.

## Checks before publishing

- `grep -ri firefox docs/` over the doc site should return nothing outside `.vitepress/dist` and
  `.vitepress/cache`, which are build artifacts.
- `npm run docs:build` — it fails on dead links, which is what catches an anchor still pointing at
  the deleted `#firefox-versions` section.
- Everything goes to the `next` branch. The clone at `/Users/goran/code/butler-sheet-icons-docs`
  was on `main` when this was written.
