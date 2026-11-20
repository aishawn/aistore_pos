# Optional Authenticode signing for Setup.exe (removes SmartScreen "unknown publisher" after reputation builds).
# Requires: ORITHOS_CODESIGN_PFX path and ORITHOS_CODESIGN_PASSWORD (or cert in Windows cert store).
# Shopfront-style production path: EV code signing cert (DigiCert/Sectigo) or Azure Trusted Signing, then sign in CI before GitHub upload.

param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath
)

$ErrorActionPreference = "Stop"
$pfx = $env:ORITHOS_CODESIGN_PFX
$pwd = $env:ORITHOS_CODESIGN_PASSWORD

if ([string]::IsNullOrWhiteSpace($pfx) -or -not (Test-Path $pfx)) {
  Write-Host "Skip signing: set ORITHOS_CODESIGN_PFX to a .pfx file."
  exit 0
}

$signtool = "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" | Get-Item -ErrorAction SilentlyContinue | Select-Object -Last 1
if (-not $signtool) {
  throw "signtool.exe not found. Install Windows SDK."
}

$args = @("sign", "/fd", "SHA256", "/tr", "http://timestamp.digicert.com", "/td", "SHA256", "/f", $pfx, $ExePath)
if ($pwd) { $args = @("sign", "/fd", "SHA256", "/tr", "http://timestamp.digicert.com", "/td", "SHA256", "/f", $pfx, "/p", $pwd, $ExePath) }

& $signtool.FullName @args
Write-Host "Signed: $ExePath"