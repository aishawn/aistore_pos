param(
  [string]$SettingsUrl = "https://skr.orithos.com.au/settings/hardware",
  [switch]$SkipPublish
)

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

if (-not $SkipPublish) {
  $dotnet = Resolve-DotNet
  & "$PSScriptRoot\publish.ps1" -DotNetExe $dotnet
}

$source = Join-Path $PSScriptRoot "publish"
if (-not (Test-Path (Join-Path $source "OrithosHardwareConnect.exe"))) {
  if (Test-Path (Join-Path $PSScriptRoot "OrithosHardwareConnect.exe")) {
    $source = $PSScriptRoot
  } else {
    throw "Missing OrithosHardwareConnect.exe — run publish.ps1 first or use the setup .exe from the store download."
  }
}

$exe = Join-Path $source "OrithosHardwareConnect.exe"
if (-not (Test-Path $exe -PathType Leaf)) {
  throw "The installer executable is missing: $exe"
}

Write-Host "Starting the Orithos Hardware Connect installer..."
& $exe --install "--settings-url=$SettingsUrl"
if ($LASTEXITCODE -ne 0) {
  throw "Hardware Connect installation failed with exit code $LASTEXITCODE."
}

Write-Host "Installation or update completed. Confirm both local services in Hardware settings."
