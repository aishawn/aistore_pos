$ErrorActionPreference = "Stop"
Write-Host "Installing .NET 8 Desktop Runtime (required for Orithos Hardware Connect)..."
winget install --id Microsoft.DotNet.Runtime.8 --accept-package-agreements --accept-source-agreements
Write-Host "Done. Start the agent with run-dev.ps1 or publish\OrithosHardwareConnect.exe"