import { headers } from "next/headers";
import { NextResponse } from "next/server";

const SETUP_EXE_URL =
  "https://github.com/aishawn/aistore_pos/releases/download/hardware-connect-latest/OrithosHardwareConnect-1.0.0-win-x64-Setup.exe";

/** One download for register staff: fetches the setup EXE and passes this store's hardware settings URL. */
export async function GET() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const settingsUrl =
    host && !host.includes("localhost")
      ? `${proto}://${host.split(",")[0]?.trim()}/settings/hardware`
      : "https://skr.orithos.com.au/settings/hardware";

  const script = `@echo off
title Orithos Hardware Connect
setlocal
set "SETTINGS_URL=${settingsUrl}"
set "SETUP_EXE=%TEMP%\\OrithosHardwareConnect-Setup.exe"
echo.
echo Installing Orithos Hardware Connect for this register...
echo If Windows SmartScreen appears: More info, then Run anyway.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${SETUP_EXE_URL}' -OutFile $env:SETUP_EXE -UseBasicParsing; Start-Process -FilePath $env:SETUP_EXE -ArgumentList ('--settings-url=' + $env:SETTINGS_URL) }"
if errorlevel 1 (
  echo Download or install failed. Check your internet connection and try again.
  pause
  exit /b 1
)
echo You can close this window after the installer finishes.
timeout /t 8 >nul
`;

  return new NextResponse(script, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="Install-Orithos-Hardware-Connect.cmd"',
      "Cache-Control": "no-store",
    },
  });
}