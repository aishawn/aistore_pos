param(
  [string]$InstallDir = "$env:LOCALAPPDATA\Orithos\HardwareConnect"
)

$ErrorActionPreference = "Stop"
$taskName = "Orithos Hardware Connect"

schtasks.exe /Query /TN $taskName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  schtasks.exe /Delete /TN $taskName /F | Out-Null
}

$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (Get-ItemProperty -Path $runKey -Name "OrithosHardwareConnect" -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $runKey -Name "OrithosHardwareConnect" -ErrorAction SilentlyContinue
}

Get-Process -Name "OrithosHardwareConnect" -ErrorAction SilentlyContinue | Stop-Process -Force

if (Test-Path $InstallDir) {
  Remove-Item -Path $InstallDir -Recurse -Force
}

[Environment]::SetEnvironmentVariable("ORITHOS_HC_SETTINGS_URL", $null, "User")

Write-Host "Orithos Hardware Connect removed."