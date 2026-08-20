#!/usr/bin/env bash
set -euo pipefail

# Create build directory if it doesn't exist
mkdir -p ./build

# Create a single JS file using esbuild
node scripts/bundle.mjs bundle

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json

# Get a copy of the Node executable
cp $(command -v node) ${DIST_FILE_NAME}

# Inject the blob
node scripts/bundle.mjs inject ${DIST_FILE_NAME}

# -------------------
# Clean up
rm ./build/build.cjs ./build/sea-prep.blob

ls -la
