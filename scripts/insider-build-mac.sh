#!/usr/bin/env bash
set -euo pipefail

# Keychain handling lives in a shared library because release-macos.sh needs exactly the same
# thing, and the two hand-maintained copies had already drifted apart. This script runs on the
# self-hosted build Mac on every push to main, in a live desktop session - see the library for why
# that made the old approach untenable.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/macos-signing-keychain.sh
. "${SCRIPT_DIR}/lib/macos-signing-keychain.sh"

# Inject git SHA into package.json
GIT_SHA=$(git rev-parse --short HEAD)
CURRENT_VERSION=$(node -p "require('./package.json').version")
sed -i '' "s/\"version\": \".*\"/\"version\": \"${CURRENT_VERSION}-$GIT_SHA\"/" package.json

# Create build directory if it doesn't exist
mkdir -p ./build

# Create a single JS file using esbuild
./node_modules/.bin/esbuild src/${DIST_FILE_NAME}.js --bundle --outfile=./build/build.cjs --format=cjs --platform=node --target=node24 --inject:./src/lib/util/import-meta-url.js --define:import.meta.url=import_meta_url

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json

# Get a copy of the Node executable
cp "$(node -p 'process.execPath')" ${DIST_FILE_NAME}

# Remove the signature from the Node executable
codesign --remove-signature ${DIST_FILE_NAME}

# Inject the blob
npx postject ${DIST_FILE_NAME} NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA

# Wired to the signals as well as EXIT: a cancelled workflow run is killed, not exited, and the
# old EXIT-only trap is how a build could leave its keychain behind on this Mac.
trap bsi_keychain_teardown EXIT INT TERM HUP

pwd
ls -la

# Start signing of the binary

# -------------------
# Turn our base64-encoded certificate back to a regular .p12 file
printf '%s' "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12

# -------------------
# We need a keychain of our own, otherwise using the certificate will prompt with a UI dialog
# asking for the certificate password, which we can't answer in a headless CI environment.
bsi_keychain_setup "$MACOS_CI_KEYCHAIN_PWD"

security import certificate.p12 -k "$BSI_KEYCHAIN_PATH" -P "$MACOS_CERTIFICATE_PWD" -T /usr/bin/codesign -A

# Import Apple Developer ID G2 intermediate CA to allow building the cert chain
curl -f -L -sS -o DeveloperIDG2CA.cer https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
security import DeveloperIDG2CA.cer -k "$BSI_KEYCHAIN_PATH"
rm DeveloperIDG2CA.cer

security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$MACOS_CI_KEYCHAIN_PWD" "$BSI_KEYCHAIN_PATH"

# --keychain names where the signing identity must come from. The certificate chain is still built
# from the full search list, which is why the keychain is on it - see the library for the details.
codesign --force -s "$MACOS_CERTIFICATE_NAME" --keychain "$BSI_KEYCHAIN_PATH" -v "./${DIST_FILE_NAME}" --deep --strict --options=runtime --timestamp --entitlements ./release-config/${DIST_FILE_NAME}.entitlements

# Verify code signature
codesign -vvv --deep --strict "./${DIST_FILE_NAME}"

# -------------------
# Notarize
# Store the notarization credentials so that we can prevent a UI password dialog from blocking the CI
echo "Using direct credentials for notarization"

# -------------------
# We can't notarize an app bundle directly, but we need to compress it as an archive.
# Therefore, we create a zip file containing our app bundle, so that we can send it to the
# notarization service
# Notarize insider binary
echo "Creating temp notarization archive for insider build"
ditto -c -k --keepParent "./${DIST_FILE_NAME}" "./${DIST_FILE_NAME}--macos-arm64--${GITHUB_SHA}.zip"

# Here we send the notarization request to the Apple's Notarization service, waiting for the result.
echo "Notarize insider app"
xcrun notarytool submit "./${DIST_FILE_NAME}--macos-arm64--${GITHUB_SHA}.zip" --apple-id "$PROD_MACOS_NOTARIZATION_APPLE_ID" --team-id "$PROD_MACOS_NOTARIZATION_TEAM_ID" --password "$PROD_MACOS_NOTARIZATION_PWD" --wait

# -------------------
# Clean up. The keychain and the search list are the trap's job, so that they are restored whether
# this script finishes, fails, or is killed.
rm ./build/build.cjs ./build/sea-prep.blob

ls -la
