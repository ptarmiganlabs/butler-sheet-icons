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
# Remove Node's own signature from the copied executable.
#
# This happens whether or not we go on to sign, and it is not optional: postject rewrites the
# binary below, which invalidates any signature already on it. Shipping a binary carrying a broken
# signature is worse than shipping an unsigned one - Windows reports it as corrupt or tampered
# with, which alarms users and antivirus far more than no signature at all.
& $signtool remove /s "./${env:DIST_FILE_NAME}.exe"
if ($LASTEXITCODE -ne 0) { throw "signtool remove failed with exit code $LASTEXITCODE" }

npx --no-install postject "${env:DIST_FILE_NAME}.exe" NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# -------------------
# Sign the executable, if there is a certificate to sign with.
#
# Signing is skipped when CODESIGN_WIN_THUMBPRINT is empty, and the release ships unsigned. That is
# deliberate: the code signing certificate expired, and a release that fails outright is worse than
# one that ships a working binary with a warning. It is what happened to 4.0.0 - the signing step
# failed and the release was published with Linux and macOS binaries and no Windows one at all. A
# user can click through a SmartScreen warning; they cannot click through a missing file.
#
# To turn signing back on, set the WIN_CODESIGN_THUMBPRINT secret again. Nothing else needs
# changing - which is the reason this is a guard rather than deleted code. Note that Certum
# SimplySign is a cloud signing service, so when that route lands the invocation below will likely
# need reworking rather than merely re-enabling.
#
# The timestamp URL is http, not https, and has to stay that way: time.certum.pl serves no HTTPS at
# all - port 443 refuses the connection - so signtool answers `SignTool Error: Invalid Timestamp
# URL`. That is not a hypothetical either; it is the bug that broke the 4.0.0 Windows release
# before the certificate expiry was known about.
#
# This is not a security weakness, which is why an https "fix" keeps looking tempting. An RFC 3161
# timestamp token is signed by the timestamping authority, so it is verified on its own signature
# rather than on the transport, and signtool rejects a token that does not verify. Plain HTTP is
# what the RFC expects and what essentially every public TSA offers.
if ([string]::IsNullOrWhiteSpace($env:CODESIGN_WIN_THUMBPRINT)) {
  Write-Host "::warning title=Unsigned Windows binary::CODESIGN_WIN_THUMBPRINT is not set, so this release ships an UNSIGNED Windows binary. Users will see a Microsoft Defender SmartScreen warning, and environments enforcing AppLocker or WDAC publisher rules will refuse to run it."
  Write-Host "Skipping Windows code signing - no certificate thumbprint configured."
}
else {
  # 1st signing
  & $signtool sign /sha1 "$env:CODESIGN_WIN_THUMBPRINT" /tr http://time.certum.pl /td sha256 /fd sha1 /v "./${env:DIST_FILE_NAME}.exe"
  if ($LASTEXITCODE -ne 0) { throw "signtool sign (sha1) failed with exit code $LASTEXITCODE" }

  # -------------------
  # 2nd signing
  & $signtool sign /sha1 "$env:CODESIGN_WIN_THUMBPRINT" /tr http://time.certum.pl /td sha256 /fd sha256 /v "./${env:DIST_FILE_NAME}.exe"
  if ($LASTEXITCODE -ne 0) { throw "signtool sign (sha256) failed with exit code $LASTEXITCODE" }

  # Fail loudly rather than shipping something that only looks signed.
  & $signtool verify /pa /v "./${env:DIST_FILE_NAME}.exe"
  if ($LASTEXITCODE -ne 0) { throw "signtool verify failed with exit code $LASTEXITCODE - the binary is not correctly signed" }
}

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
