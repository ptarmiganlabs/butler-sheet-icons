#!/usr/bin/env bash
set -euo pipefail

# Builds the release binary, ./${DIST_FILE_NAME}, and signs it ad hoc so that it runs. Nothing
# more: the Developer ID signature and the notarization are scripts/sign-macos.sh's, run as a step
# of its own. This script runs npm dependencies - esbuild and postject - so it is the half that must
# never have the Apple secrets in its environment, and it reads none.

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

# arm64 macOS will not execute an unsigned binary at all. The ad hoc signature is what lets the
# binary run before it is signed, and scripts/sign-macos.sh replaces it with the Developer ID's.
codesign --sign - --force "${DIST_FILE_NAME}"

# Clean up
rm ./build/build.cjs ./build/sea-prep.blob

ls -la
