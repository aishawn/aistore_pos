$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
& "$PSScriptRoot\publish.ps1"
$version = "1.0.0"
$stage = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item "$PSScriptRoot\publish\*" $stage -Recurse
Copy-Item "$PSScriptRoot\install.ps1" $stage
Copy-Item "$PSScriptRoot\uninstall.ps1" $stage
$zip = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$stage\*" -DestinationPath $zip
Write-Host "Register bundle: $zip"