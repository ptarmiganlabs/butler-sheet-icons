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
# This script asserts that none of that is happening. It changes nothing: repair belongs to
# scripts/lib/macos-signing-keychain.sh, which runs at the start of every build. Keeping the audit
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
# `build.keychain` is the name used by the older scripts; `bsi-signing-` is the current one. Both
# are recognised so that a host still carrying old debris is diagnosed correctly.
is_signing_keychain() {
  case "$1" in
    *"/build.keychain"*) return 0 ;;
    *"/bsi-signing-"*) return 0 ;;
    *) return 1 ;;
  esac
}

note "--- keychain audit on $(hostname -s), user $(id -un) ---"

# ---------------------------------------------------------------------------------------------
# The default keychain. This is the one that caused the dialog: it is where applications create
# new items, so pointing it at a keychain locked with a CI-only password makes macOS ask a human.
# ---------------------------------------------------------------------------------------------
DEFAULT_KEYCHAIN=$(security default-keychain -d user 2>/dev/null | tr -d '"' | xargs || true)
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
done < <(security list-keychains -d user | tr -d '"' | xargs -n1 || true)

# During a build the signing keychain is expected to be present - but appended, never ahead of the
# user's own keychain. This is the assertion that would have caught the original bug.
if [ -n "$DURING_BUILD" ] && [ -n "$SIGNING_POSITION" ] && [ -n "$LOGIN_POSITION" ]; then
  if [ "$SIGNING_POSITION" -lt "$LOGIN_POSITION" ]; then
    fail "a signing keychain (position $SIGNING_POSITION) precedes the login keychain (position $LOGIN_POSITION)"
  fi
fi

# ---------------------------------------------------------------------------------------------
# Debris on disk. A file here outlives the search list and keeps prompting long after the build.
# ---------------------------------------------------------------------------------------------
if [ -f "${HOME}/Library/Keychains/build.keychain-db" ]; then
  fail "leftover ~/Library/Keychains/build.keychain-db from an older build script"
fi

if [ "$FAILURES" -eq 0 ]; then
  note "keychain configuration is healthy"
  exit 0
fi

echo "$FAILURES keychain problem(s) found." >&2
echo "Repair: the next macOS build clears this automatically, or run" >&2
echo "  security delete-keychain build.keychain" >&2
echo "  security list-keychains -d user -s \"$LOGIN_KEYCHAIN\"" >&2
echo "  security default-keychain -d user -s \"$LOGIN_KEYCHAIN\"" >&2
exit 1
