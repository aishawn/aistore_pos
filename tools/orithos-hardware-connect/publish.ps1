param(
  [string]$DotNetExe = "dotnet"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

& "$PSScriptRoot\assets\Generate-AppIcon.ps1"

& $DotNetExe publish .\OrithosHardwareConnect.csproj -c Release -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -o .\publish

New-Item -ItemType Directory -Force -Path "$PSScriptRoot\publish\assets" | Out-Null
Copy-Item "$PSScriptRoot\assets\orithos-hc-logo.png" "$PSScriptRoot\publish\assets\" -Force
Copy-Item "$PSScriptRoot\assets\orithos-hc.ico" "$PSScriptRoot\publish\assets\" -Force

Write-Host "Published: $PSScriptRoot\publish\OrithosHardwareConnect.exe (self-contained, v1 tray mode)"