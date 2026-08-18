# Demo recordings

Regenerable demo assets for the doc site and README (issues #1000, #1001,
#1003). Everything here records the **real CLI against a real Qlik Sense
Enterprise on Windows server** - no synthesized output, no manual
post-processing. That is the point: when a release changes what the CLI
prints, `npm run demo:record` regenerates every asset from scratch.

## The narrative, and why it is a state machine

The three-panel story the doc site tells:

1. **App overview, before** - every sheet grey, no thumbnails
2. **The dry run** - the terminal showing what would change, and why
3. **App overview, after** - the same page, now with thumbnails

Panels 1 and 3 are not independent screenshots. A real BSI run must execute
between them, because nothing else changes the sheet icons - and regenerating
the pair a second time needs the app returned to its pre-thumbnail state
first. So the pipeline is:

```
reset (qseow remove-sheet-icons, recorded)
  -> dry run (recorded)
  -> real run (recorded; its overview screenshot = "before")
  -> second real run (its overview screenshot = "after")
```

BSI captures the app overview at the **start** of every real run, before any
sheet is touched, so run N's screenshot shows the state run N-1 left behind.
The second real run is an idempotent rewrite of the same thumbnails; it
exists to harvest the "after" image, and it leaves the app in the "after"
state, ready for the next `reset` to prove the loop closes.

## Prerequisites

Machine state, not repo state - anyone regenerating assets needs all of it:

1. **The hosts alias.** Published recordings must not show a real lab
   hostname (issue #1005). BSI never verifies TLS hostnames on any of its
   three connection paths, so an alias to the RFC 2606 documentation domain
   works, and every logged line is then genuinely publishable:

    ```
    # /etc/hosts on the recording machine
    10.x.x.x   sense.example.com
    ```

    Without the entry the run fails loudly at connection time - the right
    failure mode. `record.sh` warns (but continues) when the host is anything
    else, so pipeline changes can be tested against a lab address; nothing
    recorded that way may be published.

2. **Tools:** `brew install asciinema agg ffmpeg`. asciinema records the
   masters; `agg` and `ffmpeg` are only needed for `render`.

3. **`demo/demo.env`**, copied from `demo.env.example` and completed. It
   names the sacrificial demo app; never point it at a shared or production
   app. The content library it names must exist on the server.

    It must pin **everything that changes what a recording shows**, not just
    the credentials. A worktree used for live testing usually has the repo's
    own `.env` copied into it, and `demo.env` values only win where they are
    set — anything omitted falls through to `.env`. That is how
    `BSI_QSEOW_CST_INCLUDE_SHEET_PART` once leaked in at `4` against
    recordings made at `1`, producing drift that `demo:check` reported as a
    CLI change when nothing about the CLI had changed.

4. **Keep the log level at the default `info`.** The server name appears
   once at `info`; `verbose` adds session-close lines and `debug` adds full
   app and sheet URLs. A demo has no reason to widen that surface.

## Recording

```bash
npm run demo:record        # the full state machine, ~3 minutes
npm run demo:render        # re-render from committed .cast masters, no server
npm run demo:check         # text-only drift check against demo/snapshots/
```

Individual steps (each idempotent, so the pipeline is restartable):
`demo/record.sh reset|dryrun|before|after|render|check|check-update`.

| Where             | What                                                          | Committed?      |
| ----------------- | ------------------------------------------------------------- | --------------- |
| `demo/cast/`      | asciinema masters of every recording (KB of JSON each)        | yes             |
| `demo/snapshots/` | plain-text snapshots behind `demo:check`, one per command     | yes             |
| `demo/output/`    | rendered WebM/MP4/GIF, the before/after panels, the image dir | no (gitignored) |

Every recording is an asciinema `.cast` master with natural timing; idle
capping (`agg --idle-time-limit 1.5`) happens at render time, so it stays
retunable without touching a server. The pinned palette the render step feeds
to `agg` is the `AGG_THEME` constant at the top of `record.sh`.

## Branding

Three places carry Ptarmigan Labs, none of them added by hand:

- **The demo app's name.** It is the app's real name on the server, so it
  appears in the terminal output _and_ as the page title in both
  before/after screenshots from a single change. The run card clips app
  names to 20 characters, so keep the brand at the front of the name.
- **The prompt**, printed by `session.sh`. Pinned rather than inherited so
  no operator hostname is ever recorded; override with `DEMO_PROMPT` if you
  want a different one.
- **The mark**, `demo/assets/ptarmiganlabs.png`, composited top right by the
  render step, in the band beside the run header box that every recording
  leaves empty. It is committed so a checkout can render without anyone's
  brand folder being mounted.

Nothing here edits what the CLI printed. The point of #1000's ban on manual
post-processing was that hand-editing is what made the old assets
unregenerable — a step the script performs on every render is the opposite
of that, and re-running `npm run demo:record` reproduces all of it.

> **Why not VHS?** Issue #1001 planned VHS tapes for the short scripted
> tier. On vhs 0.11.0 + ttyd 1.7.7 the terminal feed deterministically
> stalls once a command emits more than a few KB in a burst — a tape running
> `seq 1 2000` is enough to reproduce, and the dry-run report is well past
> the threshold. Until a fixed vhs/ttyd pairing ships, every tier records
> through asciinema; the tape approach can be revisited afterwards.

## Verifying a recording session

- Run the full sequence **twice**. The second pass is the real test: it
  proves the reset works and the narrative is regenerable, not a one-off.
- Open every rendered asset: braille spinner and box-drawing render (no
  tofu), colour survived, and no real hostname, tenant, email or user id in
  any frame.
- Colour is gated on a TTY; asciinema allocates one, so colour being
  _absent_ means something is wrong.

## Hazards

- **Never publish the image directory or its listing.** BSI screenshots the
  Qlik login page _with credentials typed in_ (`loginpage-2.png`) into the
  same tree as the overview images. `record.sh` copies the overview panels
  out by name; keep it that way.
- **Never record the wizard's "save secrets to .env" panel.** It is the one
  place in the interactive flow that prints real secret values by design.
- **The real run is destructive and has no undo.** The demo app is the
  sacrificial fixture; the `demo.env` pin and the record.sh equality check
  are what keep the blast radius there.

## After a release

CLI output changes with releases; that is what made hand-made assets rot.
`npm run demo:check` says whether the published assets still match what the
CLI prints. When it fails after an intentional change: `npm run demo:record`,
publish the fresh assets (see `docs/to-doc-site/`), then
`demo/record.sh check-update`.

The check records each command through the same recorder, terminal geometry
and output rung as the published assets, so what it compares is the run card
and plan block a viewer actually sees — not a different, plainer rendering.
Timestamps, elapsed times and the BSI release number are normalised away, so a
release bump alone never fails the check; everything else, including the
engine schema version and the Sense build reported at connect time, counts as
drift worth looking at.

Two limits worth knowing. Every snapshot is of a `--dry-run`, because the
check has to be safe to run at any time and the real removal is destructive —
so the real run's verdict block is not covered. And a snapshot proves only
that the text still matches; whether the _rendered_ GIF or video was
regenerated from it is not something the check can see.
