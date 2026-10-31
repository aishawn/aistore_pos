param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
)

$ErrorActionPreference = 'Stop'
$python = (Get-Command python -ErrorAction Stop).Source
$collector = Join-Path $RepositoryRoot 'scripts/ai-eval/fetch-skr-inventory-snapshot.py'
$validator = Join-Path $RepositoryRoot 'scripts/ai-eval/validate-inventory-snapshot.py'
& $python $collector
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$root = Join-Path $RepositoryRoot '.local/ai-eval/inventory-snapshots'
$snapshot = Get-ChildItem -LiteralPath $root -Filter inventory.json -File -Recurse |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $snapshot) { throw "No inventory snapshot was produced under $root" }
$report = Join-Path $snapshot.DirectoryName 'validation.json'
& $python $validator $snapshot.FullName --report $report
$validationExit = $LASTEXITCODE
$historyBuilder = Join-Path $RepositoryRoot 'scripts/ai-eval/build-inventory-history.py'
$historyOutput = Join-Path $RepositoryRoot '.local/ai-eval/inventory-history.json'
& $python $historyBuilder --input (Join-Path $RepositoryRoot '.local/ai-eval/inventory-snapshots') --output $historyOutput
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$freshnessChecker = Join-Path $RepositoryRoot 'scripts/ai-eval/check-inventory-history-freshness.py'
$freshnessReport = Join-Path $RepositoryRoot '.local/ai-eval/inventory-history-freshness.json'
& $python $freshnessChecker $historyOutput --max-age-hours 36 | Set-Content -LiteralPath $freshnessReport -Encoding utf8
# Freshness is an operational diagnostic; snapshot validation remains the exit gate.
exit $validationExit
