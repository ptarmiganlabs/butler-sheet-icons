#!/usr/bin/env bash
set -uo pipefail

# Read-only audit of the user's keychain configuration on a macOS build host.
#
# The signing scripts create a throwaway keychain for the Developer ID certificate. An earlier
# version of them put that keychain at the head of the user's search list and made it the user's
# *default* keychain for the whole build, which is what produced "Google Drive wants to use the
# build keychain" on the self-hosted Mac - and, when a run was killed, left the machine in that
# state permanently.
#
# This script asserts that none of that is happening. It changes nothing, and neither does the
# signing run, beyond its own debris: scripts/lib/macos-signing-keychain.sh drops a stale signing
# keychain of its own from the search list, and writes everything else back exactly as it found it.
# A dangling entry or a broken default keychain belongs to whoever left it. Keeping the audit
# read-only means it can be run on a developer's own Mac without consequences, and means a CI
# failure here reports a real state rather than one the checker just fixed.
#
# Modes:
#   (default)       Between builds. No signing keychain may be present at all.
#   --during-build  While a build is signing. A signing keychain may be on the search list, but it
#                   must not be the default keychain and must not come before the login keychain.
#
# Exit code 0 when the host is healthy, 1 when it is not.

DURING_BUILD=""
QUIET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --during-build) DURING_BUILD="yes" ;;
    --quiet) QUIET="yes" ;;
    *) echo "usage: $0 [--during-build] [--quiet]" >&2; exit 2 ;;
  esac
  shift
done

FAILURES=0
LOGIN_KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"

# Reports a problem and marks the run failed. Always printed, even under --quiet: the point of
# --quiet is to stay silent while healthy, not to hide findings.
fail() {
  echo "FAIL: $1"
  FAILURES=$((FAILURES + 1))
}

# Prints progress, unless --quiet was requested.
note() {
  [ -n "$QUIET" ] || echo "$1"
}

# Reports whether a keychain path belongs to a Butler Sheet Icons build.
#
# Only `bsi-signing-`. Not `build.keychain`, the name the older scripts used until August 2026: butler
# and ctrl-q still create a keychain by that name on the same build Mac, and it is theirs, not debris
# of this project's (scripts/lib/macos-signing-keychain.sh says more).
is_signing_keychain() {
  case "$1" in
    *"/bsi-signing-"*) return 0 ;;
    *) return 1 ;;
  esac
}

# The paths `security` prints, one a line, without their indent and quotes. Line by line, as the
# library reads them, because a path may hold a space: split on whitespace, "Work
# Keychain.keychain-db" would be reported as two entries that do not exist.
unquote() {
  sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//'
}

note "--- keychain audit on $(hostname -s), user $(id -un) ---"

# ---------------------------------------------------------------------------------------------
# The default keychain. This is the one that caused the dialog: it is where applications create
# new items, so pointing it at a keychain locked with a CI-only password makes macOS ask a human.
# ---------------------------------------------------------------------------------------------
DEFAULT_KEYCHAIN=$(security default-keychain -d user 2>/dev/null | unquote || true)
note "default keychain: ${DEFAULT_KEYCHAIN:-(none)}"

if [ -z "$DEFAULT_KEYCHAIN" ]; then
  # Reachable by deleting a keychain while it is the default - which is precisely what the old
  # scripts did to a host that had already leaked one.
  fail "this host has no default keychain at all"
elif is_signing_keychain "$DEFAULT_KEYCHAIN"; then
  fail "a build signing keychain is the user's default keychain: $DEFAULT_KEYCHAIN"
elif [ ! -f "$DEFAULT_KEYCHAIN" ]; then
  fail "the default keychain does not exist on disk: $DEFAULT_KEYCHAIN"
fi

# ---------------------------------------------------------------------------------------------
# The search list. Order matters: an application looking up its own credential should reach the
# login keychain before anything a build added.
# ---------------------------------------------------------------------------------------------
POSITION=0
LOGIN_POSITION=""
SIGNING_POSITION=""

note "search list:"
while IFS= read -r keychain; do
  [ -n "$keychain" ] || continue
  POSITION=$((POSITION + 1))
  note "  $POSITION. $keychain"

  if [ ! -f "$keychain" ]; then
    fail "search list entry $POSITION does not exist on disk: $keychain"
  fi

  if [ "$keychain" = "$LOGIN_KEYCHAIN" ] && [ -z "$LOGIN_POSITION" ]; then
    LOGIN_POSITION=$POSITION
  fi

  if is_signing_keychain "$keychain"; then
    [ -n "$SIGNING_POSITION" ] || SIGNING_POSITION=$POSITION

    if [ -z "$DURING_BUILD" ]; then
      fail "a build signing keychain is still on the search list: $keychain"
    fi
  fi
done < <(security list-keychains -d user | unquote || true)

# During a build the signing keychain is expected to be present - but appended, never ahead of the
# user's own keychain. This is the assertion that would have caught the original bug.
if [ -n "$DURING_BUILD" ] && [ -n "$SIGNING_POSITION" ] && [ -n "$LOGIN_POSITION" ]; then
  if [ "$SIGNING_POSITION" -lt "$LOGIN_POSITION" ]; then
    fail "a signing keychain (position $SIGNING_POSITION) precedes the login keychain (position $LOGIN_POSITION)"
  fi
fi

if [ "$FAILURES" -eq 0 ]; then
  note "keychain configuration is healthy"
  exit 0
fi

echo "$FAILURES keychain problem(s) found." >&2
echo "A signing run sweeps only a stale signing keychain of its own; it repairs nothing else, because" >&2
echo "nothing else is its own. To repair this host by hand:" >&2
echo "  security list-keychains -d user -s \"$LOGIN_KEYCHAIN\"" >&2
echo "  security default-keychain -d user -s \"$LOGIN_KEYCHAIN\"" >&2
exit 1
