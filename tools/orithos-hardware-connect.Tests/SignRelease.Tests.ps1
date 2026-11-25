$scriptPath = Join-Path $PSScriptRoot "..\orithos-hardware-connect\sign-release.ps1"

Describe "sign-release.ps1" {
  BeforeEach {
    $script:signingRoot = Join-Path $TestDrive ([Guid]::NewGuid().ToString("n"))
    New-Item -ItemType Directory -Path $script:signingRoot | Out-Null
    $script:exe = Join-Path $script:signingRoot "OrithosHardwareConnect-Setup.exe"
    $script:zip = Join-Path $script:signingRoot "OrithosHardwareConnect-win-x64.zip"
    $script:fakeSignTool = Join-Path $script:signingRoot "signtool.cmd"
    $script:signToolLog = Join-Path $script:signingRoot "signtool.log"
    [IO.File]::WriteAllText($script:exe, "setup-payload")
    $bundleExe = Join-Path $script:signingRoot "OrithosHardwareConnect.exe"
    [IO.File]::WriteAllText($bundleExe, "bundle-payload")
    Compress-Archive -Path $bundleExe -DestinationPath $script:zip
    @'
@echo off
echo %1 %*>>"%SIGNTOOL_LOG%"
if /I "%SIGNTOOL_FAIL_ON%"=="%1" exit /b 23
if /I "%SIGNTOOL_FAIL_ON%"=="bundle-verify" if /I "%1"=="verify" if /I "%~nx4"=="OrithosHardwareConnect.exe" exit /b 23
exit /b 0
'@ | Set-Content -Path $script:fakeSignTool -Encoding Ascii
    $env:WINDOWS_SIGNING_CERT_PFX_BASE64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("test certificate"))
    $env:WINDOWS_SIGNING_CERT_PASSWORD = "test-password"
    $env:SIGNTOOL_LOG = $script:signToolLog
    $env:SIGNTOOL_FAIL_ON = ""
  }

  AfterEach {
    Remove-Item Env:WINDOWS_SIGNING_CERT_PFX_BASE64 -ErrorAction SilentlyContinue
    Remove-Item Env:WINDOWS_SIGNING_CERT_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SIGNTOOL_LOG -ErrorAction SilentlyContinue
    Remove-Item Env:SIGNTOOL_FAIL_ON -ErrorAction SilentlyContinue
  }

  It "signs and verifies the standalone setup and bundled executable" {
    & $scriptPath -ExePath $script:exe -ZipPath $script:zip -SignToolPath $script:fakeSignTool

    $commands = Get-Content $script:signToolLog
    (@($commands | Where-Object { $_ -match "^sign " })).Count | Should Be 2
    (@($commands | Where-Object { $_ -match "^verify " })).Count | Should Be 2
    Test-Path $script:zip | Should Be $true
  }

  It "signs a bundle when no standalone setup executable is supplied" {
    & $scriptPath -ZipPath $script:zip -SignToolPath $script:fakeSignTool

    $commands = Get-Content $script:signToolLog
    (@($commands | Where-Object { $_ -match "^sign " })).Count | Should Be 1
    (@($commands | Where-Object { $_ -match "^verify " })).Count | Should Be 1
  }

  It "returns nonzero from the fake signer when the requested operation fails" {
    $env:SIGNTOOL_FAIL_ON = "sign"
    & $script:fakeSignTool sign probe

    $LASTEXITCODE | Should Be 23
  }

  It "preserves the original bundle and fails when signing fails" {
    $originalZip = [Convert]::ToBase64String([IO.File]::ReadAllBytes($script:zip))
    $env:SIGNTOOL_FAIL_ON = "sign"

    $errorMessage = $null
    try { & $scriptPath -ExePath $script:exe -ZipPath $script:zip -SignToolPath $script:fakeSignTool } catch { $errorMessage = $_.Exception.Message }
    $errorMessage | Should Not BeNullOrEmpty

    [Convert]::ToBase64String([IO.File]::ReadAllBytes($script:zip)) | Should Be $originalZip
  }

  It "does not publish when the standalone setup signature fails verification" {
    $originalZip = [Convert]::ToBase64String([IO.File]::ReadAllBytes($script:zip))
    $env:SIGNTOOL_FAIL_ON = "verify"

    $errorMessage = $null
    try { & $scriptPath -ExePath $script:exe -ZipPath $script:zip -SignToolPath $script:fakeSignTool } catch { $errorMessage = $_.Exception.Message }
    $errorMessage | Should Not BeNullOrEmpty
    [Convert]::ToBase64String([IO.File]::ReadAllBytes($script:zip)) | Should Be $originalZip
  }

  It "does not publish when the bundle signature fails verification" {
    $originalZip = [Convert]::ToBase64String([IO.File]::ReadAllBytes($script:zip))
    $env:SIGNTOOL_FAIL_ON = "bundle-verify"

    $errorMessage = $null
    try { & $scriptPath -ExePath $script:exe -ZipPath $script:zip -SignToolPath $script:fakeSignTool } catch { $errorMessage = $_.Exception.Message }

    $errorMessage | Should Not BeNullOrEmpty
    [Convert]::ToBase64String([IO.File]::ReadAllBytes($script:zip)) | Should Be $originalZip
  }

  It "skips signing when no signing certificate is configured" {
    Remove-Item Env:WINDOWS_SIGNING_CERT_PFX_BASE64
    Remove-Item Env:ORITHOS_CODESIGN_PFX -ErrorAction SilentlyContinue

    { & $scriptPath -ExePath $script:exe -ZipPath $script:zip -SignToolPath (Join-Path $script:signingRoot "missing.exe") } | Should Not Throw
    Test-Path $script:signToolLog | Should Be $false
  }

  It "fails when a release requires a signature but no certificate is configured" {
    Remove-Item Env:WINDOWS_SIGNING_CERT_PFX_BASE64
    Remove-Item Env:ORITHOS_CODESIGN_PFX -ErrorAction SilentlyContinue

    $errorMessage = $null
    try { & $scriptPath -ExePath $script:exe -RequireSignature } catch { $errorMessage = $_.Exception.Message }

    $errorMessage | Should Not BeNullOrEmpty
  }
}
