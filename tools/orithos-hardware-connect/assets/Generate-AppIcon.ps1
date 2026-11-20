param(
  [string]$PngPath = (Join-Path $PSScriptRoot "orithos-hc-logo.png"),
  [string]$IcoPath = (Join-Path $PSScriptRoot "orithos-hc.ico")
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $PngPath)) { throw "Missing logo: $PngPath" }

Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::FromFile($PngPath)
try {
  $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
  $fs = [System.IO.File]::Open($IcoPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  try {
    $icon.Save($fs)
  } finally {
    $fs.Close()
    $icon.Dispose()
  }
} finally {
  $bitmap.Dispose()
}

Write-Host "Wrote $IcoPath"