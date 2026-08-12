$ErrorActionPreference = 'Stop'

# Signing helpers, shared with the insider build and the diagnostics under scripts/diag. The
# certificate is a Certum cloud certificate reached through SimplySign Desktop; that library's
# header explains how it appears to signtool, why the timestamp URL is http, and why a hard timeout
# wraps every signtool call.
. "$PSScriptRoot/lib/win-signing.ps1"

$signtool = Get-BsiSigntoolPath
Write-Host "signtool: $signtool"

# -------------------
# Decide about signing before building anything.
#
# The build below takes minutes; deciding afterwards means spending all of them only to discover
# the certificate is not there. A SimplySign session lasts about two hours, so "not there" is a
# routine state rather than an exotic one, and it is worth one second to find out first.
#
# This is a store lookup, which catches a missing or expired certificate but NOT an expired
# SimplySign session - SimplySign leaves certificates registered after a session ends. The job that
# calls this script preflights with `win-signing-check.ps1 -ProveSigning`, which settles that by
# signing a scratch file. Treat the check here as the second line, not the first.
$signingRequested = -not [string]::IsNullOrWhiteSpace($env:CODESIGN_WIN_THUMBPRINT)

if ($signingRequested) {
    $certificate = Test-BsiSigningCertificate -Thumbprint $env:CODESIGN_WIN_THUMBPRINT

    if (-not $certificate.Usable) {
        # A hard failure, deliberately. release-win64 uploads to a *draft* release, so a failed job
        # costs a re-run once somebody has logged in to SimplySign - while an unsigned binary
        # published under a release that is supposed to be signed is not something a re-run fixes.
        Write-Host "::error title=Windows code signing unavailable::The configured signing certificate is not usable ($($certificate.Reason)). See the job log for what to do."
        throw @"
Refusing to build: signing was requested but no usable certificate is available ($($certificate.Reason)).

$(Get-BsiSimplySignHelp)
"@
    }

    Write-Host "Signing with: $($certificate.Subject)"
    Write-Host "Certificate valid until $($certificate.NotAfter.ToString('yyyy-MM-dd')) ($($certificate.DaysRemaining) days left)."

    if ($certificate.DaysRemaining -le 30) {
        Write-Host "::warning title=Code signing certificate expires soon::The Windows code signing certificate expires in $($certificate.DaysRemaining) days ($($certificate.NotAfter.ToString('yyyy-MM-dd'))). Renew it before it lapses - an expired certificate is what left 4.0.0 without a Windows binary."
    }
}
else {
    # The deliberate kill switch. Signing is skipped when CODESIGN_WIN_THUMBPRINT is empty, and the
    # release ships unsigned rather than failing: that is what happened to 4.0.0, where the signing
    # step failed and the release was published with Linux and macOS binaries and no Windows one at
    # all. A user can click through a SmartScreen warning; they cannot click through a missing file.
    #
    # This is only for switching signing off on purpose. A configured certificate that turns out to
    # be unusable takes the branch above and fails.
    Write-Host "::warning title=Unsigned Windows binary::CODESIGN_WIN_THUMBPRINT is not set, so this release ships an UNSIGNED Windows binary. Users will see a Microsoft Defender SmartScreen warning, and environments enforcing AppLocker or WDAC publisher rules will refuse to run it."
    Write-Host 'Skipping Windows code signing - no certificate thumbprint configured.'
}

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
Invoke-BsiStripSignature -Path "./${env:DIST_FILE_NAME}.exe" -Signtool $signtool

npx --no-install postject "${env:DIST_FILE_NAME}.exe" NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# -------------------
# Sign the executable.
#
# One SHA-256 signature. This used to be a SHA-1 pass followed by a SHA-256 pass, which was neither
# a dual signature nor useful: the second call was missing /as, so it replaced the first rather than
# appending to it, and Windows has distrusted SHA-1 Authenticode since 2016 anyway. See
# scripts/lib/win-signing.ps1 for the invocation and the timestamping rationale.
if ($signingRequested) {
    Invoke-BsiSignFile -Path "./${env:DIST_FILE_NAME}.exe" -Thumbprint $env:CODESIGN_WIN_THUMBPRINT -Signtool $signtool | Out-Null
}

# -------------------
# Create release binary zip
$compress = @{
    Path             = "./${env:DIST_FILE_NAME}.exe"
    CompressionLevel = "Fastest"
    DestinationPath  = "${env:RELEASE_VERSION}-win.zip"
}
Compress-Archive @compress

# -------------------
# Clean up
Remove-Item -Force ./build/build.cjs
Remove-Item -Force ./build/sea-prep.blob

dir
