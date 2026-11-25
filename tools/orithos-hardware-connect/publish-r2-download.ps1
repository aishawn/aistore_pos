# Upload rolling Hardware Connect installer to Cloudflare R2 (S3-compatible API).
# Requires env: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (e.g. store).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

foreach ($name in @("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")) {
  if ([string]::IsNullOrWhiteSpace((Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value)) {
    throw "Missing required environment variable: $name"
  }
}

$version = (Select-Xml -Path ./OrithosHardwareConnect.csproj -XPath "/Project/PropertyGroup/Version").Node.InnerText.Trim()
$setup = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64-Setup.exe"
$zip = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64.zip"
if (-not (Test-Path $setup)) { throw "Missing setup executable. Run bundle-register.ps1 first: $setup" }
if (-not (Test-Path $zip)) { throw "Missing bundle zip: $zip" }

$aws = Get-Command aws -ErrorAction SilentlyContinue
if (-not $aws) { throw "AWS CLI is required for R2 uploads (aws s3 cp)." }

$destPrefix = "s3://$env:R2_BUCKET/downloads"
& aws s3 cp $setup "$destPrefix/OrithosHardwareConnect-Setup.exe" --endpoint-url $env:R2_ENDPOINT
& aws s3 cp $zip "$destPrefix/orithos-hardware-connect-latest.zip" --endpoint-url $env:R2_ENDPOINT

$setupSha = (Get-FileHash -Path $setup -Algorithm SHA256).Hash
$zipSha = (Get-FileHash -Path $zip -Algorithm SHA256).Hash
$publicBase = if ($env:ORITHOS_HC_R2_PUBLIC_BASE) { $env:ORITHOS_HC_R2_PUBLIC_BASE.TrimEnd('/') } else { "https://pub-c6dcd3f101764011bf5facc4662cc384.r2.dev" }

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\pos-ui\public\downloads")
New-Item -ItemType Directory -Force -Path $root | Out-Null
Copy-Item -Path $setup -Destination (Join-Path $root "OrithosHardwareConnect-Setup.exe") -Force
Copy-Item -Path $zip -Destination (Join-Path $root "orithos-hardware-connect-latest.zip") -Force

$meta = @{
  product      = "Orithos Hardware Connect"
  version      = "$version.0"
  downloadPath = "/downloads/orithos-hardware-connect-latest"
  setupSha256  = $setupSha
  bundleSha256 = $zipSha
  stagedAt     = (Get-Date).ToString("o")
  releaseUrl   = "$publicBase/downloads/OrithosHardwareConnect-Setup.exe"
} | ConvertTo-Json -Compress

Set-Content -Path (Join-Path $root "orithos-hardware-connect.version.json") -Value $meta -Encoding UTF8
Write-Host "Uploaded HC v$version to R2 ($publicBase/downloads/OrithosHardwareConnect-Setup.exe)"