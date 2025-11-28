# Build butler executable using Node.js SEA
# Execute this script from the repository's root folder

# Create a single JS file using esbuild
./node_modules/.bin/esbuild src/butler-sheet-icons.js  \
  --bundle  \
  --outfile=./build/build.cjs  \
  --format=cjs  \
  --platform=node  \
  --target=node24  \
  --inject:./src/lib/util/import-meta-url.js  \
  --define:import.meta.url=import_meta_url

# Generate blob to be injected into the binary
echo ""
echo "Generating SEA blob..."
node --experimental-sea-config ./build-script/sea-config.json

# Get a copy of the Node executable
echo ""
echo "Preparing Node.js executable..."
cp $(command -v node) ./build/butler-sheet-icons

# Remove the signature from the Node executable
echo ""
echo "Removing signature from Node.js executable..."
codesign --remove-signature ./build/butler-sheet-icons

# Inject the blob
echo ""
echo "Injecting SEA blob into the executable..."
ls -la ./build
npx postject ./build/butler-sheet-icons NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA

# Sign the binary
echo ""
echo "Signing the executable..."
codesign --sign - ./build/butler-sheet-icons

echo ""
echo "Build complete: ./build/butler-sheet-icons"