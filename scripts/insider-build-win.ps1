$ErrorActionPreference = 'Stop'

# See scripts/lib/win-signing.ps1 for how signing works here and why it is shaped this way.
. "$PSScriptRoot/lib/win-signing.ps1"

$signtool = Get-BsiSigntoolPath
Write-Host "signtool: $signtool"

# -------------------
# Signing is best-effort in insider builds.
#
# This job runs on every push to main, and the Certum cloud session it would need lasts about two
# hours after a human logs in - so most pushes will find no certificate. Failing them would turn
# main red for a reason that has nothing to do with the commit.
#
# But skipping signing entirely is what this build did until now, and it had a cost worth
# remembering: signing was then exercised nowhere except an actual release. That is exactly how the
# timestamp URL could be switched from http to https in May and go unnoticed until the 4.0.0
# release failed in August.
#
# So: no certificate is fine and says so, while a certificate that *is* available and then fails to
# sign fails the build. That way this job still catches a broken invocation, which is the whole
# reason for signing here.
$signingRequested = -not [string]::IsNullOrWhiteSpace($env:CODESIGN_WIN_THUMBPRINT)
$signingAvailable = $false

if ($signingRequested) {
    $certificate = Test-BsiSigningCertificate -Thumbprint $env:CODESIGN_WIN_THUMBPRINT
    $signingAvailable = $certificate.Usable

    if ($signingAvailable) {
        Write-Host "Signing with: $($certificate.Subject)"
        Write-Host "Certificate valid until $($certificate.NotAfter.ToString('yyyy-MM-dd')) ($($certificate.DaysRemaining) days left)."
    }
    else {
        Write-Host "::notice title=Unsigned insider build::No usable code signing certificate right now ($($certificate.Reason)), so this insider build is unsigned. That is expected unless somebody has an open SimplySign session on the runner."
    }
}
else {
    Write-Host '::notice title=Unsigned insider build::CODESIGN_WIN_THUMBPRINT is not set, so this insider build is unsigned.'
}

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
# Remove Node's own signature. Required whether or not we sign afterwards - postject rewrites the
# binary below, which would leave any existing signature broken rather than merely absent.
Invoke-BsiStripSignature -Path "./${env:DIST_FILE_NAME}.exe" -Signtool $signtool

npx postject "${env:DIST_FILE_NAME}.exe" NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# -------------------
# Sign the executable, when a certificate is actually available. Failures here are fatal on purpose
# - see the note above.
if ($signingAvailable) {
    Invoke-BsiSignFile -Path "./${env:DIST_FILE_NAME}.exe" -Thumbprint $env:CODESIGN_WIN_THUMBPRINT -Signtool $signtool | Out-Null
}

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
