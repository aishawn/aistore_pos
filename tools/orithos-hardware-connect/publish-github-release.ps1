# Upload rolling HC assets to GitHub (requires: gh auth login).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$gh = "${env:ProgramFiles}\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) { $gh = "gh" }

& $gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Run: gh auth login"
  exit 1
}

$version = (Select-Xml -Path ./OrithosHardwareConnect.csproj -XPath "/Project/PropertyGroup/Version").Node.InnerText.Trim()
$releaseDir = Join-Path $PSScriptRoot "dist\release"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

$setup = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64-Setup.exe"
$zip = Join-Path $PSScriptRoot "dist\OrithosHardwareConnect-$version-win-x64.zip"
if (-not (Test-Path $setup)) { throw "Run bundle-register.ps1 first. Missing: $setup" }
if (-not (Test-Path $zip)) { throw "Missing: $zip" }

Copy-Item $setup (Join-Path $releaseDir "OrithosHardwareConnect-Setup.exe") -Force
Copy-Item $zip (Join-Path $releaseDir "OrithosHardwareConnect-win-x64.zip") -Force

$signScript = Join-Path $PSScriptRoot "sign-release.ps1"
if (Test-Path $signScript) {
  & $signScript -ExePath (Join-Path $releaseDir "OrithosHardwareConnect-Setup.exe")
}

& $gh release upload hardware-connect-latest `
  --repo aishawn/aistore_pos `
  --clobber `
  (Join-Path $releaseDir "OrithosHardwareConnect-Setup.exe") `
  (Join-Path $releaseDir "OrithosHardwareConnect-win-x64.zip")

Write-Host "Uploaded HC v$version to hardware-connect-latest"