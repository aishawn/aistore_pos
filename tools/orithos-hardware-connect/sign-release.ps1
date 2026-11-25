param(
  [string]$ExePath,
  [string]$ZipPath,
  [string]$SignToolPath,
  [switch]$RequireSignature
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ExePath) -and [string]::IsNullOrWhiteSpace($ZipPath)) {
  throw "Provide an executable path, a bundle path, or both."
}
if (-not [string]::IsNullOrWhiteSpace($ExePath)) {
  if (-not (Test-Path $ExePath -PathType Leaf)) { throw "Missing executable: $ExePath" }
  $ExePath = (Resolve-Path $ExePath).Path
}

$pfx = $env:ORITHOS_CODESIGN_PFX
$password = $env:ORITHOS_CODESIGN_PASSWORD
$pfxBase64 = $env:WINDOWS_SIGNING_CERT_PFX_BASE64
if ([string]::IsNullOrWhiteSpace($pfx) -and [string]::IsNullOrWhiteSpace($pfxBase64)) {
  if ($RequireSignature) { throw "A code-signing certificate is required to publish this release." }
  Write-Warning "Unsigned release: no code-signing certificate is configured."
  return
}

$tempDirectory = Join-Path $env:TEMP ("orithos-hc-sign-" + [Guid]::NewGuid().ToString("n"))
$signedZip = $null
New-Item -ItemType Directory -Force -Path $tempDirectory | Out-Null

try {
  if (-not [string]::IsNullOrWhiteSpace($pfxBase64)) {
    $pfx = Join-Path $tempDirectory "signing.pfx"
    [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($pfxBase64))
    if ([string]::IsNullOrWhiteSpace($password)) { $password = $env:WINDOWS_SIGNING_CERT_PASSWORD }
  }

  if (-not (Test-Path $pfx -PathType Leaf)) { throw "The configured code-signing certificate file is missing." }

  if ([string]::IsNullOrWhiteSpace($SignToolPath)) {
    $windowsKits = @(
      (Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"),
      (Join-Path $env:ProgramFiles "Windows Kits\10\bin")
    ) | Where-Object { Test-Path $_ }
    $SignToolPath = $windowsKits |
      ForEach-Object { Get-ChildItem $_ -Directory | Where-Object { $_.Name -match '^\d+(\.\d+)+$' } | Sort-Object { [version]$_.Name } -Descending | ForEach-Object { Join-Path $_.FullName "x64\signtool.exe" } } |
      Where-Object { Test-Path $_ -PathType Leaf } |
      Select-Object -First 1
  }

  if ([string]::IsNullOrWhiteSpace($SignToolPath) -or -not (Test-Path $SignToolPath -PathType Leaf)) {
    throw "signtool.exe not found. Install the Windows SDK."
  }

  function Invoke-CheckedSignTool([string[]]$Arguments, [string]$Operation) {
    & $SignToolPath @Arguments
    $toolExitCode = $global:LASTEXITCODE
    if ($toolExitCode -ne 0) { throw "signtool failed while attempting to $Operation (exit code $toolExitCode)." }
  }

  function SignAndVerify([string]$Path) {
    $signArguments = @("sign", "/fd", "SHA256", "/tr", "http://timestamp.digicert.com", "/td", "SHA256", "/f", $pfx)
    if (-not [string]::IsNullOrWhiteSpace($password)) { $signArguments += @("/p", $password) }
    $signArguments += $Path
    Invoke-CheckedSignTool $signArguments "sign $([IO.Path]::GetFileName($Path))"
    Invoke-CheckedSignTool @("verify", "/pa", "/v", $Path) "verify $([IO.Path]::GetFileName($Path))"
  }

  if (-not [string]::IsNullOrWhiteSpace($ExePath)) {
    SignAndVerify $ExePath
    Write-Host "Signed and verified: $ExePath"
  }

  if (-not [string]::IsNullOrWhiteSpace($ZipPath)) {
    if (-not (Test-Path $ZipPath -PathType Leaf)) { throw "Missing bundle: $ZipPath" }
    $ZipPath = (Resolve-Path $ZipPath).Path
    $bundleDirectory = Join-Path $tempDirectory "bundle"
    Expand-Archive -Path $ZipPath -DestinationPath $bundleDirectory
    $bundleExe = Get-ChildItem $bundleDirectory -Filter "OrithosHardwareConnect.exe" -File -Recurse | Select-Object -First 1
    if (-not $bundleExe) { throw "Bundle missing OrithosHardwareConnect.exe" }
    SignAndVerify $bundleExe.FullName

    $zipDirectory = Split-Path -Parent $ZipPath
    $signedZip = Join-Path $zipDirectory ("." + [IO.Path]::GetFileNameWithoutExtension($ZipPath) + ".signed-" + [Guid]::NewGuid().ToString("n") + ".zip")
    $backupZip = Join-Path $zipDirectory ("." + [IO.Path]::GetFileName($ZipPath) + ".backup-" + [Guid]::NewGuid().ToString("n"))
    Compress-Archive -Path (Join-Path $bundleDirectory "*") -DestinationPath $signedZip
    [IO.File]::Replace($signedZip, $ZipPath, $backupZip)
    $signedZip = $null
    Remove-Item $backupZip -Force -ErrorAction SilentlyContinue
    Write-Host "Signed bundle executable and replaced bundle: $ZipPath"
  }
}
finally {
  if ($signedZip -and (Test-Path $signedZip)) { Remove-Item $signedZip -Force -ErrorAction SilentlyContinue }
  Remove-Item $tempDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
