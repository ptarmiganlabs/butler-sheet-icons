#!/usr/bin/env bash
set -euo pipefail

# Builds the insider binary, ./${DIST_FILE_NAME}, versioned with the commit, and signs it ad hoc so
# that it runs. Signing it with the Developer ID and notarizing it are scripts/sign-macos.sh's, run
# as a step of its own, as for a release: this script runs npm dependencies, and reads no secret.
# It used to run on the self-hosted build Mac on every push to main, in a live desktop session - see
# scripts/lib/macos-signing-keychain.sh for why that made the old approach untenable. It now runs on
# a GitHub-hosted runner (insiders-build-macos in insiders-build.yaml).

# Inject git SHA into package.json
GIT_SHA=$(git rev-parse --short HEAD)
CURRENT_VERSION=$(node -p "require('./package.json').version")
sed -i '' "s/\"version\": \".*\"/\"version\": \"${CURRENT_VERSION}-$GIT_SHA\"/" package.json

# Create build directory if it doesn't exist
mkdir -p ./build

# Create a single JS file using esbuild
node scripts/bundle.mjs bundle

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json

# Get a copy of the Node executable
cp "$(node -p 'process.execPath')" ${DIST_FILE_NAME}

# Remove the signature from the Node executable
codesign --remove-signature ${DIST_FILE_NAME}

# Inject the blob
node scripts/bundle.mjs inject ${DIST_FILE_NAME}

# As in release-macos.sh: arm64 macOS will not execute an unsigned binary, and scripts/sign-macos.sh
# replaces this ad hoc signature with the Developer ID's.
codesign --sign - --force "${DIST_FILE_NAME}"

# Clean up
rm ./build/build.cjs ./build/sea-prep.blob

ls -la
