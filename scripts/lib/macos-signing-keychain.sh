#!/usr/bin/env bash
# Keychain lifecycle for scripts/sign-macos.sh. Sourced, never executed.
#
# Signing needs a throwaway keychain holding the Developer ID certificate. release-macos.sh and
# insider-build-mac.sh each used to carry their own copy of this logic, back when they signed as
# well as built, and that copy did three things that are fine on an ephemeral hosted runner and
# actively hostile on a self-hosted Mac somebody is logged in to:
#
#   1. It created the keychain as ~/Library/Keychains/build.keychain, next to the user's own.
#   2. It put that keychain at the *head* of the user's keychain search list.
#   3. It made it the user's *default* keychain for the whole build - three to eighteen minutes,
#      on every push to main.
#
# (3) is why "Google Drive wants to use the build keychain" appeared on the build Mac. The default
# keychain is where applications create new items; any app refreshing a credential during a build
# landed on a keychain locked with a CI-only password and asked the human for it. No crash or leak
# was needed - it happened on every successful build.
#
# (3) also made the failure self-perpetuating. If a run was killed before its cleanup ran, the
# build keychain stayed both in the search list and as the default. The next run then snapshotted
# that poisoned state as "the original", deleted the keychain, and on exit faithfully restored a
# search-list entry and a default keychain that no longer existed. Nothing ever recovered it.
#
# So: the keychain lives in a folder the signing run makes for itself, under the runner's temp
# directory. It is appended to the search list rather than prepended, and the default keychain is
# never touched at all. Nothing needs it - `security import`, `unlock-keychain` and
# `set-key-partition-list` all name the keychain explicitly, `codesign` resolves the identity from
# the search list, and `notarytool` is given the keychain its credentials are stored in with
# --keychain.
#
# It stays *on* the search list because it has to: `man codesign` is explicit that a keychain given
# via --keychain is not searched when building the certificate chain unless it is also on the
# user's list.
#
# What this library writes back is exactly what it read, minus its own entries. On a persistent Mac
# - a self-hosted runner shared with other projects, or a maintainer's own machine - everything else
# on the search list belongs to somebody else, and so does the default keychain. That includes a
# path that no longer exists, and a default that points at nothing. The library used to "repair"
# those two, dropping dangling entries from the list and pointing a broken default at the login
# keychain. Both repairs changed state this build did not create, so both are gone: whichever
# project left a dangling entry is the one to clear it. The search list reads the same after a
# signing run as before it, and the default keychain is never written.
#
# The library no longer touches build.keychain, the name the scripts above used until August 2026,
# and every build since has swept what they left. butler and ctrl-q still create
# ~/Library/Keychains/build.keychain on the same build Mac, put it at the head of the search list and
# make it the default for their builds, so the name is theirs now. Claiming it meant deleting
# another project's keychain and dropping it from the person's list, which was safe only while that
# Mac ran one job at a time. Every name this library recognises is Butler Sheet Icons' own (decided
# with Goran, 2026-10-17).
#
# One hazard this does not solve. If the search list changes while a signing run is under way - a
# build overlapping on the same Mac, or a person in Keychain Access - the run still restores the
# list it read at the start, and the change is lost.
#
# Written for bash 3.2 - macOS still runs these scripts under /bin/bash 3.2, where expanding an empty
# array under `set -u` is a fatal error. Hence the ${arr[@]+"${arr[@]}"} guards.

# Absolute path of the keychain this build owns. Callers pass it to `security import`,
# `set-key-partition-list`, `codesign --keychain` and `notarytool --keychain`.
BSI_KEYCHAIN_PATH=""

# Directory to create that keychain in. scripts/sign-macos.sh sets it to the folder it makes for
# the run, so that one cleanup removes the keychain along with everything else the run wrote. Falls
# back to the runner's temp directory.
BSI_KEYCHAIN_DIR=""

# The user's keychain search list as found, minus anything of ours. Restored verbatim on teardown.
BSI_ORIGINAL_KEYCHAINS=()

# Set once the search list has been read, so that teardown writes it back only when there is a
# snapshot to write. Teardown also runs when the script stops before setup, and writing an empty
# list then would wipe the person's own.
BSI_KEYCHAIN_SNAPSHOT_TAKEN=""

# Guards teardown against running twice - it is wired to three signals plus EXIT.
BSI_KEYCHAIN_TORN_DOWN=""

# The keychain paths `security list-keychains` and `default-keychain` print, one a line, without the
# indent and the quotes they come with. Read line by line because a path may hold a space:
# splitting on whitespace, as `xargs` did here, broke "Work Keychain.keychain-db" in two, dropped
# both halves as missing, and so took the person's keychain off their search list for good.
bsi_keychain_unquote() {
  sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//'
}

# Reports whether a search-list entry is one of ours. Never another project's: a build of theirs on
# the same Mac needs its entry left alone.
#
# $1 - keychain path as reported by `security list-keychains`.
#
# Returns 0 when the entry must not be carried into the restored search list.
bsi_keychain_is_ours() {
  case "$1" in
    *"/bsi-signing-"*) return 0 ;;
    *) return 1 ;;
  esac
}

# Snapshots the user's keychain search list, minus our own entries.
#
# Ours - a stale bsi-signing keychain from a run that never cleaned up - are dropped, because
# restoring those is what made the old bug permanent. Nothing else is: another project's keychain,
# and a path that no longer exists, are written back exactly as they were found.
#
# Refuses when the list cannot be read. A list that could not be read is not an empty one: taken as
# empty, setup would put the signing keychain on the list in place of the person's own, and teardown
# would then write the empty snapshot back, taking their login keychain off the list for good.
bsi_keychain_snapshot() {
  local keychain
  local listed

  BSI_ORIGINAL_KEYCHAINS=()

  if ! listed="$(security list-keychains -d user)"; then
    echo "::error::could not read the keychain search list; refusing to change it, or to sign"
    return 1
  fi

  while IFS= read -r keychain; do
    [ -n "$keychain" ] || continue

    if bsi_keychain_is_ours "$keychain"; then
      echo "keychain: dropping stale signing keychain from the search list: $keychain"
      continue
    fi

    BSI_ORIGINAL_KEYCHAINS+=("$keychain")
  done < <(printf '%s\n' "$listed" | bsi_keychain_unquote)

  BSI_KEYCHAIN_SNAPSHOT_TAKEN="yes"
  echo "keychain: search list to preserve: ${BSI_ORIGINAL_KEYCHAINS[*]:-(empty)}"
}

# Puts Apple's intermediate and root into the signing keychain.
#
# codesign has to build the whole chain from the signing identity up to a self-signed root, and the
# .p12 in MACOS_CERTIFICATE carries the leaf and its private key and nothing above it. GitHub's
# hosted macOS images ship Apple's CAs; a self-hosted Mac, or a maintainer's own, may not. See
# release-config/apple-ca/README.md.
#
# Imported into this keychain rather than installed on the machine, so that the keychain is
# self-contained and the Mac needs no preparation.
bsi_keychain_import_apple_cas() {
  local ca_dir
  ca_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../release-config/apple-ca" && pwd)"

  local ca
  for ca in "$ca_dir"/*.cer; do
    # A literal glob means the directory is empty, which is a packaging mistake rather than
    # something to sign through: without these, codesign fails later and far less legibly.
    [ -f "$ca" ] || { echo "::error::no Apple CA certificates in $ca_dir"; return 1; }
    echo "keychain: trusting $(basename "$ca")"
    # No -T: these are certificates, not identities, so nothing needs key access.
    security import "$ca" -k "$BSI_KEYCHAIN_PATH"
  done
}

# Creates the signing keychain and makes it usable by codesign.
#
# $1 - password to lock the new keychain with.
#
# Sets BSI_KEYCHAIN_PATH. The caller is expected to have installed bsi_keychain_teardown as a trap
# before calling this.
bsi_keychain_setup() {
  local keychain_password="$1"
  local keychain_dir="${BSI_KEYCHAIN_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}}"

  # Before anything is created or written, so that a refusal leaves nothing for teardown to undo.
  bsi_keychain_snapshot || return 1

  # Outside ~/Library/Keychains on purpose: it never shows up in Keychain Access, it cannot collide
  # with another project's keychain there, and on a runner it sits under RUNNER_TEMP, swept with it
  # even if the script is killed hard enough that no trap runs.
  BSI_KEYCHAIN_PATH="${keychain_dir%/}/bsi-signing-$$.keychain-db"

  echo "keychain: creating $BSI_KEYCHAIN_PATH"
  security create-keychain -p "$keychain_password" "$BSI_KEYCHAIN_PATH"

  # A keychain straight from `security create-keychain` reports "lock-on-sleep timeout=300s" - it
  # relocks after five idle minutes and whenever the machine sleeps. release-macos.sh never changed
  # that and so signed under a five-minute clock; insider-build-mac.sh passed `-t 3600 -l` under a
  # comment claiming it prevented locking, but -l is what *enables* lock-on-sleep, so it only ever
  # extended the timeout. Omitting -l clears the sleep trigger, and six hours outlasts any build.
  security set-keychain-settings -t 21600 "$BSI_KEYCHAIN_PATH"

  # Appended, not prepended. The login keychain keeps its place at the head of the list, so an
  # application looking up its own credential still finds it there first.
  security list-keychains -d user -s \
    ${BSI_ORIGINAL_KEYCHAINS[@]+"${BSI_ORIGINAL_KEYCHAINS[@]}"} "$BSI_KEYCHAIN_PATH"

  security unlock-keychain -p "$keychain_password" "$BSI_KEYCHAIN_PATH"

  bsi_keychain_import_apple_cas

  echo "keychain: search list is now"
  security list-keychains -d user
  echo "keychain: default keychain is $(security default-keychain -d user 2>/dev/null | bsi_keychain_unquote), left as it is"
}

# Deletes the signing keychain and puts the search list back exactly as it was found.
#
# Idempotent and silent about failures: it runs on the way out of a script that may already be
# unwinding from a real error, and losing that error behind a cleanup failure helps nobody.
bsi_keychain_teardown() {
  [ -z "$BSI_KEYCHAIN_TORN_DOWN" ] || return 0
  BSI_KEYCHAIN_TORN_DOWN="yes"

  if [ -n "$BSI_KEYCHAIN_PATH" ]; then
    security delete-keychain "$BSI_KEYCHAIN_PATH" >/dev/null 2>&1 || true
    rm -f "$BSI_KEYCHAIN_PATH"
  fi

  # Whenever a snapshot was taken, an empty one included: setup put the signing keychain on the
  # list, and only writing the snapshot back takes the deleted file off it again.
  if [ -n "$BSI_KEYCHAIN_SNAPSHOT_TAKEN" ]; then
    security list-keychains -d user -s \
      ${BSI_ORIGINAL_KEYCHAINS[@]+"${BSI_ORIGINAL_KEYCHAINS[@]}"} >/dev/null 2>&1 || true
  fi
}
