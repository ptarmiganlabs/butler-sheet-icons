# Shared Windows code signing helpers, dot-sourced by the release build, the insider build and the
# diagnostics under scripts/diag. The macOS side has the same arrangement in
# scripts/lib/macos-signing-keychain.sh, and for the same reason: signing logic that lives in one
# place cannot drift between the release path and the path that is supposed to be testing it.
#
# ---------------------------------------------------------------------------------------------
# How signing works here
#
# The certificate is a Certum cloud certificate. SimplySign Desktop runs on the win-code-sign
# runner and presents it to Windows as a virtual smart card through its Key Storage Provider, so
# the certificate turns up in Cert:\CurrentUser\My like any locally installed one and signtool
# selects it by thumbprint. There is no /csp, no /kc and no separate cloud signing tool - the
# invocation is the ordinary one, exactly as Certum's own manual documents it.
#
# That is worth stating plainly because the comments this replaces predicted the opposite: that a
# cloud service would need the invocation reworked. It does not.
#
# ---------------------------------------------------------------------------------------------
# The two-hour session
#
# What a cloud certificate *does* change is availability. A SimplySign session lasts about two
# hours, after which it needs a fresh token from the SimplySign mobile app. Nothing in CI can
# renew it. So the certificate is present in the store for two hours after a human logs in, and
# absent the rest of the time, and every caller here has to cope with that:
#
#   - Test-BsiSigningCertificate answers "can we sign right now?" without ever blocking.
#   - Invoke-BsiSigntool runs signtool under a hard timeout, because a dead session makes signtool
#     raise a *graphical* login prompt. On a runner nobody is watching - and in a service session
#     nobody can even see - that prompt waits forever. A killed process is recoverable; a job
#     wedged for six hours until the workflow timeout is not.
#
# ---------------------------------------------------------------------------------------------
# The timestamp URL
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

# Deliberately no Set-StrictMode here. Dot-sourcing runs this in the caller's scope, so a strict
# mode set here would silently change the semantics of every script that includes it - including
# their use of $LASTEXITCODE, which is undefined until the first native command runs.

$BsiTimestampUrl = 'http://time.certum.pl'
$BsiSignDescription = 'Butler Sheet Icons'
$BsiSignDescriptionUrl = 'https://butler-sheet-icons.ptarmiganlabs.com'

# Guidance printed whenever signing cannot proceed. Both likely causes, because they look identical
# from here - the certificate is simply not in the store either way - and the fix differs.
function Get-BsiSimplySignHelp {
    return @'
No usable code signing certificate is available on this machine. The two likely causes:

  1. The SimplySign session has expired. It lasts about two hours. Open SimplySign Desktop on the
     win-code-sign runner, choose "Connect to SimplySign", and enter the token from the SimplySign
     mobile app. Then re-run this job.

  2. The certificate was renewed and the WIN_CODESIGN_THUMBPRINT repository secret still holds the
     old thumbprint. Run scripts/diag/win-signing-check.ps1 on the runner to list the certificates
     actually present, and update the secret.

Note that signtool only sees certificates belonging to the Windows account it runs as. If the
GitHub Actions runner runs as a service, or as a different account than the one with SimplySign
Desktop connected, the certificate is invisible to it no matter how healthy the session is.
'@
}

# Locates signtool.exe.
#
# This used to be a hard-coded path to Windows SDK 10.0.22621.0. That pins the whole Windows build -
# not just signing - to one SDK version on one machine, because `signtool remove` runs whether or
# not we go on to sign. Installing a newer SDK, or removing the old one, broke the build.
function Get-BsiSigntoolPath {
    [CmdletBinding()]
    param()

    if (-not [string]::IsNullOrWhiteSpace($env:BSI_SIGNTOOL)) {
        if (-not (Test-Path -LiteralPath $env:BSI_SIGNTOOL -PathType Leaf)) {
            throw "BSI_SIGNTOOL is set to '$($env:BSI_SIGNTOOL)', but there is no file at that path."
        }
        return (Resolve-Path -LiteralPath $env:BSI_SIGNTOOL).Path
    }

    # Both program files roots, skipping any the machine does not define. ${env:ProgramFiles(x86)}
    # is absent on an arm64 host, and Join-Path throws on a null path rather than returning null.
    $roots = @()
    foreach ($base in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
        if ([string]::IsNullOrWhiteSpace($base)) { continue }
        $root = Join-Path -Path $base -ChildPath 'Windows Kits\10\bin'
        if (Test-Path -LiteralPath $root -PathType Container) { $roots += $root }
    }

    $candidates = [System.Collections.Generic.List[object]]::new()

    foreach ($root in $roots) {
        foreach ($dir in (Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue)) {
            $exe = Join-Path -Path $dir.FullName -ChildPath 'x64\signtool.exe'
            if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { continue }

            # SDK 8.x and some 10.x layouts put signtool straight under bin\x64 with no version
            # directory, so a name that is not a version is not an error - it just sorts last.
            $version = [version]'0.0.0.0'
            try { $version = [version]$dir.Name } catch { }

            $candidates.Add([pscustomobject]@{ Path = $exe; Version = $version })
        }

        $legacy = Join-Path -Path $root -ChildPath 'x64\signtool.exe'
        if (Test-Path -LiteralPath $legacy -PathType Leaf) {
            $candidates.Add([pscustomobject]@{ Path = $legacy; Version = [version]'0.0.0.0' })
        }
    }

    if ($candidates.Count -gt 0) {
        return ($candidates | Sort-Object -Property Version -Descending | Select-Object -First 1).Path
    }

    $onPath = Get-Command -Name 'signtool.exe' -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($onPath) { return $onPath.Source }

    throw @'
signtool.exe was not found. It ships with the Windows SDK; install the "Windows SDK Signing Tools
for Desktop Apps" component, or set BSI_SIGNTOOL to the full path of a signtool.exe to use.
Searched: %ProgramFiles(x86)%\Windows Kits\10\bin\*\x64, %ProgramFiles%\Windows Kits\10\bin\*\x64,
and PATH.
'@
}

# Answers whether a given thumbprint resolves to a certificate that can sign right now.
#
# Read-only and non-blocking by design: it inspects the certificate store and never asks signtool
# or the KSP for anything, so it cannot itself trigger the SimplySign login dialog. That is what
# makes it safe to run as a fast preflight before an expensive build.
function Test-BsiSigningCertificate {
    [CmdletBinding()]
    param(
        # AllowEmptyString so that "no certificate configured" is an answer this function can give,
        # rather than a parameter binding error the caller has to pre-empt.
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string] $Thumbprint,

        [string[]] $StorePath = @('Cert:\CurrentUser\My', 'Cert:\LocalMachine\My')
    )

    # Thumbprints get copied out of the Windows certificate dialog, which renders them in lowercase
    # with spaces between the bytes. Normalise rather than make the caller care.
    $wanted = ($Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()

    $result = [pscustomobject]@{
        Thumbprint    = $wanted
        Found         = $false
        Usable        = $false
        Reason        = 'NotFound'
        StorePath     = $null
        Subject       = $null
        Issuer        = $null
        NotBefore     = $null
        NotAfter      = $null
        HasPrivateKey = $false
        DaysRemaining = $null
        Certificate   = $null
    }

    if ([string]::IsNullOrWhiteSpace($wanted)) {
        $result.Reason = 'NoThumbprintConfigured'
        return $result
    }

    foreach ($store in $StorePath) {
        $cert = $null
        try {
            $cert = Get-ChildItem -Path $store -ErrorAction Stop |
                Where-Object { $_.Thumbprint -eq $wanted } |
                Select-Object -First 1
        }
        catch {
            # LocalMachine\My is readable without elevation, but a locked-down host can still deny
            # it. An unreadable store is not a finding - it just means look in the next one.
            continue
        }

        if (-not $cert) { continue }

        $now = Get-Date
        $result.Found = $true
        $result.StorePath = $store
        $result.Subject = $cert.Subject
        $result.Issuer = $cert.Issuer
        $result.NotBefore = $cert.NotBefore
        $result.NotAfter = $cert.NotAfter
        $result.HasPrivateKey = $cert.HasPrivateKey
        $result.DaysRemaining = [int][math]::Floor(($cert.NotAfter - $now).TotalDays)
        $result.Certificate = $cert

        if ($now -lt $cert.NotBefore) { $result.Reason = 'NotYetValid' }
        elseif ($now -gt $cert.NotAfter) { $result.Reason = 'Expired' }
        elseif (-not $cert.HasPrivateKey) { $result.Reason = 'NoPrivateKey' }
        else {
            $result.Reason = 'Ok'
            $result.Usable = $true
        }

        break
    }

    return $result
}

# Quotes one argument for a Windows command line.
#
# Start-Process takes a single argument *string* and hands it to CreateProcess unchanged, so the
# quoting is ours to get right. The rule is the awkward one every Windows runtime implements:
# backslashes are literal, except in a run immediately before a quote, where each one has to be
# doubled and the quote escaped. Without that, a path such as `C:\a b\x.exe` loses characters.
function ConvertTo-BsiCommandLineArgument {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string] $Value
    )

    if ($Value -eq '') { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }

    # Double any backslash run that precedes a quote, and escape the quote itself.
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    # Do the same for a backslash run at the very end, which would otherwise escape our closing quote.
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')

    return '"' + $escaped + '"'
}

# Turns a path into an absolute one, and fails if it names nothing.
#
# Every path handed to signtool goes through here, because Start-Process resolves relative paths
# against the *process* working directory rather than PowerShell's $PWD. The two normally agree, and
# then quietly stop agreeing after a Set-Location somewhere up the call chain - at which point
# `./butler-sheet-icons.exe` starts meaning a different file, or no file. Resolving up front also
# makes the logged command line say exactly which file was signed.
function Resolve-BsiPath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "File not found: '$Path' (resolved from working directory '$($PWD.Path)')."
    }

    return (Resolve-Path -LiteralPath $Path).Path
}

# Runs signtool under a hard timeout and returns its exit code and output rather than throwing.
#
# The timeout is the whole point. See the header: a lapsed SimplySign session turns signtool into a
# process waiting on a dialog box that nothing will ever click.
function Invoke-BsiSigntool {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Signtool,

        [Parameter(Mandatory = $true)]
        [string[]] $Arguments,

        [int] $TimeoutSeconds = 0
    )

    if ($TimeoutSeconds -le 0) {
        $TimeoutSeconds = 180
        if (-not [string]::IsNullOrWhiteSpace($env:BSI_SIGN_TIMEOUT_SECONDS)) {
            try {
                $configured = [int]$env:BSI_SIGN_TIMEOUT_SECONDS
                if ($configured -gt 0) { $TimeoutSeconds = $configured }
            }
            catch { }
        }
    }

    $argumentString = ($Arguments | ForEach-Object { ConvertTo-BsiCommandLineArgument -Value $_ }) -join ' '

    $outFile = [System.IO.Path]::GetTempFileName()
    $errFile = [System.IO.Path]::GetTempFileName()

    try {
        Write-Host "  signtool $argumentString"

        $proc = Start-Process -FilePath $Signtool -ArgumentList $argumentString -NoNewWindow -PassThru `
            -RedirectStandardOutput $outFile -RedirectStandardError $errFile

        # Touching Handle caches the process handle while the process is still alive. Without it,
        # Windows PowerShell can report a null ExitCode after the process has exited, because the
        # handle it needed to read the code was already released.
        $null = $proc.Handle

        $timedOut = $false
        if ($proc.WaitForExit($TimeoutSeconds * 1000)) {
            # The parameterless overload returns immediately once the process is gone, and
            # guarantees the exit code is populated.
            $proc.WaitForExit()
        }
        else {
            $timedOut = $true
            try { $proc.Kill() } catch { }
            [void]$proc.WaitForExit(5000)
        }

        $exitCode = -1
        if (-not $timedOut) { $exitCode = $proc.ExitCode }

        $stdout = (Get-Content -LiteralPath $outFile -Raw -ErrorAction SilentlyContinue)
        $stderr = (Get-Content -LiteralPath $errFile -Raw -ErrorAction SilentlyContinue)

        if ($stdout) { Write-Host $stdout.TrimEnd() }
        if ($stderr) { Write-Host $stderr.TrimEnd() }

        return [pscustomobject]@{
            ExitCode = $exitCode
            StdOut   = [string]$stdout
            StdErr   = [string]$stderr
            Output   = ([string]$stdout + "`n" + [string]$stderr)
            TimedOut = $timedOut
        }
    }
    finally {
        Remove-Item -LiteralPath $outFile, $errFile -Force -ErrorAction SilentlyContinue
    }
}

# Strips an existing Authenticode signature.
#
# Not optional, and not part of signing: postject rewrites the binary afterwards, which invalidates
# any signature already on it. Shipping a binary carrying a broken signature is worse than shipping
# an unsigned one - Windows reports it as corrupt or tampered with, which alarms users and antivirus
# far more than no signature at all.
function Invoke-BsiStripSignature {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path,

        [string] $Signtool
    )

    if ([string]::IsNullOrWhiteSpace($Signtool)) { $Signtool = Get-BsiSigntoolPath }

    $Path = Resolve-BsiPath -Path $Path

    $result = Invoke-BsiSigntool -Signtool $Signtool -Arguments @('remove', '/s', $Path)
    if ($result.TimedOut) {
        throw "signtool remove timed out on '$Path'."
    }
    if ($result.ExitCode -ne 0) {
        throw "signtool remove failed with exit code $($result.ExitCode) on '$Path'."
    }
}

# Proves a signing session is alive by actually signing something, and cleans up after itself.
#
# Necessary because looking in the certificate store is not a reliable test. SimplySign Desktop
# leaves certificates registered after a session ends unless "Unregister certificates after
# disconnecting" is ticked - and even then it is unclear whether a session *timeout* counts as
# disconnecting. So a certificate being present says only that a session existed at some point,
# which is exactly the wrong thing to build a fail-fast check on.
#
# The only question that matters is "can this host sign right now", and the only honest way to ask
# it is to sign. A few kilobytes of scratch file makes that cost about a second.
function Invoke-BsiProveSigning {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Thumbprint,

        [string] $Signtool
    )

    if ([string]::IsNullOrWhiteSpace($Signtool)) { $Signtool = Get-BsiSigntoolPath }

    # signtool signs PE files, not arbitrary bytes, so the scratch file has to be a real executable.
    # These are the smallest things guaranteed to be on any Windows install; node.exe works too but
    # is 80 MB, and hashing that is the bulk of the time.
    $source = $null
    foreach ($candidate in @('hostname.exe', 'whoami.exe', 'where.exe')) {
        $path = Join-Path -Path ([System.Environment]::SystemDirectory) -ChildPath $candidate
        if (Test-Path -LiteralPath $path -PathType Leaf) { $source = $path; break }
    }

    if (-not $source) {
        $node = Get-Command -Name 'node.exe' -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($node) { $source = $node.Source }
    }

    if (-not $source) {
        throw 'Cannot prove signing: no scratch executable found to sign.'
    }

    $scratchRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
    $scratch = Join-Path -Path $scratchRoot -ChildPath "bsi-signing-proof-$([System.Guid]::NewGuid().ToString('N').Substring(0, 8))"

    try {
        New-Item -ItemType Directory -Path $scratch -Force | Out-Null
        $target = Join-Path -Path $scratch -ChildPath 'proof.exe'
        Copy-Item -LiteralPath $source -Destination $target -Force

        Write-Host "Proving the signing session by signing a scratch copy of $(Split-Path -Leaf $source)."
        Invoke-BsiSignFile -Path $target -Thumbprint $Thumbprint | Out-Null
    }
    finally {
        if (Test-Path -LiteralPath $scratch) {
            Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

# Signs a file and verifies the result, throwing if either step fails.
#
# One SHA-256 signature, not the SHA-1 + SHA-256 pair this replaces. That pair never worked as
# intended: the second `signtool sign` was missing /as, so instead of appending a second signature
# it replaced the first, and the SHA-1 pass was two seconds of cloud round-trip producing a
# signature that was then thrown away. Restoring it correctly would be worse, not better - Windows
# has distrusted SHA-1 Authenticode since 2016, so the only thing a real dual signature would add
# is a signature nothing trusts.
function Invoke-BsiSignFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path,

        [Parameter(Mandatory = $true)]
        [string] $Thumbprint,

        [string] $Signtool,

        [int] $TimestampAttempts = 3
    )

    if ([string]::IsNullOrWhiteSpace($Signtool)) { $Signtool = Get-BsiSigntoolPath }

    $Path = Resolve-BsiPath -Path $Path

    $signArguments = @(
        'sign'
        '/sha1', $Thumbprint
        '/fd', 'sha256'
        '/tr', $BsiTimestampUrl
        '/td', 'sha256'
        '/d', $BsiSignDescription
        '/du', $BsiSignDescriptionUrl
        '/v'
        $Path
    )

    for ($attempt = 1; $attempt -le $TimestampAttempts; $attempt++) {
        $result = Invoke-BsiSigntool -Signtool $Signtool -Arguments $signArguments

        if (-not $result.TimedOut -and $result.ExitCode -eq 0) { break }

        if ($result.TimedOut) {
            throw @"
signtool timed out while signing '$Path' and was killed.

That almost always means it was waiting on a graphical SimplySign login or PIN prompt that nothing
on a build runner will ever answer.

$(Get-BsiSimplySignHelp)
"@
        }

        # Only a timestamping failure is worth another go - a public TSA refusing one request will
        # usually take the next. Everything else (missing certificate, bad thumbprint, unreadable
        # file) fails identically on every attempt, so retrying just delays the report.
        $isTimestampFailure = $result.Output -match 'timestamp'

        if (-not $isTimestampFailure -or $attempt -eq $TimestampAttempts) {
            $hint = if ($isTimestampFailure) {
                "The timestamp server $BsiTimestampUrl did not answer after $TimestampAttempts attempts."
            }
            else {
                Get-BsiSimplySignHelp
            }

            throw @"
signtool sign failed with exit code $($result.ExitCode) on '$Path'.

$hint
"@
        }

        Write-Host "Timestamping failed on attempt $attempt of $TimestampAttempts; retrying in 15 seconds."
        Start-Sleep -Seconds 15
    }

    # Fail loudly rather than shipping something that only looks signed.
    $verify = Invoke-BsiSigntool -Signtool $Signtool -Arguments @('verify', '/pa', '/v', $Path)
    if ($verify.TimedOut -or $verify.ExitCode -ne 0) {
        throw "signtool verify failed with exit code $($verify.ExitCode) - '$Path' is not correctly signed."
    }

    return $verify.Output
}
