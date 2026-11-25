$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
& "$PSScriptRoot\bundle-register.ps1"

$version = (Select-Xml -Path ./OrithosHardwareConnect.csproj -XPath "/Project/PropertyGroup/Version").Node.InnerText.Trim()
$versionDisplay = "$version.0"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\pos-ui\public\downloads")
New-Item -ItemType Directory -Force -Path $root | Out-Null

$zip = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64.zip"
if (-not (Test-Path $zip)) { throw "Missing bundle zip: $zip" }

$setupExe = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64-Setup.exe"
if (-not (Test-Path $setupExe -PathType Leaf)) { throw "Missing setup executable: $setupExe" }

$signScript = Join-Path $PSScriptRoot "sign-release.ps1"
if (-not (Test-Path $signScript -PathType Leaf)) { throw "Missing required release signer: $signScript" }
& $signScript -ExePath $setupExe -ZipPath $zip -RequireSignature

$destSetup = Join-Path $root "OrithosHardwareConnect-Setup.exe"
Copy-Item -Path $setupExe -Destination $destSetup -Force
Copy-Item -Path $zip -Destination (Join-Path $root "orithos-hardware-connect-latest.zip") -Force

$sourceSetupHash = (Get-FileHash -Path $setupExe -Algorithm SHA256).Hash
$stagedSetupHash = (Get-FileHash -Path $destSetup -Algorithm SHA256).Hash
if ($sourceSetupHash -ne $stagedSetupHash) { throw "Staged setup hash does not match the signed source executable." }
$sourceZipHash = (Get-FileHash -Path $zip -Algorithm SHA256).Hash
$stagedZipHash = (Get-FileHash -Path (Join-Path $root "orithos-hardware-connect-latest.zip") -Algorithm SHA256).Hash
if ($sourceZipHash -ne $stagedZipHash) { throw "Staged bundle hash does not match the signed source archive." }

$meta = @{
  product     = "Orithos Hardware Connect"
  version     = $versionDisplay
  downloadPath = "/downloads/orithos-hardware-connect-latest"
  setupSha256 = $stagedSetupHash
  bundleSha256 = $stagedZipHash
  stagedAt    = (Get-Date).ToString("o")
  releaseUrl  = "https://github.com/aishawn/aistore_pos/releases/download/hardware-connect-latest/OrithosHardwareConnect-Setup.exe"
} | ConvertTo-Json -Compress

Set-Content -Path (Join-Path $root "orithos-hardware-connect.version.json") -Value $meta -Encoding UTF8
Write-Host "Staged signed installer and bundle for pos-ui (v$versionDisplay, SHA256 $stagedSetupHash)"
