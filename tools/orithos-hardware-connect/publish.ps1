$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
dotnet publish .\OrithosHardwareConnect.csproj -c Release -r win-x64 `
  --self-contained true `
  -p:PublishSingleFile=true `
  -p:IncludeNativeLibrariesForSelfExtract=true `
  -o .\publish
Write-Host "Published: $PSScriptRoot\publish\OrithosHardwareConnect.exe (self-contained, v1 tray mode)"