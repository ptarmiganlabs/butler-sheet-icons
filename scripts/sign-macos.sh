#!/usr/bin/env bash
#
# Signs a built macOS binary with the Developer ID and has Apple notarize it, leaving the zip that
# was notarized for the workflow to upload.
#
#   bash scripts/release-macos.sh     # or scripts/insider-build-mac.sh: builds, and holds no secret
#   bash scripts/sign-macos.sh ./butler-sheet-icons ./butler-sheet-icons-v1.2.3-macos-arm64.zip
#
# Building and signing are two scripts, run as two steps, because they need different things. The
# build runs npm dependencies - esbuild, postject, and whatever their install scripts left behind.
# This script holds the Developer ID certificate and the Apple ID's app-specific password, and runs
# no dependency at all. Kept apart, no dependency ever runs with either in its environment: each
# workflow puts the six secrets on the step that runs this script and on no other, and that step
# drops everything else it inherited before it starts (release-macos-arm64 in ci.yaml says why).
# For the same reason nothing here runs the binary, which bundles dependency code too. The
# workflows test the signed binary in a step of its own, with no secret in reach.
#
# It is written for a persistent Mac as well as a hosted runner. A self-hosted runner, or a
# maintainer's own machine, keeps whatever a run leaves behind. So everything this script writes,
# apart from the zip, goes in one folder of its own that it removes on the way out, and the keychain
# handling leaves the search list exactly as it found it (scripts/lib/macos-signing-keychain.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Keychain handling lives in a library: signing must never touch the default keychain, nor leave
# the search list changed, and that file says why.
# shellcheck source=scripts/lib/macos-signing-keychain.sh
. "${SCRIPT_DIR}/lib/macos-signing-keychain.sh"

BINARY="${1:?usage: sign-macos.sh <binary> <zip>}"
ZIP="${2:?usage: sign-macos.sh <binary> <zip>}"

: "${MACOS_CERTIFICATE:?MACOS_CERTIFICATE must be set}"
: "${MACOS_CERTIFICATE_PWD:?MACOS_CERTIFICATE_PWD must be set}"
: "${MACOS_CERTIFICATE_NAME:?MACOS_CERTIFICATE_NAME must be set}"
: "${PROD_MACOS_NOTARIZATION_APPLE_ID:?PROD_MACOS_NOTARIZATION_APPLE_ID must be set}"
: "${PROD_MACOS_NOTARIZATION_TEAM_ID:?PROD_MACOS_NOTARIZATION_TEAM_ID must be set}"
: "${PROD_MACOS_NOTARIZATION_PWD:?PROD_MACOS_NOTARIZATION_PWD must be set}"

# Without an identifier, codesign names the code after its file, and "butler-sheet-icons" is not a
# name anybody owns. The identifier goes into the designated requirement, which is how macOS
# recognises a later build as the same program, so it is chosen once and kept: release and insider
# builds are both signed here, with the same one, and src/__tests__/binary.test.js pins it, the
# designated requirement with the team included. Change them together. Builds up to 5.2.0 were
# signed without it.
IDENTIFIER="com.ptarmiganlabs.butler-sheet-icons"

# The entitlements are the two V8 needs under the hardened runtime, for memory that is writable and
# executable. Two of the six the official node binary is signed with: the other four let a process
# of the same user debug Butler Sheet Icons or inject a library into it, which is not BSI's to
# grant on a customer's Mac. The file carries no comment: codesign parses it with AMFI's XML
# parser, stricter than plutil, and a `--` in a comment fails there while `plutil -lint` passes it
# (src/__tests__/release-entitlements.test.js).
ENTITLEMENTS="${ROOT}/release-config/butler-sheet-icons.entitlements"

# The name the notarization credentials are stored under, inside this run's own keychain. It goes
# nowhere else, so it needs to be no more than readable.
NOTARY_PROFILE="bsi-notarization"

# A regular file, and not a link. It is signed in place and copied into the zip that Apple is sent
# and the release carries, and both follow a link: a binary left as one would sign and ship whatever
# it points to. The build writes it after npm ci, so it is the least trusted thing this script is
# handed.
if [ ! -f "${BINARY}" ] || [ -L "${BINARY}" ]; then
  echo "::error::${BINARY} is missing, or is not a regular file. Build it first: bash scripts/release-macos.sh"
  exit 1
fi

# ditto would write through a link left where the zip goes.
if [ -L "${ZIP}" ]; then
  echo "::error::${ZIP} is a link. Refusing to write the zip through it."
  exit 1
fi

# Everything this run writes, apart from the zip, goes in one folder of its own, made by mktemp -d:
# a new directory, mode 700 whatever the umask, under a name nothing can predict. The certificate
# used to be decoded to ./certificate.p12, a path the build steps before this one could have
# replaced with a link; a redirection follows one, and the cleanup would then have removed the
# link and left the Developer ID key wherever it pointed. A folder that did not exist a moment ago
# cannot hold a link planted earlier. Made after the refusals above, so that a refusal leaves
# nothing behind, and with the cleanup installed straight after it.
TEMP_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
RUN_DIR="$(mktemp -d "${TEMP_DIR%/}/bsi-signing.XXXXXX")"
CERTIFICATE="${RUN_DIR}/certificate.p12"
NOTARY_RESULT="${RUN_DIR}/notarization.json"
# Where the keychain library puts the signing keychain, so that one cleanup covers the lot.
BSI_KEYCHAIN_DIR="${RUN_DIR}"

# Installed before the certificate is decoded, so that a decode that fails partway still removes
# what it wrote. Wired to the signals as well as EXIT, because a cancelled workflow run is
# signalled rather than exited. And each signal's trap ends the script once it has cleaned up: bash
# runs a trap after the command it was waiting for has died, then carries on with the next line,
# keychain gone, unless the trap exits.
cleanup() {
  bsi_keychain_teardown
  rm -rf "$RUN_DIR"
}
trap cleanup EXIT
trap 'cleanup; exit 129' HUP
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

echo "--- preparing a keychain to sign from"
# umask only around the decode, so that the certificate is this user's to read and nobody else's,
# whatever the runner's umask is. Not for the whole script: the mode the zipped binary carries comes
# from the umask too, and 077 would publish a 700 binary in place of a 755 one. set -C with it, so
# that the decode creates the file or fails, rather than writing through anything already at that
# path.
decode_umask="$(umask)"
umask 077
set -C
printf '%s' "$MACOS_CERTIFICATE" | base64 --decode > "$CERTIFICATE"
set +C
umask "$decode_umask"

# Made here rather than read from a secret. The keychain is deleted at the end of this run and
# nothing else ever opens it, so a password it shares with every other build buys nothing, and
# `security` takes keychain passwords on the command line, where `ps` can read them. 24 random
# bytes from the kernel, as hex.
KEYCHAIN_PWD="$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')"
[ "${#KEYCHAIN_PWD}" -eq 48 ] || { echo "::error::could not read 24 random bytes for the keychain password"; exit 1; }

bsi_keychain_setup "$KEYCHAIN_PWD"

# -x: the private key cannot be exported from the keychain once it is in, so a later step cannot
# read it back out, whatever it knows. -P puts the .p12's password on a command line; `man
# security` calls that insecure, and the alternative it offers is a GUI prompt, which a runner
# cannot answer. It is there for the moment this import takes, and the certificate file goes
# straight after. The keychain password is on command lines too, here and in the library, but it is
# this run's own and opens nothing else.
security import "$CERTIFICATE" -k "$BSI_KEYCHAIN_PATH" -P "$MACOS_CERTIFICATE_PWD" -T /usr/bin/codesign -x
rm -f "$CERTIFICATE"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PWD" "$BSI_KEYCHAIN_PATH"

# Apple's app-specific password goes into the throwaway keychain once, instead of onto the command
# line of every notarytool call. It is the Apple ID's password for more than notarization - it
# signs in to that account's iCloud mail, contacts and calendars - and `notarytool submit --wait`
# sits in the process table for as long as Apple takes, where any process of this user can read its
# arguments. store-credentials takes seconds, and validates the credentials with Apple before it
# stores them, so bad ones fail here rather than after the signing.
echo "--- storing the notarization credentials in the signing keychain"
xcrun notarytool store-credentials "$NOTARY_PROFILE" \
  --apple-id "$PROD_MACOS_NOTARIZATION_APPLE_ID" \
  --team-id "$PROD_MACOS_NOTARIZATION_TEAM_ID" \
  --password "$PROD_MACOS_NOTARIZATION_PWD" \
  --keychain "$BSI_KEYCHAIN_PATH"

# --force because the build signed the binary ad hoc, so that it would run; this replaces that
# signature rather than failing on it. --options=runtime is what makes the binary notarizable at
# all. --keychain names where the signing identity must come from. The certificate chain is still
# built from the full search list, which is why the keychain is on it - see the library.
#
# Up to three attempts. On a self-hosted Mac, codesign has been seen to fail with
# errSecInternalComponent ("unable to build chain to self-signed root") on a keychain that was
# demonstrably fine, and to pass on a plain re-run. The elapsed time is the tell if that ever
# changes character: about 30s is the stall, under a second is a keychain that really is wrong, and
# about 15s is the timestamp server out of reach.
echo "--- signing"
attempt=1
while : ; do
  started=$SECONDS
  if codesign --force -s "$MACOS_CERTIFICATE_NAME" --keychain "$BSI_KEYCHAIN_PATH" \
      --identifier "$IDENTIFIER" -v "${BINARY}" \
      --deep --strict --options=runtime --timestamp \
      --entitlements "${ENTITLEMENTS}"; then
    echo "signing: signed on attempt ${attempt} in $((SECONDS - started))s"
    break
  fi
  echo "signing: attempt ${attempt} failed after $((SECONDS - started))s"
  [ "$attempt" -lt 3 ] || { echo "::error::codesign failed three times; its output is above."; exit 1; }
  attempt=$((attempt + 1))
  sleep 5
done

echo "--- verifying the signature before spending a notarization on it"
# Not --deep, which is for bundles: this is a bare Mach-O executable.
codesign --verify --strict --verbose=2 "${BINARY}"

# Notarization takes an archive, not a bare executable, and this zip is the one that ships:
# notarizing records the binary's hash with Apple rather than changing it, so what was submitted
# and what is attached are the same bytes.
#
# It holds one folder, named after the binary, with the binary in it: butler-sheet-icons/
# butler-sheet-icons, which is what every macOS release has unpacked to. Those releases got the
# layout from `ditto --keepParent`, which names the folder after the directory the binary was
# zipped from, and that happened to be a checkout called butler-sheet-icons. It is staged here
# instead, so that the layout no longer depends on where the binary was built. --norsrc leaves out
# the extended attributes, which the zip would otherwise carry as a stray ._butler-sheet-icons
# beside the binary: the signature is inside the executable, not in them.
echo "--- notarizing"
NAME="$(basename "${BINARY}")"
STAGE="${RUN_DIR}/zip/${NAME}"
mkdir -p "${STAGE}"
cp "${BINARY}" "${STAGE}/${NAME}"
rm -f "${ZIP}"
ditto -c -k --norsrc --keepParent "${STAGE}" "${ZIP}"

# The verdict is read from the result rather than taken from notarytool's exit code, which its
# documentation does not promise for a submission Apple rejects. Twenty minutes is ample on an
# ordinary day, and a slower one then ends here, with a verdict, rather than at the job's timeout.
notarytool_exit=0
xcrun notarytool submit "${ZIP}" \
  --keychain-profile "$NOTARY_PROFILE" \
  --keychain "$BSI_KEYCHAIN_PATH" \
  --wait --timeout 20m --output-format json > "$NOTARY_RESULT" || notarytool_exit=$?
cat "$NOTARY_RESULT"; echo

submission_id=$(plutil -extract id raw -o - "$NOTARY_RESULT" 2>/dev/null || true)
status=$(plutil -extract status raw -o - "$NOTARY_RESULT" 2>/dev/null || true)

# Apple's own account of the submission: what it inspected, the hash it recorded, and any warning.
# Printed whether or not it was accepted - on a rejection it is the only place that says why.
if [ -n "$submission_id" ]; then
  echo "--- Apple's log for submission ${submission_id}"
  xcrun notarytool log "$submission_id" \
    --keychain-profile "$NOTARY_PROFILE" \
    --keychain "$BSI_KEYCHAIN_PATH" || echo "(the log could not be fetched)"
fi

if [ "$status" != "Accepted" ]; then
  echo "::error::Notarization ended as '${status:-no status at all}' (notarytool exited ${notarytool_exit}); what it said, and Apple's log where there is one, are above."
  exit 1
fi

# Deliberately no `xcrun stapler staple`: a ticket can only be stapled to a bundle, a disk image or
# an installer package. A bare executable has nowhere to put one, so Gatekeeper checks this binary
# against Apple's service online. The notarization above is still what stops it being blocked.

echo "--- done"
ls -la "${ZIP}"
