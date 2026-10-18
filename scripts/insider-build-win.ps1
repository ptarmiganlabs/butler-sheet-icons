$ErrorActionPreference = 'Stop'

# Builds the Windows insiders binary, UNSIGNED, and zips it.
#
# Insiders builds are not signed (plabs-house-rules, rules/ci/public-repositories.md): they are for
# testing, and signing every push to main would spend the signing identity on builds nobody ships.
# Releases are signed through Azure Artifact Signing by sign-win64 in ci.yaml, which a maintainer
# can rehearse between releases with ci.yaml's rehearse_signing input.
#
# The signtool lookup and the signature stripping come from the shared helpers, which the release
# build and butler-sheet-icons-premium use as well.
. "$PSScriptRoot/lib/win-signing.ps1"

$signtool = Get-BsiSigntoolPath
Write-Host "signtool: $signtool"

# Inject git SHA into package.json
$GIT_SHA = (git rev-parse --short HEAD)
(Get-Content package.json) -replace '"version": "(.*?)"', ('"version": "$1-' + $GIT_SHA + '"') | Set-Content package.json

# Create build directory if it doesn't exist
New-Item -ItemType Directory -Force -Path ./build | Out-Null

# Create a single JS file using esbuild
node scripts/bundle.mjs bundle
if ($LASTEXITCODE -ne 0) { throw "Bundling failed with exit code $LASTEXITCODE" }

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json
if ($LASTEXITCODE -ne 0) { throw "Generating the SEA blob failed with exit code $LASTEXITCODE" }

# Get a copy of the Node executable
node -e "require('fs').copyFileSync(process.execPath, '${env:DIST_FILE_NAME}.exe')"
if ($LASTEXITCODE -ne 0) { throw "Copying the Node executable failed with exit code $LASTEXITCODE" }

# -------------------
# Remove Node's own signature. Required even though nothing signs afterwards: postject rewrites the
# binary below, which would leave Node's signature broken rather than merely absent, and Windows
# reports a broken signature as a corrupt or tampered-with file.
Invoke-BsiStripSignature -Path "./${env:DIST_FILE_NAME}.exe" -Signtool $signtool

node scripts/bundle.mjs inject "${env:DIST_FILE_NAME}.exe"
if ($LASTEXITCODE -ne 0) { throw "Injecting the SEA blob failed with exit code $LASTEXITCODE" }

# -------------------
# Create insider's build zip
$compress = @{
    Path             = "./${env:DIST_FILE_NAME}.exe"
    CompressionLevel = "Fastest"
    DestinationPath  = "${env:DIST_FILE_NAME}--win-x64--${env:GITHUB_SHA}.zip"
}
Compress-Archive @compress

# -------------------
# Clean up
Remove-Item -Force ./build/build.cjs, ./build/sea-prep.blob

dir
