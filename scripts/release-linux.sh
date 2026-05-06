#!/usr/bin/env bash
set -euo pipefail

# Create build directory if it doesn't exist
mkdir -p ./build

# Create a single JS file using esbuild
./node_modules/.bin/esbuild src/${DIST_FILE_NAME}.js --bundle --outfile=./build/build.cjs --format=cjs --platform=node --target=node24 --inject:./src/lib/util/import-meta-url.js --define:import.meta.url=import_meta_url

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json

# Get a copy of the Node executable
cp $(command -v node) ${DIST_FILE_NAME}

# Inject the blob
npx postject ${DIST_FILE_NAME} NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# -------------------
# Clean up
rm ./build/build.cjs ./build/sea-prep.blob

ls -la
