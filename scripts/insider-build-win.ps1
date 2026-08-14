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
#
# Answering "is one available" takes two stages, and it has to. The certificate store is the cheap
# gate below: it costs nothing, and a genuinely absent certificate stops there without paying a
# timeout. But a store lookup cannot answer the question on its own. SimplySign leaves the
# certificate registered after its two-hour session ends and HasPrivateKey stays true, so the
# lookup says "usable" on almost every push to main, signing is attempted, signtool hangs on a
# login dialog until it is killed, and main goes red for the common case rather than the rare one.
# That is the bug this arrangement replaces. Test-BsiSigningSession settles it further down, by
# actually using the key.
$signingRequested = -not [string]::IsNullOrWhiteSpace($env:CODESIGN_WIN_THUMBPRINT)
$certificateRegistered = $false

if ($signingRequested) {
    # Checked by cause rather than by symptom. Test-BsiSigningCertificate strips non-hex characters
    # before comparing, so a secret with a stray space or a smart quote still matches the store -
    # and then signtool, which gets the raw string, reports a certificate it cannot find. That is
    # indistinguishable from an ordinary lapsed session by the time the probe sees it, and it would
    # go out unsigned and green forever. Here it is unambiguous.
    if ($env:CODESIGN_WIN_THUMBPRINT -match '[^0-9A-Fa-f]') {
        Write-Host '::warning title=Malformed signing thumbprint::WIN_CODESIGN_THUMBPRINT contains characters that are not hexadecimal. The certificate lookup tolerates that but signtool does not, so signing will fail even with an open SimplySign session. Check the secret for spaces or line breaks.'
    }

    $certificate = Test-BsiSigningCertificate -Thumbprint $env:CODESIGN_WIN_THUMBPRINT
    $certificateRegistered = $certificate.Usable

    if ($certificateRegistered) {
        Write-Host "Certificate in the store: $($certificate.Subject)"
        Write-Host "Certificate valid until $($certificate.NotAfter.ToString('yyyy-MM-dd')) ($($certificate.DaysRemaining) days left)."
        Write-Host 'That says a SimplySign session existed, not that one is open. Whether this host can sign is settled just before signing.'
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
# binary below, which would leave any existing signature broken rather than merely absent. Note
# that this needs no private key at all, so it is unaffected by whether a session is open, and it
# stays outside the signing gate below for that reason.
Invoke-BsiStripSignature -Path "./${env:DIST_FILE_NAME}.exe" -Signtool $signtool

npx postject "${env:DIST_FILE_NAME}.exe" NODE_SEA_BLOB ./build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# -------------------
# Settle whether this host can sign, by signing a scratch file.
#
# Here rather than up with the certificate lookup on purpose: the probe and the real sign have to be
# adjacent. A SimplySign session that lapsed during the six minutes this build takes would otherwise
# pass a probe at the top and fail the sign at the bottom - the exact red build this arrangement
# exists to prevent, just rarer. Deciding late costs nothing, because an insider build never aborts
# for want of a certificate; it builds and zips either way.
#
# $env:CODESIGN_WIN_THUMBPRINT rather than $certificate.Thumbprint: the latter is a normalised copy
# of the repository secret, and GitHub's log masker would not recognise it in the echoed signtool
# command line.
$signingAvailable = $false

if ($certificateRegistered) {
    $session = Test-BsiSigningSession -Thumbprint $env:CODESIGN_WIN_THUMBPRINT -Signtool $signtool
    $detail = ([string]$session.Detail) -replace '\r?\n', ' '

    switch ($session.Kind) {
        'Ok' {
            $signingAvailable = $true
            Write-Host "The signing session is live (probe took $([int]$session.Elapsed.TotalSeconds)s)."
            Write-Host '::notice title=Signed insider build::A SimplySign session is open on the runner, so this insider build is signed. That is also what exercises the signing invocation between releases.'
        }

        'Timeout' {
            Write-Host "::notice title=Unsigned insider build::The certificate is registered but its private key did not answer within $($session.TimeoutSeconds) seconds - signtool was left waiting on a SimplySign login prompt that nothing on a runner can answer. This insider build is unsigned. Log in to SimplySign Desktop on the runner to have insider builds signed again."
        }

        'SessionUnavailable' {
            # Including "signtool cannot see the certificate", which is what a disconnected
            # SimplySign actually produces on this runner: the certificate stays in the store with
            # HasPrivateKey true, and signtool answers "No certificates were found that met all the
            # given criteria" in about a second. That is the ordinary state between sessions, so it
            # is a notice like the rest. A thumbprint secret that signtool cannot parse would look
            # identical from here, which is why that is checked directly further up instead.
            Write-Host "::notice title=Unsigned insider build::The certificate is registered but signtool cannot sign with it ($($session.Reason)), so this insider build is unsigned. SimplySign leaves certificates registered after a session ends. Log in to SimplySign Desktop on the runner to have insider builds signed again."
        }

        'ProbeError' {
            # The probe could not be carried out - no signtool, no scratch executable, no temp
            # space. That is a statement about this machine, not about the signing session, so it
            # cannot be read as "the session is dead" and it is not read as a signing fault either.
            Write-Host "::warning title=Windows signing probe could not run::The signing probe failed to run at all ($detail), so it says nothing about the SimplySign session and this insider build is unsigned. Run scripts/diag/win-signing-check.ps1 on the runner."
        }

        default {
            # signtool ran, failed, did not time out, and said nothing that matches any known
            # symptom of a lapsed SimplySign session. Fatal on purpose: the recognised set covers
            # the timeout plus the whole CNG and smart card families, so what is left is genuinely
            # surprising - and one of the things it can be is a real regression in the signing
            # invocation, which is the single thing signing in an insider build exists to catch.
            # A missing symptom costs one red build and one line in $BsiSessionHresult; swallowing
            # this would cost silent unsigned releases, which this project has already paid for.
            Write-Host "::error title=Windows signing probe failed::signtool exited $($session.ExitCode) signing a scratch file and said nothing matching a known SimplySign session symptom ($($session.Reason)). Treated as a real fault rather than an expired session."
            throw @"
Refusing to continue: the signing probe failed in a way this script does not recognise.

Exit code : $($session.ExitCode)
Reason    : $($session.Reason)
signtool  : $detail

A lapsed SimplySign session is recognised and produces an unsigned build rather than a failed one.
This is not that, so it is being reported instead of swallowed. Run
scripts/diag/win-signing-check.ps1 -ProveSigning on the runner for the full picture.

$(Get-BsiSimplySignHelp)
"@
        }
    }
}

# -------------------
# Sign the executable, when the key answered. Failures here are fatal on purpose - see the note
# above. This is the invocation that still has to catch a broken timestamp URL, which is why the
# probe above deliberately does not timestamp.
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
