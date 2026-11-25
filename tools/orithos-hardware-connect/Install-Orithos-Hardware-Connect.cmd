@echo off
setlocal
cd /d "%~dp0"
title Orithos Hardware Connect
if exist "%~dp0OrithosHardwareConnect-Setup.exe" (
  start /wait "" "%~dp0OrithosHardwareConnect-Setup.exe"
  exit /b %ERRORLEVEL%
)
if exist "%~dp0OrithosHardwareConnect.exe" (
  start /wait "" "%~dp0OrithosHardwareConnect.exe" --install
  exit /b %ERRORLEVEL%
)
echo Could not find OrithosHardwareConnect.exe in this folder.
pause
exit /b 1
