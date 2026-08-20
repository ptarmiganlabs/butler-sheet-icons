#!/usr/bin/env bash
set -euo pipefail

# Inject git SHA into package.json
GIT_SHA=$(git rev-parse --short HEAD)
CURRENT_VERSION=$(node -p "require('./package.json').version")
sed -i "s/\"version\": \".*\"/\"version\": \"${CURRENT_VERSION}-$GIT_SHA\"/" package.json

# Create build directory if it doesn't exist
mkdir -p ./build

# Create a single JS file using esbuild
node scripts/bundle.mjs bundle

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json

# Get a copy of the Node executable
cp "$(node -p 'process.execPath')" ${DIST_FILE_NAME}

# Inject the blob
node scripts/bundle.mjs inject ${DIST_FILE_NAME}

# Compress insider's build
tar -czf "${DIST_FILE_NAME}--linux-x64--${GITHUB_SHA}.tgz" "${DIST_FILE_NAME}"

ls -la

# -------------------
# Clean up
rm ./build/build.cjs ./build/sea-prep.blob

ls -la
