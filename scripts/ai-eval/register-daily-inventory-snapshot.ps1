param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
  [string]$WorkingDirectory = $RepositoryRoot,
  [string]$TaskName = 'Orithos-AI-Daily-Inventory-Snapshot',
  [datetime]$StartTime = (Get-Date).Date.AddHours(2),
  [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$python = (Get-Command python -ErrorAction Stop).Source
$runner = Join-Path $RepositoryRoot 'scripts/ai-eval/run-daily-inventory-snapshot.ps1'
if (-not (Test-Path -LiteralPath $runner)) {
  throw "Inventory snapshot runner not found: $runner"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -RepositoryRoot "{1}"' -f $runner, $RepositoryRoot) `
  -WorkingDirectory $WorkingDirectory
$trigger = New-ScheduledTaskTrigger -Daily -At $StartTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Read-only native Odoo inventory snapshot for AI replenishment backtests.' -Force | Out-Null

if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State, @{Name='StartTime'; Expression={$StartTime.ToString('s')}}, @{Name='Runner'; Expression={$runner}}
