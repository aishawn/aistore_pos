$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Resolve-DotNet {
  $candidates = @(
    "$env:USERPROFILE\.dotnet\dotnet.exe",
    "$env:ProgramFiles\dotnet\dotnet.exe"
  )
  foreach ($path in $candidates) {
    if (Test-Path $path) { return $path }
  }
  return "dotnet"
}

& "$PSScriptRoot\publish.ps1" -DotNetExe (Resolve-DotNet)
$version = "1.0.0"
$stage = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item "$PSScriptRoot\publish\*" $stage -Recurse
Copy-Item "$PSScriptRoot\install.ps1" $stage
Copy-Item "$PSScriptRoot\uninstall.ps1" $stage
Copy-Item "$PSScriptRoot\REGISTER-README.txt" $stage
$zip = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path "$stage\*" -DestinationPath $zip
Write-Host "Register bundle: $zip"