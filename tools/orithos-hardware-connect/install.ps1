param(
  [string]$InstallDir = "$env:LOCALAPPDATA\Orithos\HardwareConnect",
  [string]$SettingsUrl = "https://skr.orithos.com.au/settings/hardware",
  [switch]$SkipPublish
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $SkipPublish) {
  & "$PSScriptRoot\publish.ps1"
}

$source = Join-Path $PSScriptRoot "publish"
if (-not (Test-Path (Join-Path $source "OrithosHardwareConnect.exe"))) {
  throw "Missing $source\OrithosHardwareConnect.exe — run publish.ps1 first."
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Path "$source\*" -Destination $InstallDir -Recurse -Force

$exe = Join-Path $InstallDir "OrithosHardwareConnect.exe"
$taskName = "Orithos Hardware Connect"
$tr = "`"$exe`""

schtasks.exe /Query /TN $taskName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  schtasks.exe /Delete /TN $taskName /F | Out-Null
}

schtasks.exe /Create /TN $taskName /SC ONLOGON /TR $tr /RL LIMITED /F | Out-Null

[Environment]::SetEnvironmentVariable("ORITHOS_HC_SETTINGS_URL", $SettingsUrl, "User")

Write-Host "Installed to $InstallDir"
Write-Host "Logon task: $taskName"
Write-Host "Starting agent now..."
Start-Process -FilePath $exe
Write-Host "Double-click the tray icon to open Hardware settings after deploy."