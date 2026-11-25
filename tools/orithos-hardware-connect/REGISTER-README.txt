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
For a real Linkly terminal, install and configure the bank's Linkly Client and a local HTTP adapter on this PC. Set user env ORITHOS_LINKLY_ADAPTER_BASE to that adapter's localhost URL (ORITHOS_LINKLY_TCP_BASE remains a legacy alias), then restart Hardware Connect. The adapter is an Orithos HTTP bridge and is not the Linkly Client itself. A configured adapter is not proof of terminal connectivity; complete and reconcile a real low-value terminal test before enabling Sell card payments.

ZIP bundle (optional IT path): unzip, double-click Install-Orithos-Hardware-Connect.cmd.

Uninstall (pick one):
- Tray icon → right-click → Uninstall
- Windows Settings → Apps → Orithos Hardware Connect → Uninstall
- Run Uninstall-Orithos-Hardware-Connect.cmd from the download folder
- Or: %LocalAppData%\Orithos\HardwareConnect\OrithosHardwareConnect.exe --uninstall
