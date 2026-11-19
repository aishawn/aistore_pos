param(
  [string]$InstallDir = "$env:LOCALAPPDATA\Orithos\HardwareConnect",
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

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Get-Process -Name "OrithosHardwareConnect" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Copy-Item -Path "$source\*" -Destination $InstallDir -Recurse -Force

$exe = Join-Path $InstallDir "OrithosHardwareConnect.exe"
$taskName = "Orithos Hardware Connect"
$tr = "`"$exe`""

schtasks.exe /Query /TN $taskName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  schtasks.exe /Delete /TN $taskName /F | Out-Null
}

$startupMode = "none"
schtasks.exe /Create /TN $taskName /SC ONLOGON /TR $tr /RL LIMITED /F 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  $startupMode = "scheduled-task"
} else {
  $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  New-Item -Path $runKey -Force | Out-Null
  Set-ItemProperty -Path $runKey -Name "OrithosHardwareConnect" -Value $tr
  $startupMode = "run-key"
}

[Environment]::SetEnvironmentVariable("ORITHOS_HC_SETTINGS_URL", $SettingsUrl, "User")

Write-Host "Installed to $InstallDir"
Write-Host "Startup: $startupMode ($taskName)"

Get-Process -Name "OrithosHardwareConnect" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Write-Host "Starting agent now..."
Start-Process -FilePath $exe
Write-Host "Double-click the tray icon to open Hardware settings after deploy."