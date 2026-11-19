$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
dotnet publish .\OrithosHardwareConnect.csproj -c Release -r win-x64 --self-contained false -o .\publish
Write-Host "Published to tools/orithos-hardware-connect/publish — run OrithosHardwareConnect.exe at register logon."