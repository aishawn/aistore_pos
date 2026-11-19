$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:ORITHOS_HC_URL = "http://127.0.0.1:9170/"
dotnet run --project .\OrithosHardwareConnect.csproj