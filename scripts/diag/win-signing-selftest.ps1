# Checks the parts of scripts/lib/win-signing.ps1 that can be checked without a certificate.
#
# Same contract as the other scripts in here: it changes nothing and exits 0 when healthy, 1 when
# not. Unlike the others it never touches the certificate store, signtool or the network, so it runs
# on any operating system - which is the point. It is wired into pr-unit-tests.yaml on both the
# Linux and the Windows leg.
#
# Two things are covered, and they are the two that can break silently:
#
#   1. Get-BsiSigntoolFailureKind, which decides whether a failed signtool run means "the SimplySign
#      session has lapsed" - unsigned insider build, green - or something else, which fails the
#      build. It is a pure function, so recorded signtool output is a complete test of it.
#
#   2. New-BsiSignArgumentList, against the argument array as it was written inline before it was
#      extracted. A refactor that quietly drops /fd or /tr would still produce a signed-looking
#      binary in the one case anybody checks, and this repository has already lost a release to a
#      timestamp flag nobody was exercising.
#
# Usage:
#   pwsh -File scripts/diag/win-signing-selftest.ps1        # any OS with PowerShell 7
#   powershell -File scripts/diag/win-signing-selftest.ps1  # Windows PowerShell 5.1
#
# Unlike its neighbours this one is not tied to the signing runner, so pwsh is a fair default. On
# the win-code-sign runner itself use powershell - there is no PowerShell 7 installed there.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot/../lib/win-signing.ps1"

$failures = 0
function Add-Failure {
    param([string] $Message)
    Write-Host "FAIL: $Message"
    $script:failures++
}

# ---------------------------------------------------------------------------------------------
# Get-BsiSigntoolFailureKind, against recorded signtool output.
#
# ReasonMatch is a regex rather than an equality check: the reason strings for named HRESULTs carry
# a human explanation that is meant to be editable without breaking this file.
# ---------------------------------------------------------------------------------------------
Write-Host '--- signtool failure classification ---'

$cases = @(
    [pscustomobject]@{
        Name        = 'a live session signs'
        TimedOut    = $false
        ExitCode    = 0
        Output      = "Successfully signed: probe.exe`n"
        Kind        = 'Ok'
        ReasonMatch = '^Ok$'
    }
    [pscustomobject]@{
        Name        = 'signed with warnings still means the key answered'
        TimedOut    = $false
        ExitCode    = 2
        Output      = "Successfully signed: probe.exe`nNumber of warnings: 1`n"
        Kind        = 'Ok'
        ReasonMatch = '^OkWithWarnings$'
    }
    [pscustomobject]@{
        # The dominant symptom: signtool waiting on a login dialog and killed by our own timeout.
        # ExitCode -1 is the sentinel Invoke-BsiSigntool uses for that, not a signtool code.
        Name        = 'killed while waiting on the SimplySign login dialog'
        TimedOut    = $true
        ExitCode    = -1
        Output      = ''
        Kind        = 'Timeout'
        ReasonMatch = '^TimedOut$'
    }
    [pscustomobject]@{
        Name        = 'the canonical unreachable cloud key'
        TimedOut    = $false
        ExitCode    = 1
        Output      = "SignTool Error: An unexpected internal error has occurred.`nError information: `"Error: SignerSign() failed.`" (-2146893802/0x80090016)`n"
        Kind        = 'SessionUnavailable'
        ReasonMatch = 'NTE_BAD_KEYSET'
    }
    [pscustomobject]@{
        # Verbatim from insiders-build run 31771706108 on the win-code-sign runner, with SimplySign
        # disconnected: signtool 10.0.22621.2428, exit 1, no HRESULT anywhere in the output. Note
        # "met", not "meet" - matching the sentence everyone quotes instead of the one signtool
        # prints is what turned that run red.
        Name        = 'a disconnected SimplySign session, as observed on the runner'
        TimedOut    = $false
        ExitCode    = 1
        Output      = "SignTool Error: No certificates were found that met all the given criteria.`n"
        Kind        = 'SessionUnavailable'
        ReasonMatch = '^CertificateNotVisibleToSigntool$'
    }
    [pscustomobject]@{
        Name        = 'the same message in the tense the documentation uses'
        TimedOut    = $false
        ExitCode    = 1
        Output      = "SignTool Error: No certificates were found that meet all the given criteria.`n"
        Kind        = 'SessionUnavailable'
        ReasonMatch = '^CertificateNotVisibleToSigntool$'
    }
    [pscustomobject]@{
        Name        = 'the virtual smart card went away'
        TimedOut    = $false
        ExitCode    = 1
        Output      = "SignTool Error: SignerSign() failed. (0x80100069)`n"
        Kind        = 'SessionUnavailable'
        ReasonMatch = 'SCARD_W_REMOVED_CARD'
    }
    [pscustomobject]@{
        # -match is case-insensitive, so the lowercase hex table has to match signtool's uppercase.
        Name        = 'uppercase hex matches the lowercase table'
        TimedOut    = $false
        ExitCode    = 1
        Output      = "SignTool Error: SignerSign() failed. (0x80090022)`n"
        Kind        = 'SessionUnavailable'
        ReasonMatch = 'NTE_SILENT_CONTEXT'
    }
    [pscustomobject]@{
        # Coverage does not depend on the named table being complete - this is the net under it.
        Name        = 'an unnamed CNG error still reads as a key problem'
        TimedOut    = $false
        ExitCode    = 1
        Output      = "SignTool Error: SignerSign() failed. (0x80090020)`n"
        Kind        = 'SessionUnavailable'
        ReasonMatch = '^CngOrSmartCardError$'
    }
    [pscustomobject]@{
        # THE LOAD-BEARING CASE. A broken timestamp URL must never be mistaken for a lapsed session:
        # if the probe tolerated it, the insider build would go green and unsigned and stop being
        # the thing that catches a broken timestamp URL - which is the only reason it signs at all.
        Name        = 'a timestamp failure is NOT a session symptom'
        TimedOut    = $false
        ExitCode    = 1
        Output      = "SignTool Error: The specified timestamp server either could not be reached or returned an invalid response.`n"
        Kind        = 'Unknown'
        ReasonMatch = '^UnrecognisedFailure$'
    }
    [pscustomobject]@{
        Name        = 'a broken invocation is NOT a session symptom'
        TimedOut    = $false
        ExitCode    = 1
        Output      = "SignTool Error: Invalid option: /fd`n"
        Kind        = 'Unknown'
        ReasonMatch = '^UnrecognisedFailure$'
    }
    [pscustomobject]@{
        Name        = 'a silent non-zero exit is reported as such'
        TimedOut    = $false
        ExitCode    = 1
        Output      = ''
        Kind        = 'Unknown'
        ReasonMatch = '^NoOutput$'
    }
)

foreach ($case in $cases) {
    $verdict = Get-BsiSigntoolFailureKind -TimedOut $case.TimedOut -ExitCode $case.ExitCode -Output $case.Output

    if ($verdict.Kind -ne $case.Kind) {
        Add-Failure "$($case.Name): expected Kind '$($case.Kind)', got '$($verdict.Kind)' (Reason '$($verdict.Reason)')."
        continue
    }

    if ($verdict.Reason -notmatch $case.ReasonMatch) {
        Add-Failure "$($case.Name): Kind '$($verdict.Kind)' is right but Reason '$($verdict.Reason)' does not match /$($case.ReasonMatch)/."
        continue
    }

    Write-Host "ok   $($case.Name) -> $($verdict.Kind)"
}

# A timeout must not carry a Detail: the output buffer of a killed process is arbitrary.
$timeoutVerdict = Get-BsiSigntoolFailureKind -TimedOut $true -ExitCode -1 -Output 'partial gibberish 0x80090016'
if ($null -ne $timeoutVerdict.Detail) {
    Add-Failure "a timed-out run should carry no Detail, got '$($timeoutVerdict.Detail)'."
}
else {
    Write-Host 'ok   a timed-out run quotes no signtool output'
}

# ---------------------------------------------------------------------------------------------
# New-BsiSignArgumentList, against the array it replaced.
# ---------------------------------------------------------------------------------------------
Write-Host ''
Write-Host '--- signtool argument list ---'

# Transcribed from the inline array in Invoke-BsiSignFile as it stood before it was extracted. It is
# spelled out rather than derived so that a change to the builder cannot change both sides at once.
$expected = @(
    'sign'
    '/sha1', 'DEADBEEF'
    '/fd', 'sha256'
    '/tr', 'http://time.certum.pl'
    '/td', 'sha256'
    '/d', 'Butler Sheet Icons'
    '/du', 'https://butler-sheet-icons.ptarmiganlabs.com'
    '/v'
    'C:\build\butler-sheet-icons.exe'
)

$actual = New-BsiSignArgumentList -Path 'C:\build\butler-sheet-icons.exe' -Thumbprint 'DEADBEEF'

if (@(Compare-Object -ReferenceObject $expected -DifferenceObject $actual -SyncWindow 0).Count -ne 0) {
    Add-Failure "the sign argument list has drifted. Expected: $($expected -join ' ') / got: $($actual -join ' ')"
}
else {
    Write-Host "ok   the real sign still passes $($actual.Count) arguments, unchanged"
}

# A nested array here would be one Object[] element where four strings should be, and would reach
# the command line as garbage. Commas instead of newlines in the builder's array literal do exactly
# that, silently, which is why this is checked rather than assumed.
$nested = @($actual | Where-Object { $_ -isnot [string] })
if ($nested.Count -ne 0) {
    Add-Failure "the sign argument list contains $($nested.Count) non-string element(s) - the array literal has been flattened wrongly."
}
else {
    Write-Host 'ok   every argument is a flat string'
}

$probeArguments = New-BsiSignArgumentList -Path 'C:\build\probe.exe' -Thumbprint 'DEADBEEF' -NoTimestamp

foreach ($flag in @('/tr', '/td', 'http://time.certum.pl')) {
    if ($probeArguments -contains $flag) {
        Add-Failure "the probe would send '$flag' to signtool. It must not timestamp - see New-BsiSignArgumentList."
    }
}

if (($actual.Count - $probeArguments.Count) -ne 4) {
    Add-Failure "-NoTimestamp should drop exactly the four timestamp arguments, but changed the count by $($actual.Count - $probeArguments.Count)."
}
else {
    Write-Host 'ok   -NoTimestamp drops the four timestamp arguments and nothing else'
}

Write-Host ''
if ($failures -eq 0) {
    Write-Host 'The Windows signing library behaves as expected.'
    exit 0
}

Write-Host "$failures problem(s) found."
exit 1
