Orithos Hardware Connect — register install (release pipeline trigger)
=========================================

Recommended (one click):
1. Download OrithosHardwareConnect-Setup.exe from your store Settings → Hardware.
2. Open Downloads and double-click the file. Existing installations update in place and restart automatically; first-time installs open the setup wizard.
3. Allow private firewall access if Windows asks.
4. In the browser, allow Local network access for this store, then Connect local bridge.

Tray icon: double-click opens Hardware settings.
Local ports: printers 127.0.0.1:9170 · EFTPOS 127.0.0.1:9167 (same app).
After saving EFTPOS in Settings → Hardware, the connector token syncs to this PC automatically (v1.1.1+).
For a real Linkly terminal, keep the bank Linkly EFT-Client / Eftsrv running (TCP 2011 or 2005 — same path as Shopfront without a separate HTTP adapter). Orithos auto-detects those ports when ORITHOS_LINKLY_ADAPTER_BASE is not set. Optional: ORITHOS_LINKLY_TCP_PORT=2005 to pin legacy Eftsrv. HTTP adapter mode: set ORITHOS_LINKLY_ADAPTER_BASE to a local Orithos HTTP bridge URL instead. None of this proves terminal connectivity — complete a reconciled low-value test before live Sell.

ZIP bundle (optional IT path): unzip, double-click Install-Orithos-Hardware-Connect.cmd.

Uninstall (pick one):
- Tray icon → right-click → Uninstall
- Windows Settings → Apps → Orithos Hardware Connect → Uninstall
- Run Uninstall-Orithos-Hardware-Connect.cmd from the download folder
- Or: %LocalAppData%\Orithos\HardwareConnect\OrithosHardwareConnect.exe --uninstall
