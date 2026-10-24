#Requires -Version 5.1
<#
.SYNOPSIS
  Install the Private Remote plugin from its GitHub release into a DSH profile.

.DESCRIPTION
  Downloads nothing itself: it hands the release tarball URL to the official
  `dsh plugin add` command, so the official plugin manager performs the install.
  Fully quit DeepSeek Harness Desktop before running this for the `desktop`
  profile; the profile must have been initialized by launching Desktop once.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
  .\install.ps1 -Profile desktop -Dsh "C:\Path\To\dsh.cmd"
#>
[CmdletBinding()]
param(
    [string]$Profile = "desktop",
    [string]$Version = "0.1.0",
    [string]$Dsh = "dsh"
)

$ErrorActionPreference = "Stop"
$url = "https://github.com/MikyWang/dsh-private-remote/releases/download/v$Version/dsh-private-remote-$Version.tgz"

$command = Get-Command $Dsh -ErrorAction SilentlyContinue
if ($null -ne $command) {
    $dshPath = $command.Source
} elseif (Test-Path -LiteralPath $Dsh) {
    $dshPath = (Resolve-Path -LiteralPath $Dsh).Path
} else {
    throw "dsh CLI not found: $Dsh. Pass -Dsh with the full path to the CLI shipped by DeepSeek Harness Desktop."
}

Write-Host "Installing dsh-private-remote $Version into profile '$Profile'..." -ForegroundColor Cyan
Write-Host "  $url"
& $dshPath plugin --profile $Profile add $url
if ($LASTEXITCODE -ne 0) {
    throw "dsh plugin add failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Installed. Restart DeepSeek Harness Desktop, then open the '私人远程' / 'Private Remote' panel." -ForegroundColor Green
Write-Host "For a Host, add the private-remote config row to the profile cordis.patch.yml; see README.md section 4.2."
