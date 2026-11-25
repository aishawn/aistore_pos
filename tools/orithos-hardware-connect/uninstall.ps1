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

$installedExe = Join-Path $InstallDir "OrithosHardwareConnect.exe"
$agentProcesses = Get-Process -Name "OrithosHardwareConnect" -ErrorAction SilentlyContinue | Where-Object {
  try { [string]::Equals($_.Path, $installedExe, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
}
foreach ($process in $agentProcesses) {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  try { $process.WaitForExit(15000) } catch {}
}

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
