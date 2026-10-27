$ErrorActionPreference = 'Stop'

# Builds the Windows release binary, UNSIGNED, and checks it.
#
# Signing is not done here. The release workflow signs in a job of its own, sign-win64 in ci.yaml,
# through Azure Artifact Signing: that job holds the signing identity and runs no repository code,
# so nothing this script or its dependencies do can reach it. What this script leaves behind is
# exactly what that job needs:
#
#   <DIST_FILE_NAME>.exe          the unsigned binary
#   <DIST_FILE_NAME>.exe.sha256   its SHA-256, which sign-win64 checks before signing anything
#
# The signtool lookup and the signature stripping come from the shared helpers, which the insider
# build and variant builds use as well.
. "$PSScriptRoot/lib/win-signing.ps1"

$signtool = Get-BsiSigntoolPath
Write-Host "signtool: $signtool"

$binary = "./${env:DIST_FILE_NAME}.exe"

# Create build directory if it doesn't exist
New-Item -ItemType Directory -Force -Path ./build | Out-Null

# Create a single JS file using esbuild
node scripts/bundle.mjs bundle
if ($LASTEXITCODE -ne 0) { throw "Bundling failed with exit code $LASTEXITCODE" }

# Generate blob to be injected into the binary
node --experimental-sea-config build-script/sea-config.json
if ($LASTEXITCODE -ne 0) { throw "Generating the SEA blob failed with exit code $LASTEXITCODE" }

# Get a copy of the Node executable
node -e "require('fs').copyFileSync(process.execPath, '$binary')"
if ($LASTEXITCODE -ne 0) { throw "Copying the Node executable failed with exit code $LASTEXITCODE" }

# -------------------
# Remove Node's own signature from the copied executable.
#
# Not optional: postject rewrites the binary below, which invalidates any signature already on it.
# A binary carrying a broken signature is worse than an unsigned one - Windows reports it as
# corrupt or tampered with - and sign-win64 signs a clean file or nothing.
Invoke-BsiStripSignature -Path $binary -Signtool $signtool

node scripts/bundle.mjs inject $binary
if ($LASTEXITCODE -ne 0) { throw "Injecting the SEA blob failed with exit code $LASTEXITCODE" }

# -------------------
# Smoke-test it: the cheapest check that postject produced something that runs, and that it is the
# version being built. One line of --version output must be exactly "butler-sheet-icons <version>",
# so a substring match cannot accept 5.1.10 for 5.1.1, or an error message that mentions the
# version.
$expected = node -p "require('./package.json').version"
$reported = (& $binary --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "The built binary failed to run: --version exited $LASTEXITCODE." }
if ($reported -notmatch "(?m)^\s*butler-sheet-icons $([regex]::Escape($expected))\s*$") {
    throw "The built binary reports '$reported', expected 'butler-sheet-icons $expected'."
}
Write-Host "smoke test: --version reports $reported"

# -------------------
# Check it is unsigned rather than signed badly: sign-win64 signs a clean file or nothing.
$status = (Get-AuthenticodeSignature -LiteralPath $binary).Status
if ($status -ne 'NotSigned') {
    throw "The built binary should carry no signature; Windows reports '$status'."
}

# -------------------
# Record the digest sign-win64 checks the artifact against before it signs.
$hash = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
[System.IO.File]::WriteAllText((Join-Path (Get-Location) "$binary.sha256"), $hash)
Write-Host "Unsigned binary SHA-256: $hash"

# -------------------
# Clean up
Remove-Item -Force ./build/build.cjs
Remove-Item -Force ./build/sea-prep.blob

Get-ChildItem $binary, "$binary.sha256"
