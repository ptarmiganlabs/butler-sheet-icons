# Shared Windows helpers for the SEA builds, dot-sourced by the release build, the insider build and
# butler-sheet-icons-premium's build. Two of them are meant to be called: Get-BsiSigntoolPath finds
# signtool.exe, and Invoke-BsiStripSignature removes the Authenticode signature a copied node.exe
# carries, which every Windows build needs before postject rewrites the binary. The rest are what
# those two are built from.
#
# Nothing here signs. Releases are signed through Azure Artifact Signing by sign-win64 in ci.yaml, a
# job that runs no repository code - this file included - and insiders builds are not signed at all
# (plabs-house-rules, rules/ci/public-repositories.md). The certificate-based signing that used to
# live here, with its SimplySign session handling, was removed in October 2026 and is in this
# file's history.
#
# This file must keep working under Windows PowerShell 5.1 as well as PowerShell 7:
# butler-sheet-icons-premium runs it under 5.1, and pr-unit-tests.yaml checks it under both
# (scripts/diag/win-strip-check.ps1).

# Deliberately no Set-StrictMode here. Dot-sourcing runs this in the caller's scope, so a strict
# mode set here would silently change the semantics of every script that includes it - including
# their use of $LASTEXITCODE, which is undefined until the first native command runs.

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
# The timeout was written for certificate signing, where a lapsed session turned signtool into a
# process waiting on a login dialog nothing would ever click. `signtool remove` needs no key and has
# no such dialog, but a hang on a developer machine or a runner image is still better killed than
# left to run until the job's timeout. BSI_SIGN_TIMEOUT_SECONDS overrides the 180-second default.
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
