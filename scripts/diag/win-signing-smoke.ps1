# Signs one throwaway file and checks the result. Seconds, not minutes.
#
# The point is to be able to prove the certificate works without running a release build. The real
# Windows build spends almost all of its time on `npm ci`, esbuild and postject, none of which have
# anything to do with signing - so testing a certificate through it means waiting ten minutes to
# find out a thumbprint has a typo in it.
#
# The file signed is a copy of node.exe, and that choice is deliberate. It is the very binary the
# real build starts from, and it arrives carrying Node's own Authenticode signature, so the copy
# exercises `signtool remove` as well as signing. A small system utility would not: most are catalog
# signed rather than embedded signed, so there would be no signature to strip and that half of the
# path would go untested.
#
# Usage, from a checkout on the runner:
#   powershell -File scripts/diag/win-signing-smoke.ps1
#   powershell -File scripts/diag/win-signing-smoke.ps1 -Thumbprint <hex> -KeepOutput
#
# powershell, not pwsh: the win-code-sign runner has no PowerShell 7 installed. CODESIGN_WIN_THUMBPRINT
# is a repository secret and so is empty in an interactive shell - pass -Thumbprint by hand.
#
# Exits 0 when the file came out correctly signed, 1 otherwise.

[CmdletBinding()]
param(
    [string] $Thumbprint = $env:CODESIGN_WIN_THUMBPRINT,
    [string] $SourceExe,
    [switch] $KeepOutput
)

$ErrorActionPreference = 'Stop'

$onWindows = if ($PSVersionTable.PSEdition -eq 'Core') { [bool]$IsWindows } else { $true }
if (-not $onWindows) {
    Write-Host 'FAIL: Authenticode signing only runs on Windows.'
    exit 1
}

. "$PSScriptRoot/../lib/win-signing.ps1"

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$scratch = $null

try {
    if ([string]::IsNullOrWhiteSpace($Thumbprint)) {
        Write-Host 'FAIL: no certificate thumbprint. Pass -Thumbprint, or set CODESIGN_WIN_THUMBPRINT.'
        Write-Host 'Run scripts/diag/win-signing-check.ps1 to list the certificates on this machine.'
        exit 1
    }

    # Preflight before copying 100 MB around. This is also the check that distinguishes an expired
    # SimplySign session from a broken script, and it cannot itself trigger a login prompt.
    $status = Test-BsiSigningCertificate -Thumbprint $Thumbprint
    if (-not $status.Usable) {
        Write-Host "FAIL: the configured certificate is not usable ($($status.Reason))."
        Write-Host ''
        Write-Host (Get-BsiSimplySignHelp)
        exit 1
    }

    Write-Host '--- certificate ---'
    Write-Host "subject           : $($status.Subject)"
    Write-Host "issuer            : $($status.Issuer)"
    Write-Host "thumbprint        : $($status.Thumbprint)"
    Write-Host "valid until       : $($status.NotAfter.ToString('yyyy-MM-dd')) ($($status.DaysRemaining) days left)"

    # ---------------------------------------------------------------------------------------------
    # Pick the file to sign.
    # ---------------------------------------------------------------------------------------------
    if ([string]::IsNullOrWhiteSpace($SourceExe)) {
        $node = Get-Command -Name 'node.exe' -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($node) {
            $SourceExe = $node.Source
        }
        else {
            # Not fatal, but not equivalent either. Windows ships its own executables *catalog*
            # signed rather than embedded signed, so a copy of powershell.exe carries no signature
            # inside the file for signtool to remove - the strip below is skipped for it. Signing
            # and verification are exercised in full; only the strip is not.
            $SourceExe = (Get-Process -Id $PID).Path
            Write-Host 'NOTE: node.exe is not on PATH, so the current PowerShell executable is being'
            Write-Host '      used as the test subject instead. Put node on PATH for a test that'
            Write-Host '      also covers stripping an existing signature.'
        }
    }

    if (-not (Test-Path -LiteralPath $SourceExe -PathType Leaf)) {
        Write-Host "FAIL: source executable '$SourceExe' does not exist."
        exit 1
    }

    $scratchRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
    $scratch = Join-Path -Path $scratchRoot -ChildPath "bsi-signing-smoke-$([System.Guid]::NewGuid().ToString('N').Substring(0, 8))"
    New-Item -ItemType Directory -Path $scratch -Force | Out-Null

    $target = Join-Path -Path $scratch -ChildPath 'bsi-signing-smoke.exe'
    Copy-Item -LiteralPath $SourceExe -Destination $target -Force

    Write-Host ''
    Write-Host '--- subject ---'
    Write-Host "copied from       : $SourceExe"
    Write-Host "signing           : $target"
    Write-Host "size              : $([math]::Round((Get-Item -LiteralPath $target).Length / 1MB, 1)) MB"

    # ---------------------------------------------------------------------------------------------
    # The same three operations, in the same order, that the release build performs.
    # ---------------------------------------------------------------------------------------------
    Write-Host ''
    Write-Host '--- strip the existing signature ---'

    # Only an *embedded* signature can be removed. A catalog-signed file - which is how Windows
    # signs its own binaries - verifies happily but carries nothing inside the PE, and asking
    # signtool to remove it fails. The release build always starts from node.exe, which is embedded
    # signed, so it strips unconditionally; here the subject may be whatever was to hand.
    $existing = Get-AuthenticodeSignature -LiteralPath $target
    $signatureType = 'Unknown'
    if ($existing.PSObject.Properties.Name -contains 'SignatureType') {
        $signatureType = [string]$existing.SignatureType
    }

    if ($signatureType -eq 'Catalog') {
        Write-Host "skipped: the source is catalog signed ($($existing.Status)), so there is no"
        Write-Host '         embedded signature in the file to remove.'
    }
    elseif ($existing.Status -eq 'NotSigned') {
        Write-Host 'skipped: the source carries no signature.'
    }
    else {
        Invoke-BsiStripSignature -Path $target
    }

    Write-Host ''
    Write-Host '--- sign ---'
    $verifyOutput = Invoke-BsiSignFile -Path $target -Thumbprint $Thumbprint

    # ---------------------------------------------------------------------------------------------
    # Assert on the signature itself rather than on signtool's console output. Get-AuthenticodeSignature
    # reads the PE, so these assertions cannot pass because a message happened to be worded a certain
    # way - and the timestamp check in particular is the one that would have caught the 4.0.0 bug.
    # ---------------------------------------------------------------------------------------------
    Write-Host ''
    Write-Host '--- verify ---'
    $signature = Get-AuthenticodeSignature -LiteralPath $target

    Write-Host "status            : $($signature.Status)"
    Write-Host "signer            : $($signature.SignerCertificate.Subject)"
    Write-Host "signer thumbprint : $($signature.SignerCertificate.Thumbprint)"

    # Taken from signtool's own verify output rather than the signature object: Windows PowerShell
    # 5.1 does not expose a digest algorithm on a Signature, and 5.1 is what the signing host runs.
    $digest = 'unknown'
    if ($verifyOutput -match 'Hash of file \((\w+)\)') { $digest = $Matches[1] }
    Write-Host "file digest       : $digest"

    $problems = 0

    # The property that silently regressed before: the old script signed SHA-1 first and SHA-256
    # second, and because the second call was missing /as it replaced rather than appended. Only
    # flagged when signtool positively reports something other than sha256 - a wording change in a
    # future signtool must not be able to fail a release on its own.
    if ($digest -ne 'unknown' -and $digest -ne 'sha256') {
        Write-Host "FAIL: the file was signed with a $digest digest, expected sha256."
        $problems++
    }

    if ($signature.Status -ne 'Valid') {
        Write-Host "FAIL: signature status is '$($signature.Status)', expected 'Valid'."
        Write-Host "      $($signature.StatusMessage)"
        $problems++
    }

    if ($signature.SignerCertificate.Thumbprint -ne $status.Thumbprint) {
        Write-Host "FAIL: the file was signed by $($signature.SignerCertificate.Thumbprint), not the requested $($status.Thumbprint)."
        $problems++
    }

    if ($null -eq $signature.TimeStamperCertificate) {
        Write-Host 'FAIL: the signature carries no RFC 3161 timestamp.'
        Write-Host '      Without one the signature stops validating the day the certificate expires.'
        $problems++
    }
    else {
        Write-Host "timestamped by    : $($signature.TimeStamperCertificate.Subject)"
    }

    $stopwatch.Stop()
    Write-Host ''

    if ($problems -gt 0) {
        Write-Host "$problems problem(s) found after $([int]$stopwatch.Elapsed.TotalSeconds)s."
        exit 1
    }

    Write-Host "Signed and verified in $([int]$stopwatch.Elapsed.TotalSeconds)s."
    if ($KeepOutput) {
        Write-Host "Signed file kept at: $target"
        # Handed to the caller so a workflow can upload it without hard-coding the random directory.
        # Written through .NET rather than Out-File: on Windows PowerShell 5.1 `-Encoding utf8`
        # means UTF-8 *with a BOM*, and the runner does not strip it before parsing the line.
        if ($env:GITHUB_OUTPUT) {
            [System.IO.File]::AppendAllText($env:GITHUB_OUTPUT, "signed_file=$target$([System.Environment]::NewLine)")
        }
    }
    exit 0
}
finally {
    if ($scratch -and (-not $KeepOutput) -and (Test-Path -LiteralPath $scratch)) {
        Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
    }
}
