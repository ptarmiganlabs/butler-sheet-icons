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
#   - Test-BsiSigningCertificate answers "is a certificate registered?" without ever blocking.
#   - Test-BsiSigningSession answers the question that actually matters, "can this host sign right
#     now?", by signing a scratch file. It has to exist because the store cannot answer it:
#     SimplySign leaves the certificate registered after a session ends and HasPrivateKey stays
#     true, so a store lookup says yes on a host that cannot sign at all. It never throws, and it
#     gets its own deadline through BSI_PROBE_TIMEOUT_SECONDS.
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

# What "the SimplySign session is not open" looks like coming out of signtool.
#
# Used only by Get-BsiSigntoolFailureKind, which is used only by the insider build's probe. Coverage
# does not rest on this list being complete - the classifier falls back to the whole 0x8009xxxx
# (CNG) and 0x8010xxxx (smart card) families. What the list buys is a log line that names the cause
# instead of printing a bare number.
#
# Matched as hex because signtool prints both forms - `(-2146893802/0x80090016)` - and the hex is
# the stable one. -match is case-insensitive, so an uppercase 0x8009002E matches these too.
$BsiSessionHresult = [ordered]@{
    '0x80090016' = 'NTE_BAD_KEYSET - the keyset does not exist'
    '0x8009000d' = 'NTE_NO_KEY - the key does not exist'
    '0x8009000b' = 'NTE_BAD_KEY_STATE - the key is not valid for use in this state'
    '0x8009001d' = 'NTE_PROVIDER_DLL_FAIL - the key storage provider failed to initialise'
    '0x8009001e' = 'NTE_PROV_DLL_NOT_FOUND - the key storage provider is not installed'
    '0x80090022' = 'NTE_SILENT_CONTEXT - the key wants a prompt and signtool asked silently'
    '0x80090036' = 'NTE_USER_CANCELLED - the login or PIN prompt was dismissed'
    '0x80092004' = 'CRYPT_E_NOT_FOUND - the certificate is no longer visible to signtool'
    '0x800706ba' = 'RPC_S_SERVER_UNAVAILABLE - SimplySign Desktop is not answering'
    '0x8010002e' = 'SCARD_E_NO_READERS_AVAILABLE - SimplySign is not presenting its virtual reader'
    '0x80100069' = 'SCARD_W_REMOVED_CARD - the virtual card went away mid-operation'
    '0x8010000c' = 'SCARD_E_NO_SMARTCARD - no virtual card present'
    '0x8010001d' = 'SCARD_E_NO_SERVICE - the Smart Card service is not running'
    '0x8010001e' = 'SCARD_E_SERVICE_STOPPED - the Smart Card service stopped'
}

# The same symptoms as words, for the signtool builds that print a message and no code.
#
# `SignerSign() failed` is deliberately absent: it is signtool's generic wrapper for every signing
# failure, so matching it would classify a broken invocation as an expired session. The HRESULT it
# carries is what carries the information.
$BsiSessionText = [ordered]@{
    'No certificates were found that meet all the given criteria' = 'CertificateNotVisibleToSigntool'
    'Keyset does not exist'                                       = 'KeysetDoesNotExist'
    'Key not valid for use in specified state'                    = 'BadKeyState'
    'provider DLL failed to initialize'                           = 'ProviderInitFailed'
    'smart ?card'                                                 = 'SmartCardError'
    'The RPC server is unavailable'                               = 'SimplySignNotAnswering'
}

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

# Builds the signtool `sign` argument array.
#
# Pulled out of Invoke-BsiSignFile so that the live-session probe and the real sign cannot drift
# apart. The probe asks "is the key reachable", and the only honest way to ask is with the same
# invocation the real sign uses.
#
# The array literal below is newline-separated on purpose and must stay that way. Commas would make
# $timestampArguments a *nested* array - one Object[] element where four strings should be - and
# ConvertTo-BsiCommandLineArgument would render it as garbage on the command line. Newlines make
# each line its own statement, which @() enumerates and flattens.
function New-BsiSignArgumentList {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path,

        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string] $Thumbprint,

        # Omits /tr and /td. Only the probe passes this. A timestamp server that is down, or a
        # timestamp URL that has been broken, must not be able to make the probe answer "no key" -
        # because the real sign that follows is what has to keep catching exactly that, and it is
        # the entire reason an insider build signs anything at all.
        [switch] $NoTimestamp
    )

    $timestampArguments = if ($NoTimestamp) { @() } else { @('/tr', $BsiTimestampUrl, '/td', 'sha256') }

    return @(
        'sign'
        '/sha1', $Thumbprint
        '/fd', 'sha256'
        $timestampArguments
        '/d', $BsiSignDescription
        '/du', $BsiSignDescriptionUrl
        '/v'
        $Path
    )
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

# Puts a small, real executable somewhere disposable, for signing as a test.
#
# signtool signs PE files, not arbitrary bytes, so a test sign needs a genuine executable. These are
# the smallest things guaranteed to be on any Windows install; node.exe works too but is 80 MB, and
# hashing that would be the bulk of the time.
function New-BsiScratchExecutable {
    [CmdletBinding()]
    param(
        [string] $Prefix = 'bsi-signing-scratch',

        [string] $FileName = 'scratch.exe'
    )

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
    $directory = Join-Path -Path $scratchRoot -ChildPath "$Prefix-$([System.Guid]::NewGuid().ToString('N').Substring(0, 8))"

    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $target = Join-Path -Path $directory -ChildPath $FileName
    Copy-Item -LiteralPath $source -Destination $target -Force

    return [pscustomobject]@{
        Source    = $source
        Directory = $directory
        Path      = $target
    }
}

# Pairs with New-BsiScratchExecutable.
#
# Tolerates $null and swallows its own errors because it is called from a finally block, where a
# throw would replace whatever the caller was already reporting with a cleanup failure.
function Remove-BsiScratchExecutable {
    [CmdletBinding()]
    param(
        $Scratch
    )

    if (-not $Scratch) { return }
    if (Test-Path -LiteralPath $Scratch.Directory) {
        Remove-Item -LiteralPath $Scratch.Directory -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# The whole line a pattern matched on, so an annotation can quote signtool verbatim.
function Get-BsiMatchingLine {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [AllowEmptyString()]
        [string] $Text,

        [Parameter(Mandatory = $true)]
        [string] $Pattern
    )

    foreach ($line in ([string]$Text -split "`r?`n")) {
        if ($line -match $Pattern) { return $line.Trim() }
    }

    return $null
}

# Decides what one signtool run means: did it work, is the SimplySign session dead, or is this
# something else entirely.
#
# A pure function of its three arguments - no certificate store, no file system, no clock - so the
# whole rule set can be exercised from a table of recorded signtool output on any machine, including
# a developer's Mac. scripts/diag/win-signing-selftest.ps1 does exactly that.
#
# Used only by Test-BsiSigningSession. Invoke-BsiSignFile deliberately does not consult it: the real
# sign stays as strict as it has always been, and that is what keeps a broken invocation fatal.
function Get-BsiSigntoolFailureKind {
    [CmdletBinding()]
    param(
        [bool] $TimedOut,

        [int] $ExitCode,

        [AllowNull()]
        [AllowEmptyString()]
        [string] $Output
    )

    $text = [string]$Output

    $result = [pscustomobject]@{
        Kind     = 'Unknown'
        Reason   = 'UnrecognisedFailure'
        ExitCode = $ExitCode
        TimedOut = $TimedOut
        Detail   = $null
    }

    # First, and before ExitCode is looked at: Invoke-BsiSigntool reports -1 on a timeout. That is a
    # sentinel of ours, not a signtool exit code, and it must never reach the tables below. Detail
    # stays $null too - a killed process's output buffer is arbitrary and not worth quoting.
    if ($TimedOut) {
        $result.Kind = 'Timeout'
        $result.Reason = 'TimedOut'
        return $result
    }

    # 0 is success. 2 is signtool's documented "succeeded with warnings", and for the one question
    # being asked here - did the key answer - a warning is a yes.
    if ($ExitCode -eq 0 -or $ExitCode -eq 2) {
        $result.Kind = 'Ok'
        $result.Reason = if ($ExitCode -eq 0) { 'Ok' } else { 'OkWithWarnings' }
        return $result
    }

    foreach ($code in $BsiSessionHresult.Keys) {
        $pattern = [regex]::Escape($code)
        if ($text -match $pattern) {
            $result.Kind = 'SessionUnavailable'
            $result.Reason = $BsiSessionHresult[$code]
            $result.Detail = Get-BsiMatchingLine -Text $text -Pattern $pattern
            return $result
        }
    }

    foreach ($pattern in $BsiSessionText.Keys) {
        if ($text -match $pattern) {
            $result.Kind = 'SessionUnavailable'
            $result.Reason = $BsiSessionText[$pattern]
            $result.Detail = Get-BsiMatchingLine -Text $text -Pattern $pattern
            return $result
        }
    }

    # Any other CNG (0x8009xxxx) or smart card (0x8010xxxx) error. This is where the coverage
    # actually comes from, and it is a fair inference rather than a shrug: by the time the probe
    # runs, everything else is pinned. The file was created milliseconds earlier by us, the
    # thumbprint was matched in the store immediately before, and there is no timestamp server in
    # the invocation. The only two unknowns left are whether signtool can see the certificate and
    # whether the provider can reach the key - so a cryptographic-family error we do not have by
    # name is still one of those two, and folding it in keeps the unrecognised bucket for things
    # that are genuinely surprising.
    $family = '0x8009[0-9a-f]{4}|0x8010[0-9a-f]{4}'
    if ($text -match $family) {
        $result.Kind = 'SessionUnavailable'
        $result.Reason = 'CngOrSmartCardError'
        $result.Detail = Get-BsiMatchingLine -Text $text -Pattern $family
        return $result
    }

    # Non-zero and silent. Worth its own reason because it is a distinctive signature - signtool
    # that crashed or never really started says nothing at all - and the annotation should say so
    # rather than quoting an empty string.
    if ([string]::IsNullOrWhiteSpace($text)) {
        $result.Reason = 'NoOutput'
    }

    return $result
}

# Answers "can this host sign right now" by using the key, without throwing and without blocking
# for long.
#
# The companion to Test-BsiSigningCertificate, not a replacement for it. That one is a store lookup:
# free, read-only, and unable to answer this question, because SimplySign leaves the certificate
# registered after its two-hour session ends and HasPrivateKey stays true. So the cheap check passes
# on a host that cannot sign at all, which is why the insider build ran both.
#
# Three deliberate choices:
#
#   - It signs through signtool rather than calling GetRSAPrivateKey().SignData() in process. An
#     in-process CNG call cannot be timed out: if the provider raises its login dialog, the
#     PowerShell process itself is wedged and only the job timeout ends it. An out-of-process
#     signtool can be killed, and Invoke-BsiSigntool kills it.
#
#   - It signs without a timestamp. See New-BsiSignArgumentList -NoTimestamp.
#
#   - It gets a shorter deadline than the real sign, and its own knob for it. A live-session sign of
#     a few kilobytes takes a second or two, so 60 seconds is generous - and on most pushes to main
#     the session will be dead, which makes this the cost paid by the common case. Raising the real
#     sign's deadline must not quietly raise this one.
function Test-BsiSigningSession {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string] $Thumbprint,

        [string] $Signtool,

        [int] $TimeoutSeconds = 0
    )

    if ($TimeoutSeconds -le 0) {
        $TimeoutSeconds = 60
        if (-not [string]::IsNullOrWhiteSpace($env:BSI_PROBE_TIMEOUT_SECONDS)) {
            try {
                $configured = [int]$env:BSI_PROBE_TIMEOUT_SECONDS
                if ($configured -gt 0) { $TimeoutSeconds = $configured }
            }
            catch { }
        }
    }

    $result = [pscustomobject]@{
        Live           = $false
        Kind           = 'ProbeError'
        Reason         = 'NotRun'
        ExitCode       = $null
        TimedOut       = $false
        Detail         = $null
        Output         = ''
        TimeoutSeconds = $TimeoutSeconds
        Elapsed        = [timespan]::Zero
    }

    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $scratch = $null

    try {
        if ([string]::IsNullOrWhiteSpace($Signtool)) { $Signtool = Get-BsiSigntoolPath }

        $scratch = New-BsiScratchExecutable -Prefix 'bsi-signing-probe' -FileName 'probe.exe'

        Write-Host "Probing the signing session: signing a scratch copy of $(Split-Path -Leaf $scratch.Source), no timestamp, $TimeoutSeconds second limit."

        $arguments = New-BsiSignArgumentList -Path $scratch.Path -Thumbprint $Thumbprint -NoTimestamp
        $run = Invoke-BsiSigntool -Signtool $Signtool -Arguments $arguments -TimeoutSeconds $TimeoutSeconds

        $verdict = Get-BsiSigntoolFailureKind -TimedOut $run.TimedOut -ExitCode $run.ExitCode -Output $run.Output

        $result.Live = ($verdict.Kind -eq 'Ok')
        $result.Kind = $verdict.Kind
        $result.Reason = $verdict.Reason
        $result.ExitCode = $run.ExitCode
        $result.TimedOut = $run.TimedOut
        $result.Detail = $verdict.Detail
        $result.Output = $run.Output
    }
    catch {
        # Catches everything and rethrows nothing, on purpose. This library is dot-sourced, so it
        # runs under the caller's $ErrorActionPreference - and the insider build's is 'Stop', which
        # turns every non-terminating error in here into a terminating one. A probe that can throw
        # is a probe that fails the build it exists to keep green.
        #
        # ProbeError is not evidence about the signing session. It means the probe could not be
        # carried out at all: no signtool, no scratch executable, a full temp directory.
        $result.Live = $false
        $result.Kind = 'ProbeError'
        $result.Reason = 'ProbeError'
        $result.Detail = $_.Exception.Message
    }
    finally {
        $stopwatch.Stop()
        $result.Elapsed = $stopwatch.Elapsed
        Remove-BsiScratchExecutable -Scratch $scratch
    }

    return $result
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

    $scratch = New-BsiScratchExecutable -Prefix 'bsi-signing-proof' -FileName 'proof.exe'

    try {
        Write-Host "Proving the signing session by signing a scratch copy of $(Split-Path -Leaf $scratch.Source)."
        Invoke-BsiSignFile -Path $scratch.Path -Thumbprint $Thumbprint | Out-Null
    }
    finally {
        Remove-BsiScratchExecutable -Scratch $scratch
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

    $signArguments = New-BsiSignArgumentList -Path $Path -Thumbprint $Thumbprint

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
