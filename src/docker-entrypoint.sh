#!/bin/sh
# Entrypoint for the Butler Sheet Icons container.
#
# The problem it solves (issue #915): the image used to run as USER nodejs, which Alpine's
# `adduser -S` gives uid 100. A directory bind-mounted from a Linux host is owned by the host user -
# uid 1000 for a normal login, 1001 for a CI runner - so the container could not write to it, and
# every documented `--imagedir` invocation failed with
#
#     EACCES: permission denied, mkdir './img/cloud/<appid>'
#
# It worked on macOS and Windows only because Docker Desktop's bind mounts ignore host ownership.
#
# The fix is for the image to adapt to the mount rather than the user to the image: look at who owns
# the directory the run will write to, and become that user. Two alternatives were tried and
# rejected:
#
#   * Telling users to pass `--user "$(id -u):$(id -g)"`. A uid with no /etc/passwd entry gets
#     HOME=/, so os.homedir() returns "/", the Puppeteer cache under ~/.cache is unwritable, and the
#     documented /home/nodejs/.cache/puppeteer mount points somewhere the app no longer looks. It
#     trades one broken case for another, and only after the user knows the incantation.
#   * `chown -R` on the mount. That is somebody's own directory on their own machine; handing it to
#     uid 100 would leave them unable to delete their own thumbnails without sudo.
#
# Adopting the mount's uid has neither problem: files land owned by the host user, which is what
# they wanted, and nothing outside the container is modified.
#
# The application never runs as root. This script needs root only to drop privileges, and execs
# node as an unprivileged user in every path.

set -eu

APP_USER="nodejs"
APP_HOME="/home/nodejs"
APP_ENTRY="/nodeapp/src/butler-sheet-icons.js"
DEFAULT_IMAGE_DIR="/nodeapp/img"
CERT_DIR="/nodeapp/cert"

# To stderr, so it cannot corrupt stdout for `--outputformat table` and friends.
log() {
    echo "butler-sheet-icons: $*" >&2
}

# Walks up to the nearest directory that exists.
#
# `--imagedir ./img/sub` is legal and the leaf will not exist on the first run, but its parent is
# the bind mount whose ownership we actually need.
nearest_existing_dir() {
    _dir="$1"
    while [ ! -d "$_dir" ] && [ "$_dir" != "/" ] && [ -n "$_dir" ]; do
        _dir=$(dirname "$_dir")
    done
    printf '%s' "$_dir"
}

# Recovers the image directory from the command line, since that is the directory the run writes to.
#
# Mirrors the CLI: `--imagedir <path>` and `--imagedir=<path>`, defaulting to ./img, which resolves
# against the working directory - /nodeapp - exactly as it does inside the app.
resolve_image_dir() {
    _image_dir="$DEFAULT_IMAGE_DIR"
    _prev=""

    for _arg in "$@"; do
        case "$_arg" in
            --imagedir=*) _image_dir="${_arg#--imagedir=}" ;;
        esac
        if [ "$_prev" = "--imagedir" ]; then
            _image_dir="$_arg"
        fi
        _prev="$_arg"
    done

    case "$_image_dir" in
        /*) ;;
        *) _image_dir="$(pwd)/${_image_dir#./}" ;;
    esac

    printf '%s' "$_image_dir"
}

# ------------------------------------------------------------------------------------------------
# Not root: the operator passed --user, or this is a platform that assigns an arbitrary uid.
# Their choice wins - just make sure the environment is coherent before handing over.
# ------------------------------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
    if [ -z "${HOME:-}" ] || [ "$HOME" = "/" ]; then
        # What Docker hands a uid with no passwd entry. Left alone, os.homedir() returns "/" and
        # every write under ~/.cache fails - which is the trap that makes bare --user a bad answer.
        HOME=/tmp
        export HOME
        log "uid $(id -u) has no home directory; using HOME=$HOME so the browser cache is writable"
    fi

    exec node "$APP_ENTRY" "$@"
fi

# ------------------------------------------------------------------------------------------------
# Root: find out who owns what this run will write to, and become them.
# ------------------------------------------------------------------------------------------------
APP_UID=$(id -u "$APP_USER")

IMAGE_DIR=$(resolve_image_dir "$@")

TARGET_UID=""
TARGET_GID=""
TARGET_SOURCE=""

# The certificate directory is checked as well as the image directory, and not only for symmetry:
# QSEoW client certificates are mounted mode 0600 owned by the host user, so uid 100 could not read
# them either. That surfaced as "Missing certificate file(s)" rather than as a permission error,
# which is why it was not obviously the same bug.
for candidate in "$IMAGE_DIR" "$CERT_DIR"; do
    existing=$(nearest_existing_dir "$candidate")
    [ -d "$existing" ] || continue

    uid=$(stat -c %u "$existing" 2>/dev/null || echo "")
    gid=$(stat -c %g "$existing" 2>/dev/null || echo "")
    [ -n "$uid" ] || continue

    # uid 0 is deliberately not adopted: a root-owned mount is not a reason to run the browser and
    # the whole app as root. That case falls through to nodejs and fails with the advice the app
    # now prints, which tells the operator what to do about it.
    if [ "$uid" != "0" ] && [ "$uid" != "$APP_UID" ]; then
        TARGET_UID="$uid"
        TARGET_GID="$gid"
        TARGET_SOURCE="$existing"
        break
    fi
done

if [ -z "$TARGET_UID" ]; then
    exec su-exec "$APP_USER" node "$APP_ENTRY" "$@"
fi

# su-exec resolves HOME from /etc/passwd and overwrites whatever was exported before it, so setting
# HOME here would be silently discarded. Giving the adopted uid a real passwd entry is what makes
# HOME, whoami and os.homedir() all agree.
if ! grep -q "^[^:]*:[^:]*:${TARGET_UID}:" /etc/passwd; then
    echo "bsi:x:${TARGET_UID}:${TARGET_GID}::${APP_HOME}:/bin/sh" >> /etc/passwd
fi

# Inside the container only. The bind mount is never touched.
chown -R "${TARGET_UID}:${TARGET_GID}" "$APP_HOME" 2>/dev/null || true

log "running as uid ${TARGET_UID}:${TARGET_GID}, adopted from ${TARGET_SOURCE}, so files written there belong to you"

exec su-exec "${TARGET_UID}:${TARGET_GID}" node "$APP_ENTRY" "$@"
