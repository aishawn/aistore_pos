$ErrorActionPreference = "Stop"
Write-Host "Installing .NET 8 SDK for current user (no admin)..."
$script = "$env:TEMP\dotnet-install.ps1"
Invoke-WebRequest -Uri "https://dot.net/v1/dotnet-install.ps1" -OutFile $script -UseBasicParsing
& $script -Channel 8.0 -Quality GA -Architecture x64 -InstallDir "$env:USERPROFILE\.dotnet"
Write-Host "SDK at $env:USERPROFILE\.dotnet\dotnet.exe — run install.ps1 next."