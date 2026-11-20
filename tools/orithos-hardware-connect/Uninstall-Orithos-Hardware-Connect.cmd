@echo off
setlocal
title Uninstall Orithos Hardware Connect
set "EXE=%LOCALAPPDATA%\Orithos\HardwareConnect\OrithosHardwareConnect.exe"
if exist "%EXE%" (
  start /wait "" "%EXE%" --uninstall
  exit /b 0
)
if exist "%~dp0uninstall.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
  exit /b %ERRORLEVEL%
)
echo Orithos Hardware Connect is not installed on this PC.
pause
exit /b 1