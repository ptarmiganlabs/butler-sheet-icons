#!/usr/bin/env bash
set -euo pipefail

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
cp $(command -v node) ${DIST_FILE_NAME}

# Remove the signature from the Node executable
codesign --remove-signature ${DIST_FILE_NAME}

# Inject the blob
npx postject ${DIST_FILE_NAME} NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA

ORIGINAL_KEYCHAINS=$(security list-keychains -d user | tr -d '"' | xargs || true)
ORIGINAL_DEFAULT_KEYCHAIN=$(security default-keychain -d user | tr -d '"' | xargs || true)

cleanup() {
  security delete-keychain build.keychain >/dev/null 2>&1 || true
  if [ -n "${ORIGINAL_KEYCHAINS:-}" ]; then
    security list-keychains -d user -s ${ORIGINAL_KEYCHAINS} >/dev/null 2>&1 || true
  fi
  if [ -n "${ORIGINAL_DEFAULT_KEYCHAIN:-}" ]; then
    security default-keychain -d user -s "${ORIGINAL_DEFAULT_KEYCHAIN}" >/dev/null 2>&1 || true
  fi
  rm -f certificate.p12
}

trap cleanup EXIT

security delete-keychain build.keychain >/dev/null 2>&1 || true

pwd
ls -la

# Start signing of the binary

# -------------------
# Turn our base64-encoded certificate back to a regular .p12 file
printf '%s' "$MACOS_CERTIFICATE" | base64 --decode > certificate.p12

# -------------------
# We need to create a new keychain, otherwise using the certificate will prompt
# with a UI dialog asking for the certificate password, which we can't
# use in a headless CI environment
security create-keychain -p "$MACOS_CI_KEYCHAIN_PWD" build.keychain
security list-keychains -d user -s build.keychain ${ORIGINAL_KEYCHAINS:-}
security default-keychain -d user -s build.keychain
security unlock-keychain -p "$MACOS_CI_KEYCHAIN_PWD" build.keychain
security import certificate.p12 -k build.keychain -P "$MACOS_CERTIFICATE_PWD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$MACOS_CI_KEYCHAIN_PWD" build.keychain

codesign --force -s "$MACOS_CERTIFICATE_NAME" -v "./${DIST_FILE_NAME}" --deep --strict --options=runtime --timestamp --entitlements ./release-config/${DIST_FILE_NAME}.entitlements

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
# Clean up
# Delete build keychain
security delete-keychain build.keychain
rm ./build/build.cjs ./build/sea-prep.blob

ls -la
