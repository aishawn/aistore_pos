param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath
)

$ErrorActionPreference = "Stop"
$signScript = Join-Path $PSScriptRoot "sign-release.ps1"
& $signScript -ZipPath $ZipPath -RequireSignature
