param(
  [string]$InstallDir = "$env:LOCALAPPDATA\Orithos\HardwareConnect"
)

$ErrorActionPreference = "Stop"
$taskName = "Orithos Hardware Connect"

cmd /c "schtasks /Query /TN `"$taskName`" >nul 2>nul"
if ($LASTEXITCODE -eq 0) {
  cmd /c "schtasks /Delete /TN `"$taskName`" /F >nul 2>nul"
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
[Environment]::SetEnvironmentVariable("ORITHOS_CONNECTOR_TOKEN", $null, "User")
[Environment]::SetEnvironmentVariable("ORITHOS_API_URL", $null, "User")

try {
  Remove-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\OrithosHardwareConnect" -Recurse -Force -ErrorAction SilentlyContinue
} catch {
  /* ignore */
}

Write-Host "Orithos Hardware Connect removed."