Orithos Hardware Connect — register install
=========================================

Recommended (one click):
1. Download OrithosHardwareConnect-Setup.exe from your store Settings → Hardware.
2. Open Downloads and double-click the file.
3. Click Yes when asked to install. Allow private firewall if Windows asks.
4. In the browser, allow Local network access for this store, then Connect local bridge.

Tray icon: double-click opens Hardware settings.
Local ports: printers 127.0.0.1:9170 · EFTPOS 127.0.0.1:9167 (same app).
After saving EFTPOS in settings, set user env ORITHOS_CONNECTOR_TOKEN and ORITHOS_API_URL (your store API URL).

ZIP bundle (optional IT path): unzip, double-click Install-Orithos-Hardware-Connect.cmd.

Uninstall: run OrithosHardwareConnect.exe --uninstall from the install folder, or uninstall.ps1 in the zip.