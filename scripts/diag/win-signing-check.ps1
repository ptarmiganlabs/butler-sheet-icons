# Read-only audit of the Windows code signing setup on a build host.
#
# The macOS side has scripts/diag/macos-keychain-check.sh for the same purpose and with the same
# contract: it changes nothing, and exits 0 when the host can sign and 1 when it cannot. Keeping it
# read-only means it can be run on any machine without consequences, and means a CI failure here
# reports a real state rather than one the checker just repaired.
#
# It answers the question that decides whether Windows signing works at all: is a usable certificate
# visible *to this Windows account, in this session*? A Certum cloud certificate reaches the store
# through SimplySign Desktop's Key Storage Provider, which serves the account SimplySign is logged
# in as. A runner running as a service, or as a different account, sees nothing - and the symptom is
# indistinguishable from an expired session unless something reports the account.
#
# Usage:
#   pwsh -File scripts/diag/win-signing-check.ps1
#   pwsh -File scripts/diag/win-signing-check.ps1 -Thumbprint <hex> -RequireSigning
#
# Without -RequireSigning it reports and exits 0 - useful for looking at a machine.
#
# -RequireSigning means "if signing is configured, it has to work": a thumbprint that does not
# resolve to a usable certificate becomes a failure, which is how the release job fails fast
# instead of building for ten minutes and then discovering it cannot sign. An *empty* thumbprint is
# still not a failure, because that is the deliberate kill switch - scripts/release-win.ps1 then
# ships an unsigned binary with a warning, which is a decision somebody made rather than a fault.

#
# -ProveSigning goes further and actually signs a few-kilobyte scratch file. Use it wherever the
# answer needs to be trustworthy, because the store listing on its own is not: SimplySign leaves
# certificates registered after a session ends, so a present certificate proves only that a session
# existed once. Costs about a second.

[CmdletBinding()]
param(
    [string] $Thumbprint = $env:CODESIGN_WIN_THUMBPRINT,
    [switch] $RequireSigning,
    [switch] $ProveSigning
)

$ErrorActionPreference = 'Stop'

# $IsWindows only exists on PowerShell Core; on Windows PowerShell 5.1 it is undefined and the
# edition is the tell.
$onWindows = if ($PSVersionTable.PSEdition -eq 'Core') { [bool]$IsWindows } else { $true }
if (-not $onWindows) {
    Write-Host 'FAIL: this script inspects the Windows certificate store and only runs on Windows.'
    exit 1
}

. "$PSScriptRoot/../lib/win-signing.ps1"

$failures = 0
function Add-Failure {
    param([string] $Message)
    Write-Host "FAIL: $Message"
    $script:failures++
}

$codeSigningOid = '1.3.6.1.5.5.7.3.3'

function Test-CodeSigningEku {
    param($Certificate)
    foreach ($extension in $Certificate.Extensions) {
        if ($extension -is [System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]) {
            foreach ($usage in $extension.EnhancedKeyUsages) {
                if ($usage.Value -eq $codeSigningOid) { return $true }
            }
        }
    }
    return $false
}

# ---------------------------------------------------------------------------------------------
# Host and identity. The account and session are the part people forget, and the part that makes
# an otherwise perfect setup produce "No certificates were found".
# ---------------------------------------------------------------------------------------------
Write-Host '--- host ---'
Write-Host "computer          : $env:COMPUTERNAME"
Write-Host "os                : $([System.Environment]::OSVersion.VersionString)"
Write-Host "powershell        : $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"
Write-Host "running as        : $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"
Write-Host "user interactive  : $([System.Environment]::UserInteractive)"
Write-Host "session id        : $((Get-Process -Id $PID).SessionId)"

if (-not [System.Environment]::UserInteractive) {
    Write-Host 'NOTE: this process is not interactive. A SimplySign PIN or login prompt raised here'
    Write-Host '      would be invisible and unanswerable - signtool would simply hang.'
}

# ---------------------------------------------------------------------------------------------
# The GitHub Actions runner. Reported rather than judged: what matters is whether its account
# matches the account SimplySign is connected as, and only a human knows the intended answer.
# ---------------------------------------------------------------------------------------------
Write-Host ''
Write-Host '--- github actions runner ---'
try {
    $runnerServices = @(Get-CimInstance -ClassName Win32_Service -Filter "Name LIKE 'actions.runner%'" -ErrorAction Stop)
    if ($runnerServices.Count -eq 0) {
        Write-Host 'no runner service registered (the runner may be started interactively, which is'
        Write-Host 'the arrangement signing needs)'
    }
    foreach ($service in $runnerServices) {
        Write-Host "service           : $($service.Name)"
        Write-Host "  state           : $($service.State)"
        Write-Host "  start mode      : $($service.StartMode)"
        Write-Host "  runs as         : $($service.StartName)"
        Write-Host '  NOTE: a runner running as a Windows service gets its own session, separate from'
        Write-Host '        the desktop session SimplySign Desktop runs in. If signing fails here but'
        Write-Host '        works when run by hand, this is why.'
    }
}
catch {
    Write-Host "could not query services: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------------------------
# SimplySign Desktop. Its session is what puts the certificate in the store, and it lasts about
# two hours.
# ---------------------------------------------------------------------------------------------
Write-Host ''
Write-Host '--- simplysign desktop ---'
$simplySign = @(Get-Process -Name 'SimplySignDesktop' -ErrorAction SilentlyContinue)
if ($simplySign.Count -eq 0) {
    Write-Host 'SimplySignDesktop is not running on this machine.'
}
else {
    foreach ($process in $simplySign) {
        $owner = 'unknown'
        try {
            $cimProcess = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction Stop
            $ownerInfo = Invoke-CimMethod -InputObject $cimProcess -MethodName GetOwner -ErrorAction Stop
            if ($ownerInfo.ReturnValue -eq 0) { $owner = "$($ownerInfo.Domain)\$($ownerInfo.User)" }
        }
        catch { }
        Write-Host "running           : pid $($process.Id), session $($process.SessionId), as $owner"
    }
    Write-Host 'NOTE: running is not the same as connected. A SimplySign session lasts about two'
    Write-Host '      hours; the certificate listing below is the real test.'
}

# ---------------------------------------------------------------------------------------------
# signtool.
# ---------------------------------------------------------------------------------------------
Write-Host ''
Write-Host '--- signtool ---'
$signtool = $null
try {
    $signtool = Get-BsiSigntoolPath
    Write-Host "path              : $signtool"
    $signtoolVersion = (Get-Item -LiteralPath $signtool).VersionInfo.ProductVersion
    Write-Host "version           : $signtoolVersion"
}
catch {
    Add-Failure $_.Exception.Message
}

# ---------------------------------------------------------------------------------------------
# Every code signing certificate this account can see. When a thumbprint goes stale after a
# renewal, this listing is where the new one comes from.
# ---------------------------------------------------------------------------------------------
Write-Host ''
Write-Host '--- code signing certificates visible to this account ---'
$seen = 0
foreach ($store in @('Cert:\CurrentUser\My', 'Cert:\LocalMachine\My')) {
    $certificates = @()
    try {
        $certificates = @(Get-ChildItem -Path $store -ErrorAction Stop | Where-Object { Test-CodeSigningEku $_ })
    }
    catch {
        Write-Host "$store : not readable ($($_.Exception.Message))"
        continue
    }

    Write-Host "$store : $($certificates.Count) code signing certificate(s)"
    foreach ($certificate in $certificates) {
        $seen++
        $daysLeft = [int][math]::Floor(($certificate.NotAfter - (Get-Date)).TotalDays)
        Write-Host "  subject         : $($certificate.Subject)"
        Write-Host "    issuer        : $($certificate.Issuer)"
        Write-Host "    thumbprint    : $($certificate.Thumbprint)"
        Write-Host "    valid         : $($certificate.NotBefore.ToString('yyyy-MM-dd')) .. $($certificate.NotAfter.ToString('yyyy-MM-dd')) ($daysLeft days left)"
        Write-Host "    private key   : $($certificate.HasPrivateKey)"
    }
}

if ($seen -eq 0) {
    Write-Host 'None. With a Certum cloud certificate this is what an expired SimplySign session looks'
    Write-Host 'like - the certificate is only in the store while the session is open.'
}

# ---------------------------------------------------------------------------------------------
# The configured thumbprint.
# ---------------------------------------------------------------------------------------------
Write-Host ''
Write-Host '--- configured signing certificate ---'
if ([string]::IsNullOrWhiteSpace($Thumbprint)) {
    # Not a failure even under -RequireSigning: see the note at the top of this file. Loud, though -
    # an accidentally deleted secret and a deliberate switch-off look identical from here, and the
    # accidental one is how releases start going out unsigned without anybody noticing.
    Write-Host 'No thumbprint configured (CODESIGN_WIN_THUMBPRINT is empty and -Thumbprint was not given).'
    Write-Host 'In a release build that is the deliberate kill switch: it ships an unsigned binary.'
    Write-Host '::warning title=Windows code signing is switched off::CODESIGN_WIN_THUMBPRINT is empty, so nothing will be signed. If that was not intended, check the WIN_CODESIGN_THUMBPRINT repository secret.'
}
else {
    $status = Test-BsiSigningCertificate -Thumbprint $Thumbprint
    Write-Host "thumbprint        : $($status.Thumbprint)"
    Write-Host "result            : $($status.Reason)"

    if ($status.Found) {
        Write-Host "store             : $($status.StorePath)"
        Write-Host "subject           : $($status.Subject)"
        Write-Host "issuer            : $($status.Issuer)"
        Write-Host "valid until       : $($status.NotAfter.ToString('yyyy-MM-dd')) ($($status.DaysRemaining) days left)"
        Write-Host "private key       : $($status.HasPrivateKey)"
    }

    if ($status.Usable) {
        # Deliberately not "this host can sign right now" - the store cannot tell us that. See the
        # note on -ProveSigning at the top of this file.
        Write-Host 'The certificate is registered and within its validity period.'

        # A renewal that lapses repeats the outage this whole change exists to undo, and 30 days is
        # enough warning to arrange one without hurrying.
        if ($status.DaysRemaining -le 30) {
            Write-Host "::warning title=Code signing certificate expires soon::The Windows code signing certificate expires in $($status.DaysRemaining) days ($($status.NotAfter.ToString('yyyy-MM-dd')))."
        }

        if ($ProveSigning) {
            Write-Host ''
            Write-Host '--- proving the signing session is live ---'
            try {
                Invoke-BsiProveSigning -Thumbprint $Thumbprint -Signtool $signtool
                Write-Host 'This host can sign right now.'
            }
            catch {
                Write-Host ''
                if ($_.Exception.Message -match 'timed out') {
                    # A different failure with a different fix, so keep its own wording.
                    Write-Host $_.Exception.Message
                }
                else {
                    # Registered but unusable is a *specific* diagnosis, not an ambiguous one, and
                    # saying so beats repeating the generic two-causes help: the store lookup
                    # directly above matched this exact thumbprint, so the thumbprint is not stale.
                    Write-Host 'The certificate is registered, but signing with it failed.'
                    Write-Host ''
                    Write-Host 'That combination has one cause. SimplySign leaves certificates registered'
                    Write-Host 'after a session ends, so the lookup above can pass while the private key is'
                    Write-Host 'unreachable in the cloud. The SimplySign session is not open. The thumbprint'
                    Write-Host 'is fine - it was just matched.'
                    Write-Host ''
                    Write-Host 'Fix: on this machine, open SimplySign Desktop, choose "Connect to SimplySign",'
                    Write-Host 'enter the token from the SimplySign mobile app, then run this again.'
                }
                Add-Failure 'the certificate is registered, but signing with it failed - the SimplySign session is not open.'
            }
        }
        else {
            Write-Host 'NOTE: not proven. Certificates stay registered after a SimplySign session ends,'
            Write-Host '      so this says a session existed, not that one is open. Pass -ProveSigning'
            Write-Host '      to actually sign a scratch file and find out.'
        }
    }
    elseif ($RequireSigning -or $ProveSigning) {
        # -ProveSigning counts here too: being unable to prove signing because there is no usable
        # certificate is a negative answer to the question, not an absence of one.
        Write-Host ''
        Write-Host (Get-BsiSimplySignHelp)
        Add-Failure "the configured certificate is not usable ($($status.Reason))."
    }
    else {
        Write-Host ''
        Write-Host (Get-BsiSimplySignHelp)
    }
}

# ---------------------------------------------------------------------------------------------
# The timestamp server. Reachability only - see the note in scripts/lib/win-signing.ps1 for why
# this URL is http and must stay that way.
# ---------------------------------------------------------------------------------------------
Write-Host ''
Write-Host '--- timestamp server ---'
try {
    $response = Invoke-WebRequest -Uri 'http://time.certum.pl' -Method Get -TimeoutSec 15 -UseBasicParsing
    Write-Host "http://time.certum.pl : reachable (HTTP $([int]$response.StatusCode))"
}
catch {
    # An RFC 3161 responder is entitled to refuse GET while happily answering the POST signtool
    # makes, so any HTTP answer at all counts as reachable. Only a connection failure is a finding.
    $webResponse = $null
    if ($_.Exception.PSObject.Properties.Name -contains 'Response') { $webResponse = $_.Exception.Response }

    if ($webResponse) {
        Write-Host "http://time.certum.pl : reachable (HTTP $([int]$webResponse.StatusCode) to a GET, which is fine - signtool POSTs)"
    }
    else {
        Add-Failure "http://time.certum.pl is unreachable: $($_.Exception.Message)"
        Write-Host 'Signing cannot complete without it. Check egress rules and any proxy on this host.'
        Write-Host 'Note the URL is http on purpose: time.certum.pl refuses connections on port 443.'
    }
}

Write-Host ''
if ($failures -eq 0) {
    Write-Host 'Windows signing setup looks healthy.'
    exit 0
}

Write-Host "$failures problem(s) found."
exit 1
