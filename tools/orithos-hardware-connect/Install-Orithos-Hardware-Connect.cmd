@echo off
setlocal
cd /d "%~dp0"
title Orithos Hardware Connect
if exist "%~dp0OrithosHardwareConnect-Setup.exe" (
  start "" "%~dp0OrithosHardwareConnect-Setup.exe"
  exit /b 0
)
if exist "%~dp0OrithosHardwareConnect.exe" (
  start "" "%~dp0OrithosHardwareConnect.exe" --install
  exit /b 0
)
echo Could not find OrithosHardwareConnect.exe in this folder.
pause
exit /b 1