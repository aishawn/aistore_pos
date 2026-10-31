param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path,
  [string]$WorkingDirectory = $RepositoryRoot,
  [string]$TaskName = 'Orithos-AI-Daily-Inventory-Snapshot',
  [datetime]$StartTime = (Get-Date).Date.AddHours(2),
  [switch]$RunNow
)

$ErrorActionPreference = 'Stop'
$python = (Get-Command python -ErrorAction Stop).Source
$collector = Join-Path $RepositoryRoot 'scripts/ai-eval/fetch-skr-inventory-snapshot.py'
if (-not (Test-Path -LiteralPath $collector)) {
  throw "Inventory collector not found: $collector"
}

$action = New-ScheduledTaskAction -Execute $python `
  -Argument ('"{0}"' -f $collector) `
  -WorkingDirectory $WorkingDirectory
$trigger = New-ScheduledTaskTrigger -Daily -At $StartTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Read-only native Odoo inventory snapshot for AI replenishment backtests.' -Force | Out-Null

if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State, @{Name='StartTime'; Expression={$StartTime.ToString('s')}}, @{Name='Collector'; Expression={$collector}}
