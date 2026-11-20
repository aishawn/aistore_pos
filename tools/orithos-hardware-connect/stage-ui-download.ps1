$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
& "$PSScriptRoot\bundle-register.ps1"

$version = (Select-Xml -Path ./OrithosHardwareConnect.csproj -XPath "/Project/PropertyGroup/Version").Node.InnerText.Trim()
$versionDisplay = "$version.0"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\pos-ui\public\downloads")
New-Item -ItemType Directory -Force -Path $root | Out-Null

$zip = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64.zip"
if (-not (Test-Path $zip)) { throw "Missing bundle zip: $zip" }

$destZip = Join-Path $root "orithos-hardware-connect-latest.zip"
Copy-Item -Path $zip -Destination $destZip -Force

$setupExe = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64-Setup.exe"
if (Test-Path $setupExe) {
  Copy-Item -Path $setupExe -Destination (Join-Path $root "OrithosHardwareConnect-Setup.exe") -Force
}

$meta = @{
  product     = "Orithos Hardware Connect"
  version     = $versionDisplay
  downloadPath = "/downloads/orithos-hardware-connect-latest"
  stagedAt    = (Get-Date).ToString("o")
  releaseUrl  = "https://github.com/aishawn/aistore_pos/releases/download/hardware-connect-latest/OrithosHardwareConnect-Setup.exe"
} | ConvertTo-Json -Compress

Set-Content -Path (Join-Path $root "orithos-hardware-connect.version.json") -Value $meta -Encoding UTF8
Write-Host "Staged for pos-ui: $destZip (v$versionDisplay)"