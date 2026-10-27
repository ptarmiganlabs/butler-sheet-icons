$ErrorActionPreference = 'Stop'

# Checks the two helpers in scripts/lib/win-signing.ps1 that every Windows build relies on:
# Get-BsiSigntoolPath finds signtool, and Invoke-BsiStripSignature removes the signature a copied
# node.exe carries. It strips a scratch copy of the node.exe running the build and asks Windows
# whether anything is left.
#
# pr-unit-tests.yaml runs it under PowerShell 7 and again under Windows PowerShell 5.1, because a
# variant build may dot-source the library under 5.1: a PowerShell 7-only construct would pass
# every job here and break that build.
. "$PSScriptRoot/../lib/win-signing.ps1"

Write-Host "PowerShell $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition))"

$signtool = Get-BsiSigntoolPath
Write-Host "signtool: $signtool"

$node = (Get-Command -Name node -CommandType Application | Select-Object -First 1).Source
$scratch = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ('bsi-strip-check-' + [guid]::NewGuid().ToString() + '.exe')

try {
    Copy-Item -LiteralPath $node -Destination $scratch

    # Node's Windows builds are signed, so there has to be something to strip, or this proves
    # nothing.
    $before = (Get-AuthenticodeSignature -LiteralPath $scratch).Status
    if ($before -eq 'NotSigned') {
        throw "$node carries no signature, so stripping it would prove nothing."
    }

    Invoke-BsiStripSignature -Path $scratch -Signtool $signtool

    $after = (Get-AuthenticodeSignature -LiteralPath $scratch).Status
    if ($after -ne 'NotSigned') {
        throw "Invoke-BsiStripSignature left a signature behind: Windows reads the copy as '$after'."
    }

    Write-Host "ok: a copy of $node read as $before before Invoke-BsiStripSignature and $after after it."
}
finally {
    Remove-Item -LiteralPath $scratch -Force -ErrorAction SilentlyContinue
}
