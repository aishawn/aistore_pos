param(
  [string]$AssetsDir = $PSScriptRoot,
  [string]$PngPath = (Join-Path $PSScriptRoot "orithos-hc-logo.png"),
  [string]$IcoPath = (Join-Path $PSScriptRoot "orithos-hc.ico"),
  [string]$BrandOrange = "#F05A17",
  [int]$Canvas = 256
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# Match pos-ui/public/images/orithos-mark-v5.svg and OrithosBrandMarkIcon (viewBox 32, r=11, stroke 4).
function New-OrithosBrandBitmap([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $scale = $size / 32.0
    $stroke = 4.0 * $scale
    $radius = 11.0 * $scale
    $center = $size / 2.0

    $orange = [System.Drawing.ColorTranslator]::FromHtml($BrandOrange)
    $pen = New-Object System.Drawing.Pen $orange, $stroke
    try {
      $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
      $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
      $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
      $inset = $stroke / 2.0
      $graphics.DrawEllipse(
        $pen,
        [float]($center - $radius),
        [float]($center - $radius),
        [float](2 * $radius),
        [float](2 * $radius))
    } finally {
      $pen.Dispose()
    }
  } finally {
    $graphics.Dispose()
  }

  return $bitmap
}

function Save-IconFromBitmaps([System.Drawing.Bitmap[]]$bitmaps, [string]$path) {
  if ($bitmaps.Count -eq 0) { throw "No bitmaps for icon." }

  $stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  try {
    $icon = [System.Drawing.Icon]::FromHandle($bitmaps[$bitmaps.Count - 1].GetHicon())
    try {
      $icon.Save($stream)
    } finally {
      $icon.Dispose()
    }
  } finally {
    $stream.Close()
  }
}

$logo = New-OrithosBrandBitmap -size $Canvas
try {
  $logo.Save($PngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "Wrote $PngPath"

  $iconSizes = @(16, 32, 48, 256)
  $iconBitmaps = @()
  foreach ($iconSize in $iconSizes) {
    $iconBitmaps += (New-OrithosBrandBitmap -size $iconSize)
  }
  try {
    Save-IconFromBitmaps -bitmaps $iconBitmaps -path $IcoPath
    Write-Host "Wrote $IcoPath"
  } finally {
    foreach ($bmp in $iconBitmaps) {
      $bmp.Dispose()
    }
  }
} finally {
  $logo.Dispose()
}