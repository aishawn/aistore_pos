$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
& "$PSScriptRoot\bundle-register.ps1"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\pos-ui\public\downloads")
New-Item -ItemType Directory -Force -Path $root | Out-Null

$zip = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-1.1.0-win-x64.zip"
if (-not (Test-Path $zip)) { throw "Missing bundle zip: $zip" }

$dest = Join-Path $root "orithos-hardware-connect-latest.zip"
Copy-Item -Path $zip -Destination $dest -Force

$setupExe = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-1.1.0-win-x64-Setup.exe"
if (Test-Path $setupExe) {
  Copy-Item -Path $setupExe -Destination (Join-Path $root "OrithosHardwareConnect-Setup.exe") -Force
}

$meta = @{
  product = "Orithos Hardware Connect"
  version = "1.1.0.0"
  downloadPath = "/downloads/orithos-hardware-connect-latest"
  stagedAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Compress

Set-Content -Path (Join-Path $root "orithos-hardware-connect.version.json") -Value $meta -Encoding UTF8
Write-Host "Staged for pos-ui: $dest"