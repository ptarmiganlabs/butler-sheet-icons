# Build butler executable using Node.js SEA
# Execute this script from the repository's root folder

# Create a single JS file using esbuild
node scripts/bundle.mjs bundle

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
node scripts/bundle.mjs inject ./build/butler-sheet-icons

# Sign the binary
echo ""
echo "Signing the executable..."
codesign --sign - ./build/butler-sheet-icons

echo ""
echo "Build complete: ./build/butler-sheet-icons"