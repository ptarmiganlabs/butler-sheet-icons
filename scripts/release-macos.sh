#!/usr/bin/env bash
set -euo pipefail

# Keychain handling lives in a shared library because insider-build-mac.sh needs exactly the same
# thing, and the two hand-maintained copies had already drifted apart. See that file for why the
# default keychain is never touched.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/macos-signing-keychain.sh
. "${SCRIPT_DIR}/lib/macos-signing-keychain.sh"

# Create build directory if it doesn't exist
mkdir -p ./build

# Create a single JS file using esbuild
node scripts/bundle.mjs bundle

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json

# Get a copy of the Node executable
cp $(command -v node) ${DIST_FILE_NAME}

# Remove the signature from the Node executable
codesign --remove-signature ${DIST_FILE_NAME}

# Inject the blob
node scripts/bundle.mjs inject ${DIST_FILE_NAME}

# Wired to the signals as well as EXIT: a cancelled workflow run is killed, not exited, and the
# old EXIT-only trap is how a build could leave its keychain behind on a self-hosted Mac.
trap bsi_keychain_teardown EXIT INT TERM HUP

# -------------------
# Turn our base64-encoded certificate back to a regular .p12 file
printf '%s' "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12

# -------------------
# We need a keychain of our own, otherwise using the certificate will prompt with a UI dialog
# asking for the certificate password, which we can't answer in a headless CI environment.
bsi_keychain_setup "$MACOS_CI_KEYCHAIN_PWD"

security import certificate.p12 -k "$BSI_KEYCHAIN_PATH" -P "$MACOS_CERTIFICATE_PWD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$MACOS_CI_KEYCHAIN_PWD" "$BSI_KEYCHAIN_PATH"

# --keychain names where the signing identity must come from. The certificate chain is still built
# from the full search list, which is why the keychain is on it - see the library for the details.
codesign --force -s "$MACOS_CERTIFICATE_NAME" --keychain "$BSI_KEYCHAIN_PATH" -v "./${DIST_FILE_NAME}" --deep --strict --options=runtime --timestamp --entitlements ./release-config/${DIST_FILE_NAME}.entitlements

# -------------------
# We can't notarize an app bundle directly, but we need to compress it as an archive.
# Therefore, we create a zip file containing our app bundle, so that we can send it to the
# notarization service
# Notarize release binary
echo "Creating temp notarization archive for release binary"
ditto -c -k --keepParent "./${DIST_FILE_NAME}" "./${RELEASE_VERSION}-macos-arm64.zip"

# -------------------
# Here we send the notarization request to the Apple's Notarization service, waiting for the result.
echo "Notarize release app"
xcrun notarytool submit "./${RELEASE_VERSION}-macos-arm64.zip" --apple-id "$PROD_MACOS_NOTARIZATION_APPLE_ID" --team-id "$PROD_MACOS_NOTARIZATION_TEAM_ID" --password "$PROD_MACOS_NOTARIZATION_PWD" --wait

# -------------------
# Clean up. The keychain and the search list are the trap's job, so that they are restored whether
# this script finishes, fails, or is killed.
rm ./build/build.cjs ./build/sea-prep.blob

ls -la
