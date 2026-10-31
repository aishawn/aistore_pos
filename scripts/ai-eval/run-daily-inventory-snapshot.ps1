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
exit $LASTEXITCODE
