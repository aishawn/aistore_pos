"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { Cable, CreditCard, ExternalLink, Printer, RefreshCw, Scale, ScanBarcode, ScreenShare } from "lucide-react";
import {
  connectLocalHardware,
  getLocalHardwareSettings,
  getLocalHardwareSettingsSnapshot,
  parseLocalHardwareSettings,
  readSerialDiagnostic,
  saveLocalHardwareSettings,
  subscribeLocalHardwareSettings,
  type DiagnosticSerialApi,
  type LocalHardwareState,
  printThroughLocalBridge,
  supportsBarcodeDetection,
  markBarcodeScannerTested,
} from "@/lib/local-hardware";

function subscribeToNetworkStatus(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

const getNetworkStatus = () => navigator.onLine;
const getServerNetworkStatus = () => false;

type HardwareSettings = ReturnType<typeof getLocalHardwareSettings>;
const initialSettings: HardwareSettings = {
  printer: "",
  cashDrawer: false,
  linklyTerminal: "",
  linklyAcquirer: "",
  linklyConnection: "",
};

export function HardwareSetupPanel() {
  const settingsSnapshot = useSyncExternalStore(subscribeLocalHardwareSettings, getLocalHardwareSettingsSnapshot, () => "");
  const online = useSyncExternalStore(subscribeToNetworkStatus, getNetworkStatus, getServerNetworkStatus);
  const settings = settingsSnapshot ? parseLocalHardwareSettings(settingsSnapshot) : initialSettings;
  const [state, setState] = useState<LocalHardwareState>({ qzAvailable: false, connected: false, printers: [], error: null });
  const [scanTest, setScanTest] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scaleReader, setScaleReader] = useState<string | null>(null);
  const [scaleReading, setScaleReading] = useState(false);
  const scaleAbort = useRef<AbortController | null>(null);
  const [qzScriptError, setQzScriptError] = useState(false);

  useEffect(() => () => scaleAbort.current?.abort(), []);

  function saveSettings(next: HardwareSettings) {
    try {
      saveLocalHardwareSettings(next);
      setNotice("Terminal preferences saved in this browser.");
    } catch {
      setNotice("Browser storage is unavailable; preferences were not saved.");
    }
  }

  async function connect() {
    setBusy(true);
    setNotice(null);
    const next = await connectLocalHardware();
    setState(next);
    setBusy(false);
    if (next.connected) setNotice(`Local bridge connected; ${next.printers.length} printer(s) found.`);
    else if (!next.qzAvailable && !next.error) setNotice(qzScriptError ? "QZ Tray browser library failed to load." : "QZ Tray is not installed or unavailable in this browser.");
  }

  async function testPrint() {
    if (!settings.printer) return setNotice("Select a printer first.");
    setBusy(true);
    try {
      await printThroughLocalBridge(settings.printer, "Orithos POS hardware test\n\n");
      setNotice("Print job submitted to the local bridge. Confirm output at the printer.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Print job failed.");
    } finally {
      setBusy(false);
    }
  }

  async function readScale() {
    const serial = (navigator as Navigator & { serial?: DiagnosticSerialApi }).serial;
    if (!serial) return setNotice("Web Serial is unavailable in this browser; confirm the scale model and supported driver.");
    const controller = new AbortController();
    scaleAbort.current = controller;
    setScaleReading(true);
    setScaleReader("Waiting for serial device data. Raw output is diagnostic only and is not used for checkout.");
    try {
      const decoder = new TextDecoder();
      await readSerialDiagnostic(serial, (value) => {
        setScaleReader((current) => `${current ?? ""}${decoder.decode(value, { stream: true })}`.slice(-160));
      }, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) setNotice(cause instanceof Error ? cause.message : "Scale connection failed.");
    } finally {
      if (scaleAbort.current === controller) scaleAbort.current = null;
      setScaleReading(false);
    }
  }

  function stopScaleRead() {
    scaleAbort.current?.abort();
    setNotice("Scale diagnostic stopped. The serial port is being closed.");
  }

  const devices = [
    { name: "Barcode scanner", icon: ScanBarcode, status: "USB HID keyboard mode", detail: "POS receives keyboard wedge scans. RS232/COM scanner mode is not supported yet. Switch to USB HID mode if the scanner supports it.", tone: "text-emerald-800 bg-emerald-50" },
    { name: "Receipt printer", icon: Printer, status: state.connected ? `${state.printers.length} printer(s) found` : "Connect the local bridge", detail: "USB and network printers appear when the terminal bridge is connected.", tone: state.connected ? "text-emerald-800 bg-emerald-50" : "text-amber-900 bg-amber-50" },
    { name: "Cash drawer", icon: Cable, status: settings.cashDrawer ? "Preference saved; not tested" : "Not configured", detail: "The drawer is only marked as attached to the printer. No drawer pulse is sent until the printer model and pulse are validated.", tone: "text-amber-900 bg-amber-50" },
    { name: "Linkly EFTPOS", icon: CreditCard, status: "Adapter required; payments disabled", detail: "The supported connection depends on terminal model and acquiring bank. No payment is recorded by this page.", tone: "text-amber-900 bg-amber-50" },
    { name: "Customer display", icon: ScreenShare, status: "Same-browser display available", detail: "Open the display from the register menu. Live cart data syncs between tabs in this browser profile.", tone: "text-emerald-800 bg-emerald-50" },
    { name: "Barcode label printer", icon: Printer, status: "Browser label workflow available", detail: "Generate labels from Barcodes and print with the system dialog; printer-specific profiles are not configured.", tone: "text-amber-900 bg-amber-50" },
    { name: "Electronic scales", icon: Scale, status: "Model-specific adapter required", detail: "No scale protocol is configured. Unverified scale values cannot be used for sales.", tone: "text-slate-700 bg-slate-100" },
    { name: "Terminal network", icon: Cable, status: online ? "Browser online" : "Connection unknown", detail: "The register requires internet access to complete sales.", tone: "text-slate-700 bg-slate-100" },
  ];

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold text-[var(--oh-text)]">Local hardware bridge</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Install QZ Tray on this POS terminal to access local printers. The first connection may require a trust prompt.</p></div>
          <div className="flex flex-wrap gap-2">
            <a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium"><ExternalLink size={15} /> Get QZ Tray</a>
            <button type="button" onClick={() => void connect()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw size={15} className={busy ? "animate-spin" : undefined} /> {busy ? "Connecting…" : "Connect local bridge"}</button>
          </div>
        </div>
        {state.error && <p role="alert" className="mt-3 text-sm text-red-800">{state.error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-[var(--oh-text-secondary)]">{notice}</p>}
        {state.connected && <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-sm font-medium">Receipt printer<select value={settings.printer} onChange={(event) => saveSettings({ ...settings, printer: event.target.value })} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-3"><option value="">Select local printer</option>{state.printers.map((printer) => <option key={printer} value={printer}>{printer}</option>)}</select></label>
          <button type="button" onClick={() => void testPrint()} disabled={busy || !settings.printer} className="mt-auto min-h-10 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50">Print test</button>
          <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={settings.cashDrawer} onChange={(event) => saveSettings({ ...settings, cashDrawer: event.target.checked })} />Cash drawer attached to selected printer</label>
        </div>}
      </section>

      <section aria-labelledby="hardware-devices-title">
        <div className="mb-3 flex items-end justify-between gap-2"><div><h2 id="hardware-devices-title" className="text-sm font-semibold text-[var(--oh-text)]">Device readiness</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Results reflect this browser and terminal only.</p></div><span className="text-xs text-[var(--oh-muted)]">{devices.length} devices</span></div>
        <ul className="grid gap-3 sm:grid-cols-2">{devices.map(({ name, icon: Icon, status, detail, tone }) => <li key={name} className="flex min-w-0 gap-3 rounded-lg border border-[var(--oh-border)] bg-white p-4"><Icon size={19} className="mt-0.5 shrink-0 text-[var(--oh-primary)]" aria-hidden="true" /><div className="min-w-0"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-[var(--oh-text)]">{name}</h3><span className={`rounded px-2 py-1 text-xs font-medium ${tone}`}>{status}</span></div><p className="mt-1 text-sm leading-5 text-[var(--oh-muted)]">{detail}</p></div></li>)}</ul>
      </section>

      <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-[var(--oh-text)]">Scanner and device checks</h2>
        <label className="mt-3 grid max-w-lg gap-1 text-sm font-medium">Barcode input check<input value={scanTest} onChange={(event) => setScanTest(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && scanTest.trim()) { markBarcodeScannerTested(); setNotice(`Barcode input captured: ${scanTest.trim()}`); } }} placeholder="Focus here and scan a barcode" className="h-11 rounded-md border border-[var(--oh-border)] px-3 font-normal" autoComplete="off" /></label>
        <p className="mt-2 text-xs text-[var(--oh-muted)]">This confirms input reached the field; it does not distinguish a scanner from typing. BarcodeDetector: {supportsBarcodeDetection() ? "available for camera scans" : "not available in this browser"}.</p>
        <div className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium">Linkly terminal model<input value={settings.linklyTerminal} onChange={(event) => saveSettings({ ...settings, linklyTerminal: event.target.value })} placeholder="e.g. terminal model" className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal" /></label>
          <label className="grid gap-1 text-sm font-medium">Acquiring bank<input value={settings.linklyAcquirer} onChange={(event) => saveSettings({ ...settings, linklyAcquirer: event.target.value })} placeholder="Bank or acquirer" className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal" /></label>
          <label className="grid gap-1 text-sm font-medium">Connection method<select value={settings.linklyConnection} onChange={(event) => saveSettings({ ...settings, linklyConnection: event.target.value })} className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-3"><option value="">Select connection</option><option value="ethernet">Ethernet / LAN</option><option value="usb">USB</option><option value="linkly-software">Linkly software on this terminal</option><option value="unknown">Unknown</option></select></label>
        </div>
        <p className="mt-2 text-sm text-amber-900">These details are saved in this browser for integration planning only. Linkly payments remain disabled and are not recorded by this POS.</p>
      </section>

      <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-[var(--oh-text)]">Electronic scale connection check</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Web Serial diagnostic at fixed 9600 baud. Use only if that matches the scale manual; output is never used for sale quantity or price.</p></div><div className="flex gap-2"><button type="button" onClick={() => void readScale()} disabled={scaleReading} className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50">Connect scale reader</button>{scaleReading && <button type="button" onClick={stopScaleRead} className="min-h-10 rounded-md border border-red-300 px-3 text-sm font-semibold text-red-800">Stop reader</button>}</div></div>
        {scaleReader && <pre role="status" className="mt-3 max-h-32 overflow-auto rounded-md bg-[var(--oh-surface)] p-3 text-xs">{scaleReader}</pre>}
        <p className="mt-2 text-xs text-amber-900">Scale readings are diagnostic only and never set a sale quantity or price.</p>
      </section>
      <Script src="https://cdn.jsdelivr.net/npm/qz-tray@2.3.0/qz-tray.js" strategy="afterInteractive" onError={() => setQzScriptError(true)} />
    </div>
  );
}
