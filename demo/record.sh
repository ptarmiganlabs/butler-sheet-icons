#!/usr/bin/env bash
#
# Demo recording pipeline (issues #1000, #1001).
#
# The three-panel narrative - app overview before, the dry run, app overview
# after - is a STATE MACHINE over a real app, not a set of independent
# captures: a real BSI run must execute between the two overview images,
# because nothing else changes the sheet icons.
#
#   reset (recorded) -> dry run (recorded) -> real run (recorded, yields
#   "before") -> second real run (yields "after")
#
# The overview screenshot is taken at the START of every real run, before any
# sheet is touched, so run N's overview-1.png shows the state run N-1 left
# behind. That is why the "after" image needs a second real run - which is
# also a harmless idempotent rewrite of the same thumbnails.
#
# Every step is idempotent, so the whole script is restartable: re-run it, or
# re-run a single step by name.
#
# Recording tool: asciinema, for every tier. The masters in demo/cast/ are a
# few KB of JSON each and are committed; GIF/MP4/WebM are derived from them
# by the render step and are not. (Issue #1001 planned VHS for the short
# scripted tier, but vhs 0.11.0 + ttyd 1.7.7 deterministically stall on
# output bursts of more than a few KB - `seq 1 2000` inside a tape is enough
# to reproduce - so every recording goes through asciinema until a fixed
# pairing ships.)
#
# Usage:
#   demo/record.sh [all|reset|dryrun|before|after|render|check|check-update]
#
#   all     reset + dryrun + before + after + render (the default)
#   reset   record qseow remove-sheet-icons doing its real removal
#   dryrun  record qseow create-sheet-thumbnails --dry-run
#   before  real run, recorded; harvest the "before" overview image
#   after   second real run, unrecorded; harvest the "after" overview image
#   render  re-render shareable GIF/MP4/WebM from the committed .cast
#           masters - touches no server
#   check   text-only drift check of every recorded command against
#           demo/snapshots (needs the lab, like every recording step)
#
# The demo app is named by demo/demo.env and is a SACRIFICIAL FIXTURE: the
# real runs overwrite its sheet icons in place, and the reset removes them.
# Never point demo.env at a shared or production app.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEMO_DIR="$REPO_ROOT/demo"
OUT_DIR="$DEMO_DIR/output"
CAST_DIR="$DEMO_DIR/cast"
SNAP_DIR="$DEMO_DIR/snapshots"
ENV_FILE="$DEMO_DIR/demo.env"

# Terminal geometry for every recording. 120 columns keeps the run card and
# the per-sheet table unwrapped; 36 rows keeps the loop's tail on screen.
TTY_SIZE="120x36"

# The RFC 2606 documentation name every publishable recording must have run
# against (issue #1005), backed by an /etc/hosts entry on the recording
# machine. Checked for every host the pipeline records with, not just one.
PUBLISHABLE_HOST="sense.example.com"

# Image directories are deleted wholesale between runs, so they are confined
# to this prefix - see the check in load_env.
IMAGE_DIR_PREFIX="demo/output/"

# The mark composited into every rendered frame, and where it sits. Committed
# rather than read from a brand folder, so a checkout can render the assets
# without anyone's shared drive being mounted.
LOGO_FILE="$DEMO_DIR/assets/ptarmiganlabs.png"
LOGO_HEIGHT=118
LOGO_MARGIN_X=34
LOGO_MARGIN_Y=26

# The pinned palette, in the form `agg --theme` takes: background, foreground,
# then the 16 ANSI colours, as bare hex.
#
# Spelled out rather than generated from a JSON file. It was read out of
# demo/theme.json by an inline python3 script, which put an undeclared
# interpreter on the render path - and one whose absence `set -e` could not
# catch, because a command substitution that fails inside an argument list
# does not fail the command using it. agg was then handed an empty --theme and
# blamed for the parse error. A constant has no such failure mode, and the
# palette is equally pinned either way.
AGG_THEME="16181d,d8dee9,16181d,ef5350,66bb6a,ffca28,42a5f5,ab47bc,26c6da,d8dee9,5c6370,ff8a80,a5d6a7,ffe082,90caf9,ce93d8,80deea,eceff4"

# What demo:check snapshots, as `<snapshot name>|<command>` pairs. One entry
# per recorded command, so a command whose output changes cannot keep a stale
# asset published just because a different command still matches.
#
# Both are dry runs, and that is a deliberate limit: the check has to be safe
# to run at any time against the demo target, and the real removal is
# destructive. So the plan block, the run header and the per-sheet decisions
# are covered for both commands, while the real run's verdict block is not -
# snapshotting it would mean clearing the demo app's icons on every check.
CHECK_TARGETS=(
    "qseow-dry-run|qseow create-sheet-thumbnails --dry-run"
    "qseow-remove-sheet-icons-dry-run|qseow remove-sheet-icons --dry-run"
)

log() { printf '\n== %s\n' "$*"; }
die() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

# ---------------------------------------------------------------- preflight

require_cmd() {
    command -v "$1" > /dev/null 2>&1 || die "$1 is not installed. $2"
}

# Read demo.env WITHOUT letting the shell evaluate it.
#
# Sourcing the file expanded every value, which corrupted the one field the
# example tells the operator to edit: a password containing `$` picked up the
# shell's variables - `Pa$$w0rd` arrives as `Pa<pid>w0rd`, a different wrong
# password on every run, surfacing as an unexplained Qlik login failure - and a
# password containing a space made bash execute its second word and abort with
# `command not found`. Values here are taken literally. One layer of matching
# quotes is stripped, so the example's quoted values and bare values both work.
read_env_file() {
    local file="$1"
    local line key value lineno=0

    while IFS= read -r line || [ -n "$line" ]; do
        lineno=$((lineno + 1))

        # Tolerate CRLF, so a file edited on Windows cannot put a stray
        # carriage return inside a host name or a password.
        line=${line%$'\r'}

        case "$line" in
            '' | '#'*) continue ;;
        esac

        key=${line%%=*}
        value=${line#*=}

        if [ "$key" = "$line" ]; then
            die "demo/demo.env line $lineno is not KEY=value: $line"
        fi

        # `export KEY=value` is a common habit; accept it silently.
        key=${key#export }

        if [[ ! $key =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
            die "demo/demo.env line $lineno has an invalid variable name: '$key'"
        fi

        case "$value" in
            \"*\") value=${value#\"} && value=${value%\"} ;;
            \'*\') value=${value#\'} && value=${value%\'} ;;
        esac

        export "$key=$value"
    done < "$file"
}

load_env() {
    [ -f "$ENV_FILE" ] || die "demo/demo.env not found. Copy demo/demo.env.example and fill it in - see demo/README.md."

    read_env_file "$ENV_FILE"

    : "${BSI_QSEOW_CST_APP_ID:?demo.env must set BSI_QSEOW_CST_APP_ID}"
    : "${BSI_QSEOW_RSI_APP_ID:?demo.env must set BSI_QSEOW_RSI_APP_ID}"
    : "${BSI_QSEOW_CST_HOST:?demo.env must set BSI_QSEOW_CST_HOST}"
    : "${BSI_QSEOW_RSI_HOST:?demo.env must set BSI_QSEOW_RSI_HOST}"
    : "${BSI_QSEOW_CST_IMAGE_DIR:?demo.env must set BSI_QSEOW_CST_IMAGE_DIR}"

    # The reset and the run must aim at the same app, or the state machine
    # resets one app and records another.
    if [ "$BSI_QSEOW_CST_APP_ID" != "$BSI_QSEOW_RSI_APP_ID" ]; then
        die "BSI_QSEOW_CST_APP_ID and BSI_QSEOW_RSI_APP_ID differ - the reset would target a different app than the runs."
    fi

    # The image directory is deleted wholesale before the "before" run, and
    # `:?` only proves a variable is non-empty - it says nothing about what it
    # points at. `BSI_QSEOW_CST_IMAGE_DIR=demo` would delete this script and
    # the committed cast masters; a bare `demo/output` would delete the
    # harvested panels and every render; an absolute path would make the
    # delete a silent no-op against a bogus concatenation while BSI wrote
    # somewhere else entirely, leaving harvest_overview to fail on a path that
    # never existed. Confine it to the gitignored output tree, where the
    # example already puts it.
    case "$BSI_QSEOW_CST_IMAGE_DIR" in
        *..*)
            die "BSI_QSEOW_CST_IMAGE_DIR must not contain '..' (got '$BSI_QSEOW_CST_IMAGE_DIR')."
            ;;
        "$IMAGE_DIR_PREFIX"?*) ;;
        *)
            die "BSI_QSEOW_CST_IMAGE_DIR must be a relative path under ${IMAGE_DIR_PREFIX} (got '$BSI_QSEOW_CST_IMAGE_DIR') - record.sh deletes that directory between runs."
            ;;
    esac

    # Publishability gate (issue #1005): recordings are only publishable when
    # the runs genuinely used the documentation alias. Both hosts are checked,
    # not just the thumbnail one - step_reset records `qseow
    # remove-sheet-icons`, which reads BSI_QSEOW_RSI_HOST, so a demo.env
    # naming the alias in one variable and a real server in the other used to
    # record an internal hostname with no warning at all. A loud warning
    # rather than a refusal, so pipeline verification can still run against a
    # lab address - but nothing recorded that way may leave this machine.
    local host_var host_value
    for host_var in BSI_QSEOW_CST_HOST BSI_QSEOW_RSI_HOST; do
        host_value=${!host_var}
        if [ "$host_value" != "$PUBLISHABLE_HOST" ]; then
            printf '\n*** WARNING: %s is "%s", not %s.\n' \
                "$host_var" "$host_value" "$PUBLISHABLE_HOST"
            printf '*** Recordings made with it show that host name and are NOT publishable.\n'
            printf '*** See demo/README.md for the /etc/hosts alias this pipeline expects.\n\n'
        fi
    done
}

bsi() {
    node "$REPO_ROOT/src/butler-sheet-icons.js" "$@"
}

# Record one CLI invocation. The session wrapper prints the command line, then
# runs it inside the pty asciinema allocates - the CLI sees a real TTY, so
# colour and the run card render as they would for an operator.
#
# One recorder for the published masters and for the drift check, taking the
# output format as a parameter. The check used to hand-roll its own asciinema
# invocation, which let the two drift apart in exactly the way that matters:
# the snapshot has to be produced under the same geometry and the same rung as
# the asset it guards, or it guards nothing.
#
# asciicast-v2 is what agg and the asciinema player both read today; the master
# carries natural timing, and idle capping happens at render time so it stays
# retunable without re-recording (issue #1001). `txt` is plain text with no
# colour or control sequences, for the drift check. --return makes the recorder
# exit with the CLI's real exit code.
record_cast() {
    local out_file="$1" format="$2"
    shift 2
    mkdir -p "$(dirname "$out_file")"
    (cd "$REPO_ROOT" && TERM=xterm-256color asciinema record \
        --headless --overwrite --return \
        --window-size "$TTY_SIZE" \
        --output-format "$format" \
        --title "butler-sheet-icons $*" \
        --command "bash demo/session.sh $*" \
        "$out_file")
}

overview_png() {
    printf '%s' "$REPO_ROOT/$BSI_QSEOW_CST_IMAGE_DIR/qseow/$BSI_QSEOW_CST_APP_ID/overview-1.png"
}

# Copy ONE named file out of the image directory. Never publish or copy the
# directory itself: BSI screenshots the Qlik login page with credentials
# filled in (loginpage-2.png) into the same tree.
harvest_overview() {
    local dest="$OUT_DIR/panels/$1"
    local src
    src="$(overview_png)"
    [ -f "$src" ] || die "expected overview screenshot not found: $src"
    mkdir -p "$OUT_DIR/panels"
    cp "$src" "$dest"
    log "harvested $dest"
}

# ------------------------------------------------------------------- steps

step_reset() {
    log "reset: recording qseow remove-sheet-icons (a REAL removal on the demo app)"
    require_cmd asciinema "Install with: brew install asciinema"
    record_cast "$CAST_DIR/qseow-remove-sheet-icons.cast" asciicast-v2 qseow remove-sheet-icons
}

step_dryrun() {
    log "dryrun: recording qseow create-sheet-thumbnails --dry-run"
    require_cmd asciinema "Install with: brew install asciinema"
    record_cast "$CAST_DIR/qseow-dry-run.cast" asciicast-v2 qseow create-sheet-thumbnails --dry-run
}

step_before() {
    log "before: real run, recorded; its overview shows the post-reset state"
    require_cmd asciinema "Install with: brew install asciinema"

    # Fresh image dir so the harvested overview is provably this run's.
    rm -rf "${REPO_ROOT:?}/${BSI_QSEOW_CST_IMAGE_DIR:?}"

    record_cast "$CAST_DIR/qseow-real-run.cast" asciicast-v2 qseow create-sheet-thumbnails

    harvest_overview app-overview-before.png
}

step_after() {
    log "after: second real run (idempotent rewrite); its overview shows the thumbnails"
    (cd "$REPO_ROOT" && bsi qseow create-sheet-thumbnails)
    harvest_overview app-overview-after.png
}

render_one() {
    local name="$1"
    local cast="$CAST_DIR/$name.cast"
    [ -f "$cast" ] || {
        printf 'no master at demo/cast/%s.cast - skipping\n' "$name"
        return 0
    }

    # Playback pacing, per tier, applied at render time so it stays retunable
    # without touching a server (#1001).
    #
    # The two short casts need slowing down, not capping. A dry run is honest
    # about being fast - 0.6 s from prompt to summary - and rendered at natural
    # speed it is a flash nobody can read. The real run paces itself, roughly
    # 2.6 s per sheet while the browser works, so it only wants its idle gaps
    # capped. Both get a long final frame: the last screen is the answer the
    # viewer came for, and a loop that snaps back before it can be read is the
    # same failure as playing too fast.
    # Everything renders at its recorded height, which keeps the frame
    # landscape and web-shaped. agg can replay the byte stream into a taller
    # virtual terminal, and doing so would fit a whole dry run on one screen -
    # about 53 lines against the recorded 36 - so the final frame would hold
    # the run header and the full PLAN block instead of letting the top third
    # scroll away. That was tried and rejected: it makes the two short assets
    # portrait (1175x1366), which is the wrong shape for a doc-site page. The
    # slow reveal below is what lets a viewer read the part that scrolls.
    local pacing
    case "$name" in
        qseow-real-run) pacing="--idle-time-limit 1.5 --speed 1 --last-frame-duration 6" ;;
        *) pacing="--idle-time-limit 1.5 --speed 0.15 --last-frame-duration 8" ;;
    esac

    # Word splitting on $pacing is intended - it is a fixed literal above.
    # shellcheck disable=SC2086
    agg $pacing --theme "$AGG_THEME" "$cast" "$OUT_DIR/$name.gif"

    if command -v ffmpeg > /dev/null 2>&1; then
        # The Ptarmigan Labs mark, top right, in the band beside the run
        # header box that every recording leaves empty - so it covers no
        # output and needs no space made for it.
        #
        # Composited by the script on every render, which is the distinction
        # #1000 drew: it rejected manual post-processing because hand-editing
        # is what made the old assets unregenerable, not because pixels may
        # never be added. Nothing here alters what the CLI printed.
        #
        # The GIF is rebuilt through palettegen/paletteuse so the mark does
        # not dither against the terminal background, and it is branded
        # before the MP4 and WebM are encoded from it, so all three carry it
        # from one operation.
        if [ -f "$LOGO_FILE" ]; then
            ffmpeg -y -loglevel error -i "$OUT_DIR/$name.gif" -i "$LOGO_FILE" \
                -filter_complex "[1]scale=-1:${LOGO_HEIGHT}[lg];[0][lg]overlay=W-w-${LOGO_MARGIN_X}:${LOGO_MARGIN_Y},split[a][b];[a]palettegen=reserve_transparent=0[p];[b][p]paletteuse" \
                "$OUT_DIR/$name.branded.gif"
            mv "$OUT_DIR/$name.branded.gif" "$OUT_DIR/$name.gif"
        fi

        ffmpeg -y -loglevel error -i "$OUT_DIR/$name.gif" \
            -movflags faststart -pix_fmt yuv420p \
            -vf 'scale=trunc(iw/2)*2:trunc(ih/2)*2' \
            "$OUT_DIR/$name.mp4"
        # -pix_fmt yuv420p is required, not cosmetic: agg writes GIFs in
        # `gbrap`, which libvpx-vp9 refuses outright ("Pixel format 'gbrap' is
        # not widely supported"), so without it this exits non-zero with a
        # 0-byte file and `set -e` abandons every cast after the first. The
        # MP4 branch above carries the same flag for the same reason.
        ffmpeg -y -loglevel error -i "$OUT_DIR/$name.gif" \
            -c:v libvpx-vp9 -b:v 0 -crf 32 -pix_fmt yuv420p \
            "$OUT_DIR/$name.webm"
    fi
}

step_render() {
    log "render: shareable files from the committed .cast masters (no server contact)"
    mkdir -p "$OUT_DIR"

    if ! command -v agg > /dev/null 2>&1; then
        printf 'agg is not installed - skipping GIF/MP4/WebM rendering of the cast masters.\n'
        printf 'Install with: brew install agg\n'
        return 0
    fi

    render_one qseow-dry-run
    render_one qseow-remove-sheet-icons
    render_one qseow-real-run

    log "rendered files in demo/output/"
    ls -lh "$OUT_DIR" | sed -n '2,99p'
}

# Normalise away what legitimately differs between two identical runs, so the
# drift check only fires on real output changes: timestamps, elapsed times and
# the release number.
#
# The version rule is anchored to the run header's own words rather than
# matching bare semver, because two other version-shaped numbers in the same
# output are deliberately left alone: the engine schema version in the plan
# block is configuration, and the Sense engine build reported at connect time
# describes the server. A change to either genuinely changes what a published
# recording shows, so both should still register as drift. Only the BSI
# release number moves without the output meaning anything different, and it
# moves on every release - which would otherwise send an operator to re-record
# the whole narrative for a string nobody reads.
#
# The duration rule is anchored to the labels that introduce an elapsed time,
# rather than matching any number followed by a unit. Two reasons. It used to
# end in `\b`, a GNU extension that BSD sed - the only sed on the macOS
# machines this pipeline documents - treats as a literal `b`, so the rule
# silently matched nothing at all. And an unanchored version over-corrects:
# the plan block prints the --pagewait value as "1s per sheet", which is
# configuration, not elapsed time, and blanking it would hide a real change to
# what the recording shows. The alternation covers every form formatElapsed
# emits: "45s", "2m 5s" and "1h 3m".
normalise() {
    sed -E \
        -e 's/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[^ ]*/<TIMESTAMP>/g' \
        -e 's/(elapsed[[:space:]]+|done in )[0-9]+(h [0-9]+m|m [0-9]+s|s)/\1<T>/g' \
        -e 's/(BUTLER SHEET ICONS[[:space:]]+)[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?/\1<VERSION>/g' \
        "$1"
}

step_check() {
    local update="${1:-}"
    log "check: text-only drift check of every recorded command"
    require_cmd asciinema "Install with: brew install asciinema"
    mkdir -p "$SNAP_DIR" "$OUT_DIR"

    local drifted=0
    local target name command txt snap

    for target in "${CHECK_TARGETS[@]}"; do
        name=${target%%|*}
        command=${target#*|}
        txt="$OUT_DIR/$name.txt"
        snap="$SNAP_DIR/$name.txt"

        # Recorded through the same function, geometry and rung as the
        # published assets, and deliberately WITHOUT BSI_OUTPUT: forcing the
        # plain rung here meant the snapshot guarded a renderer no asset
        # shows, so every change to the run header, the plan block or the run
        # card passed the check green. Word splitting on $command is intended
        # - these are fixed literals from CHECK_TARGETS.
        # shellcheck disable=SC2086
        record_cast "$txt" txt $command

        if [ "$update" = "update" ] || [ ! -f "$snap" ]; then
            normalise "$txt" > "$snap"
            log "snapshot written: demo/snapshots/$name.txt"
            continue
        fi

        if diff -u "$snap" <(normalise "$txt"); then
            log "no drift: butler-sheet-icons $command"
        else
            printf '\n*** "%s" drifted from demo/snapshots/%s.txt\n\n' "$command" "$name"
            drifted=1
        fi
    done

    if [ "$drifted" -ne 0 ]; then
        die "CLI output drifted from the committed snapshots. If the change is intentional, re-record (npm run demo:record) and refresh with: demo/record.sh check-update"
    fi

    if [ "$update" != "update" ]; then
        log "no drift: the CLI still prints what the published assets show"
    fi
}

# -------------------------------------------------------------------- main

main() {
    local cmd="${1:-all}"

    require_cmd node "Install Node.js first."
    load_env

    case "$cmd" in
        all)
            step_reset
            step_dryrun
            step_before
            step_after
            step_render
            log "done. Panels + renders are in demo/output/, cast masters in demo/cast/."
            ;;
        reset) step_reset ;;
        dryrun) step_dryrun ;;
        before) step_before ;;
        after) step_after ;;
        render) step_render ;;
        check) step_check ;;
        check-update) step_check update ;;
        *) die "unknown step '$cmd'. See the usage comment at the top of demo/record.sh." ;;
    esac
}

main "$@"
