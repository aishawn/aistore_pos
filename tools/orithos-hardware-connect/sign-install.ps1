param(
  [Parameter(Mandatory = $true)]
  [string]$ZipPath
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $ZipPath)) { throw "Missing zip: $ZipPath" }

$pfkB64 = $env:WINDOWS_SIGNING_CERT_PFX_BASE64
$password = $env:WINDOWS_SIGNING_CERT_PASSWORD
if (-not $pfkB64) {
  Write-Host "sign-install: no WINDOWS_SIGNING_CERT_PFX_BASE64; skip."
  exit 0
}

$tempDir = Join-Path $env:TEMP ("orithos-hc-sign-" + [Guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
$zipStage = Join-Path $tempDir "stage"
$certPath = Join-Path $tempDir "signing.pfx"

try {
  [IO.File]::WriteAllBytes($certPath, [Convert]::FromBase64String($pfkB64))
  Expand-Archive -Path $ZipPath -DestinationPath $zipStage -Force
  $exe = Join-Path $zipStage "OrithosHardwareConnect.exe"
  if (-not (Test-Path $exe)) { throw "Bundle missing OrithosHardwareConnect.exe" }

  $signtool = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
    "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe"
  ) | ForEach-Object { Resolve-Path $_ -ErrorAction SilentlyContinue } | Select-Object -First 1
  if (-not $signtool) { throw "signtool.exe not found on runner (install Windows SDK)." }

  $signArgs = @("sign", "/fd", "SHA256", "/f", $certPath, "/v", $exe)
  if ($password) { $signArgs += @("/p", $password) }
  & $signtool.Path $signArgs

  if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
  Compress-Archive -Path "$zipStage\*" -DestinationPath $ZipPath
  Write-Host "Signed and repacked: $ZipPath"
} finally {
  Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}