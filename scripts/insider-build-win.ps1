$ErrorActionPreference = 'Stop'

$signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"

# Inject git SHA into package.json
$GIT_SHA = (git rev-parse --short HEAD)
(Get-Content package.json) -replace '"version": "(.*?)"', ('"version": "$1-' + $GIT_SHA + '"') | Set-Content package.json

# Create build directory if it doesn't exist
New-Item -ItemType Directory -Force -Path ./build | Out-Null

# Create a single JS file using esbuild
./node_modules/.bin/esbuild "src/${env:DIST_FILE_NAME}.js" --bundle --outfile=./build/build.cjs --format=cjs --platform=node --target=node24 --inject:./src/lib/util/import-meta-url.js --define:import.meta.url=import_meta_url

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json

# Get a copy of the Node executable
node -e "require('fs').copyFileSync(process.execPath, '${env:DIST_FILE_NAME}.exe')" 

pwd
dir

# -------------------
# Remove the signature from the executable
& $signtool remove /s "./${env:DIST_FILE_NAME}.exe"
if ($LASTEXITCODE -ne 0) { throw "signtool remove failed with exit code $LASTEXITCODE" }

npx postject "${env:DIST_FILE_NAME}.exe" NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# -------------------
# Sign the executable.
#
# Disabled, so insider builds ship unsigned. That is a deliberate choice to leave alone here, but it
# is worth knowing what it costs: because these lines never run, Windows signing is exercised
# nowhere except an actual release. That is exactly how the timestamp URL below could be switched
# from http to https in May and not be discovered until the 4.0.0 release failed in August.
#
# The URLs are corrected in step with release-win.ps1 so that uncommenting these does not
# resurrect the same failure. time.certum.pl serves no HTTPS - port 443 refuses the connection -
# and signtool answers `SignTool Error: Invalid Timestamp URL`. See release-win.ps1 for why plain
# HTTP is correct here rather than a weakness.
#
# 1st signing
# & $signtool sign /sha1 "$env:CODESIGN_WIN_THUMBPRINT" /tr http://time.certum.pl /td sha256 /fd sha1 /v "./${env:DIST_FILE_NAME}.exe"
# if ($LASTEXITCODE -ne 0) { throw "signtool sign (sha1) failed with exit code $LASTEXITCODE" }

# -------------------
# 2nd signing
# & $signtool sign /sha1 "$env:CODESIGN_WIN_THUMBPRINT" /tr http://time.certum.pl /td sha256 /fd sha256 /v "./${env:DIST_FILE_NAME}.exe"
# if ($LASTEXITCODE -ne 0) { throw "signtool sign (sha256) failed with exit code $LASTEXITCODE" }

# -------------------
# Create insider's build zip
$compress = @{
  Path = "./${env:DIST_FILE_NAME}.exe"
  CompressionLevel = "Fastest"
  DestinationPath = "${env:DIST_FILE_NAME}--win-x64--${env:GITHUB_SHA}.zip"
}
Compress-Archive @compress

# -------------------
# Clean up
Remove-Item -Force ./build/build.cjs, ./build/sea-prep.blob

dir
