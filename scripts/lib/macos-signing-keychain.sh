#!/usr/bin/env bash
# Keychain lifecycle for the macOS signing scripts. Sourced, never executed.
#
# Both release-macos.sh and insider-build-mac.sh need a throwaway keychain holding the Developer ID
# certificate. They each used to carry their own copy of this logic, and that copy did three things
# that are fine on an ephemeral hosted runner and actively hostile on a self-hosted Mac somebody
# is logged in to:
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
# So: the keychain now lives in the runner's temp directory, it is appended to the search list
# rather than prepended, and the default keychain is never touched at all. Nothing needs it -
# `security import`, `unlock-keychain` and `set-key-partition-list` all name the keychain
# explicitly, `codesign` resolves the identity from the search list, and `notarytool` authenticates
# with --apple-id/--password.
#
# It stays *on* the search list because it has to: `man codesign` is explicit that a keychain given
# via --keychain is not searched when building the certificate chain unless it is also on the
# user's list.
#
# Written for bash 3.2 - GitHub's macOS runners still execute these scripts under /bin/bash 3.2,
# where expanding an empty array under `set -u` is a fatal error. Hence the ${arr[@]+"${arr[@]}"}
# guards.

# Absolute path of the keychain this build owns. Callers pass it to `security import`,
# `set-key-partition-list` and `codesign --keychain`.
BSI_KEYCHAIN_PATH=""

# The user's keychain search list as found, minus anything of ours. Restored verbatim on teardown.
BSI_ORIGINAL_KEYCHAINS=()

# Legacy keychain created by the previous version of these scripts. Recognised so that debris left
# on a build host by an interrupted old run can be cleaned up instead of inherited.
BSI_LEGACY_KEYCHAIN_NAME="build.keychain"

# Guards teardown against running twice - it is wired to four signals plus EXIT.
BSI_KEYCHAIN_TORN_DOWN=""

# Reports whether a search-list entry is one of ours, or debris from the old scheme.
#
# $1 - keychain path as reported by `security list-keychains`.
#
# Returns 0 when the entry must not be carried into the restored search list.
bsi_keychain_is_ours() {
  case "$1" in
    *"/${BSI_LEGACY_KEYCHAIN_NAME}"*) return 0 ;;
    *"/bsi-signing-"*) return 0 ;;
    *) return 1 ;;
  esac
}

# Snapshots the user's keychain search list, dropping entries that must not be restored.
#
# Two kinds are dropped. Ours - a stale build.keychain or bsi-signing keychain from a run that
# never cleaned up - because restoring those is what made the old bug permanent. And paths that no
# longer exist, because a search list containing a dangling path is the state the old cleanup left
# behind, and quietly writing it back would preserve it.
bsi_keychain_snapshot() {
  local keychain

  BSI_ORIGINAL_KEYCHAINS=()

  while IFS= read -r keychain; do
    [ -n "$keychain" ] || continue

    if bsi_keychain_is_ours "$keychain"; then
      echo "keychain: dropping stale signing keychain from the search list: $keychain"
      continue
    fi

    if [ ! -f "$keychain" ]; then
      echo "keychain: dropping search-list entry that no longer exists: $keychain"
      continue
    fi

    BSI_ORIGINAL_KEYCHAINS+=("$keychain")
  done < <(security list-keychains -d user | tr -d '"' | xargs -n1 || true)

  echo "keychain: search list to preserve: ${BSI_ORIGINAL_KEYCHAINS[*]:-(empty)}"
}

# Removes debris left by the previous version of these scripts, and repairs the default keychain.
#
# The old scheme could leave ~/Library/Keychains/build.keychain-db behind, and could leave it named
# as the user's default keychain. Neither state heals on its own, and both keep prompting the
# person at that Mac long after the build that caused them finished.
#
# Order matters here, and getting it wrong is how the old scripts made things worse: deleting a
# keychain that is currently the default leaves the user with *no* default keychain at all, which
# is a stranger state than the one being repaired. `security default-keychain -d user` then answers
# with an error rather than a path. So the default is repaired *after* the delete, and an empty
# answer counts as needing repair just as much as a stale one.
bsi_keychain_clear_legacy_state() {
  local default_keychain
  local login_keychain="${HOME}/Library/Keychains/login.keychain-db"

  if [ -f "${HOME}/Library/Keychains/${BSI_LEGACY_KEYCHAIN_NAME}-db" ]; then
    echo "keychain: found leftover ${BSI_LEGACY_KEYCHAIN_NAME} from an earlier build - deleting it"
    security delete-keychain "${BSI_LEGACY_KEYCHAIN_NAME}" >/dev/null 2>&1 || true
  fi

  default_keychain=$(security default-keychain -d user 2>/dev/null | tr -d '"' | xargs || true)

  # The only case where this script writes the default keychain at all: it points at our debris, at
  # a file that is gone, or at nothing. Anything the user chose deliberately is left alone.
  if [ -z "$default_keychain" ]; then
    echo "keychain: this host has no default keychain - pointing it at the login keychain"
    security default-keychain -d user -s "$login_keychain" >/dev/null 2>&1 || true
  elif bsi_keychain_is_ours "$default_keychain" || [ ! -f "$default_keychain" ]; then
    echo "keychain: default keychain is stale ($default_keychain) - restoring the login keychain"
    security default-keychain -d user -s "$login_keychain" >/dev/null 2>&1 || true
  fi
}

# Creates the signing keychain and makes it usable by codesign.
#
# $1 - password to lock the new keychain with.
#
# Sets BSI_KEYCHAIN_PATH. The caller is expected to have installed bsi_keychain_teardown as a trap
# before calling this.
bsi_keychain_setup() {
  local keychain_password="$1"
  local keychain_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"

  bsi_keychain_snapshot
  bsi_keychain_clear_legacy_state

  # Outside ~/Library/Keychains on purpose: it never shows up in Keychain Access, it cannot collide
  # with a stale build.keychain, and on a runner it is swept with RUNNER_TEMP even if this script
  # is killed hard enough that no trap runs.
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

  echo "keychain: search list is now"
  security list-keychains -d user
  echo "keychain: default keychain left at $(security default-keychain -d user 2>/dev/null | tr -d '"' | xargs)"
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

  if [ "${#BSI_ORIGINAL_KEYCHAINS[@]}" -gt 0 ]; then
    security list-keychains -d user -s "${BSI_ORIGINAL_KEYCHAINS[@]}" >/dev/null 2>&1 || true
  fi

  rm -f certificate.p12
}
