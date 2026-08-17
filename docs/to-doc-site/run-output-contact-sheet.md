# Colour run output in the terminal: the contact sheet and BSI_OUTPUT

> **Publisher note:** new page — it needs a sidebar entry in `docs/.vitepress/config.js`,
> suggested next to the run-card / dry-run pages it builds on. No generated CLI option
> tables are affected: this feature adds an environment variable, not a command-line
> option, so no table regeneration is needed. Establish the version for the gate below
> from the open release-please PR title at publication time, per this folder's README
> (it read 5.0.0 when this draft was written — re-check, do not trust the draft). The
> sample board below is generated from the real renderer — do not re-align it by hand.

::: warning Requires BSI X.Y.Z or later
Earlier versions always print the plain run card.
:::

When you run one of the three commands that change Qlik Sense apps —
`qseow create-sheet-thumbnails`, `qscloud create-sheet-thumbnails` or
`qscloud remove-sheet-icons` — Butler Sheet Icons now looks at where its output is going
and picks the richest presentation that will actually display correctly there:

- **In an interactive terminal** that supports colour and is at least 72 characters wide,
  you get the **contact sheet**: a colour board with the run plan, one summary row per
  app as it finishes, and a final verdict.
- **Everywhere else** — Windows Task Scheduler, cron, Docker, CI, output redirected to a
  file, a very narrow or colour-less console — you get the **plain run card** that
  earlier versions always printed. Nothing about scheduled or captured logs changes.

You do not need to configure anything. The selection is automatic, decided once at the
start of each run, and there is an environment variable to override it if the automatic
choice is ever wrong for your setup.

## What the contact sheet looks like

```
  ┌─ 410 × 270 ──────────────────────────────────────┐
  │                                                  │
  │   BUTLER SHEET ICONS                     X.Y.Z   │
  │   QSEoW sheet thumbnails                         │
  │                                                  │
  └──────────────────────────────────────────────────┘

  PLAN  qseow create-sheet-thumbnails

  ● server      sense.company.com       https · engine 4747 · qrs 4242
  ● api user    INTERNAL\sa_api         cert ./cert/client.pem
  ● logon user  COMPANY\svc_bsi
  ● apps        3                       0 named by --appid · 3 matched by --qliksensetag "updateSheetThumbnails"
  ● sheet part  2 of 4                  objects + sheet title
  ● exclude     tag "no-thumbnail" (2 sheets)
  ● blur        tag "confidential" (1 sheets)
  ● browser     chrome (recommended)    headless · 5s per sheet
  ○ images      ./img/qseow/<app-id>
  ● uploads to  content library "Butler sheet thumbnails"

  !  sheet thumbnails will be overwritten in 3 app(s), 2 of them published

  ────────────────────────────────────────────────────────────────

  ✓ 1/3  Sales Discovery           ██▓█░██████         10/11 up    52s
  ✓ 2/3  Operations Monitor        ████████            8/8 up      41s
  ✓ 3/3  Executive KPIs            ███░██████          9/10 up     48s

  ────────────────────────────────────────────────────────────────

  ❯ done in 2m 21s  ·  3 app(s) ok  ·  27 thumbnails uploaded
    █ 27 captured   ▓ 1 blurred   ░ 2 excluded
    images in ./img/qseow · 27 file(s) · 1.6 MB
```

The plan block at the top is the same information the plain run card prints: which
server, which identities, how many apps were selected and by which options, which
exclude and blur rules are active (with how many sheets each tag matched — a `(0
sheets)` next to a tag you typed is the fastest way to spot a misspelling), and the one
line in the block that warns about the write with no undo.

## The sheet strip

The row of block characters after each app name is a **sheet strip**: one character per
sheet, in sheet order.

| Character | ASCII fallback | Meaning                                   |
| --------- | -------------- | ----------------------------------------- |
| `█`       | `#`            | Sheet captured and its thumbnail uploaded |
| `▓`       | `:`            | Captured, then blurred                    |
| `░`       | `.`            | Excluded by one of your exclude rules     |
| `▒`       | `!`            | Not processed — the app failed here       |

This makes selection mistakes visible per app, at a glance. A mistyped
`--exclude-sheet-tag` shows up as a row of solid blocks where you expected gaps. A
mistyped `--blur-sheet-tag` shows up as a row with no `▓` in it — in every app, or only
in some, which also tells you whether the tag is missing everywhere or just applied
unevenly.

On consoles that cannot display these characters (or when you set `BSI_ASCII_ONLY=1`,
which also governs this feature), the strip uses the ASCII fallbacks above, one column
per sheet, so nothing shifts.

## When you get which output

The rules, in the order they are applied:

1. **`BSI_OUTPUT` is set** — see the next section. It wins.
2. **Log level `verbose`, `debug` or `silly`** — plain run card. At those levels you are
   debugging, and the debug stream is what you asked for.
3. **Colour terminal, at least 72 columns wide** — the contact sheet.
4. **Anything else** — the plain run card.

"Colour terminal" follows the same conventions as the rest of Butler Sheet Icons:
`NO_COLOR` disables colour, `FORCE_COLOR` forces it, `TERM=dumb` disables it, and
redirected output never counts as a terminal. A `--dry-run` on a capable terminal shows
its plan block as a board too; the detailed per-sheet dry-run report itself is unchanged.

## Overriding the choice: BSI_OUTPUT

`BSI_OUTPUT` is an environment variable, like `BSI_ASCII_ONLY` and `BSI_NO_INTERACTIVE`:
it describes your console, not one invocation, so it is not a per-command flag.

| Value   | Effect                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `board` | Force the contact sheet, even where detection would not pick it (for example, when recording a run, or on a terminal that is detected incorrectly) |
| `plain` | Force the plain run card                                                                                                                           |
| `off`   | Suppress the framed plan and verdict blocks entirely. Per-app and per-sheet progress lines still print, so the run is not silent                   |
| `live`  | Reserved for a future live view; today it behaves like automatic selection                                                                         |

Values are case-insensitive. An unrecognised value logs a warning and falls back to
automatic selection — it never stops the run, so a typo in a scheduler's environment
block cannot break a working nightly job.

Setting it for a single run:

::: code-group

```powershell [PowerShell]
$env:BSI_OUTPUT = "plain"
.\butler-sheet-icons.exe qseow create-sheet-thumbnails ...
```

```bash [bash]
BSI_OUTPUT=plain ./butler-sheet-icons qseow create-sheet-thumbnails ...
```

:::

Use `off` if a log-collection tool parses Butler Sheet Icons output line by line and
chokes on the framed blocks:

::: code-group

```powershell [PowerShell]
$env:BSI_OUTPUT = "off"
```

```bash [bash]
export BSI_OUTPUT=off
```

:::

## Scheduled and redirected runs are unchanged

The contact sheet is only ever what an interactive terminal *sees*. Redirected output is
not a terminal, so a redirected or scheduled run selects the plain run card
automatically — what lands in a file, a Task Scheduler transcript or a captured CI log
is the same plain output as in earlier versions. And when the contact sheet is shown,
the plan and verdict are not printed twice: the terminal shows the board instead of the
card.
