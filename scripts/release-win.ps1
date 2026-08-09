$ErrorActionPreference = 'Stop'

$signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"

# Create build directory if it doesn't exist
New-Item -ItemType Directory -Force -Path ./build | Out-Null

# Create a single JS file using esbuild
./node_modules/.bin/esbuild "src/${env:DIST_FILE_NAME}.js" --bundle --outfile=./build/build.cjs --format=cjs --platform=node --target=node24 --inject:./src/lib/util/import-meta-url.js --define:import.meta.url=import_meta_url

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json

# Get a copy of the Node executable
node -e "require('fs').copyFileSync(process.execPath, '${env:DIST_FILE_NAME}.exe')" 

# -------------------
# Remove the signature from the executable
& $signtool remove /s "./${env:DIST_FILE_NAME}.exe"
if ($LASTEXITCODE -ne 0) { throw "signtool remove failed with exit code $LASTEXITCODE" }

npx --no-install postject "${env:DIST_FILE_NAME}.exe" NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# -------------------
# Sign the executable.
#
# The timestamp URL is http, not https, and has to stay that way: time.certum.pl serves no HTTPS at
# all - port 443 refuses the connection - so signtool answers `SignTool Error: Invalid Timestamp
# URL` and the release build fails. That is not a hypothetical; it is what broke the 4.0.0 release.
#
# This is not a security weakness, which is why an https "fix" keeps looking tempting. An RFC 3161
# timestamp token is signed by the timestamping authority, so it is verified on its own signature
# rather than on the transport, and signtool rejects a token that does not verify. Plain HTTP is
# what the RFC expects and what essentially every public TSA offers.
#
# 1st signing
& $signtool sign /sha1 "$env:CODESIGN_WIN_THUMBPRINT" /tr http://time.certum.pl /td sha256 /fd sha1 /v "./${env:DIST_FILE_NAME}.exe"
if ($LASTEXITCODE -ne 0) { throw "signtool sign (sha1) failed with exit code $LASTEXITCODE" }

# -------------------
# 2nd signing
& $signtool sign /sha1 "$env:CODESIGN_WIN_THUMBPRINT" /tr http://time.certum.pl /td sha256 /fd sha256 /v "./${env:DIST_FILE_NAME}.exe"
if ($LASTEXITCODE -ne 0) { throw "signtool sign (sha256) failed with exit code $LASTEXITCODE" }

# -------------------
# Create release binary zip
$compress = @{
  Path = "./${env:DIST_FILE_NAME}.exe"
  CompressionLevel = "Fastest"
  DestinationPath = "${env:RELEASE_VERSION}-win.zip"
}
Compress-Archive @compress

# -------------------
# Clean up
Remove-Item -Force ./build/build.cjs
Remove-Item -Force ./build/sea-prep.blob

dir
