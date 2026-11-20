Orithos Hardware Connect — register install (release pipeline trigger)
=========================================

Recommended (one click):
1. Download OrithosHardwareConnect-Setup.exe from your store Settings → Hardware.
2. Open Downloads and double-click the file.
3. Click Yes when asked to install. Allow private firewall if Windows asks.
4. In the browser, allow Local network access for this store, then Connect local bridge.

Tray icon: double-click opens Hardware settings.
Local ports: printers 127.0.0.1:9170 · EFTPOS 127.0.0.1:9167 (same app).
After saving EFTPOS in Settings → Hardware, the connector token syncs to this PC automatically (v1.1.1+).
For a real Linkly terminal, install Linkly on this PC and set user env ORITHOS_LINKLY_TCP_BASE to its local HTTP base URL.

ZIP bundle (optional IT path): unzip, double-click Install-Orithos-Hardware-Connect.cmd.

Uninstall (pick one):
- Tray icon → right-click → Uninstall
- Windows Settings → Apps → Orithos Hardware Connect → Uninstall
- Run Uninstall-Orithos-Hardware-Connect.cmd from the download folder
- Or: %LocalAppData%\Orithos\HardwareConnect\OrithosHardwareConnect.exe --uninstall