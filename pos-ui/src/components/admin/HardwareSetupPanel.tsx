"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { ExternalLink, RefreshCw, Save } from "lucide-react";
import {
  connectLocalHardware,
  formatCashDrawerKickCode,
  getHardwareReadinessSnapshot,
  getLocalHardwareSettingsSnapshot,
  parseLocalHardwareSettings,
  type HardwareReadinessItem,
  printReceiptTestThroughLocalBridge,
  readSerialDiagnostic,
  saveLocalHardwareSettings,
  subscribeLocalHardwareSettings,
  testOpenCashDrawer,
  type DiagnosticSerialApi,
  type HardwareSettings,
  type LocalHardwareState,
  supportsBarcodeDetection,
  markBarcodeScannerTested,
} from "@/lib/local-hardware";

const emptySettings: HardwareSettings = {
  printer: "",
  cashDrawer: false,
  printerBrand: "epson",
  cashDrawerPin: "0",
  cutDelayMs: 500,
  linklyTerminal: "",
  linklyAcquirer: "",
  linklyConnection: "",
};

export function HardwareSetupPanel() {
  const settingsSnapshot = useSyncExternalStore(subscribeLocalHardwareSettings, getLocalHardwareSettingsSnapshot, () => "");
  const readinessSnapshot = useSyncExternalStore(subscribeLocalHardwareSettings, getHardwareReadinessSnapshot, () => "");
  const savedSettings = settingsSnapshot ? parseLocalHardwareSettings(settingsSnapshot) : emptySettings;
  const readiness: HardwareReadinessItem[] = readinessSnapshot
    ? (JSON.parse(readinessSnapshot) as HardwareReadinessItem[])
    : [];
  const [draft, setDraft] = useState<HardwareSettings>(savedSettings);
  const [state, setState] = useState<LocalHardwareState>({
    bridge: null,
    qzAvailable: false,
    connected: false,
    printers: [],
    error: null,
    hardwareConnectVersion: null,
  });
  const [scanTest, setScanTest] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scaleReader, setScaleReader] = useState<string | null>(null);
  const [scaleReading, setScaleReading] = useState(false);
  const scaleAbort = useRef<AbortController | null>(null);
  const [qzScriptError, setQzScriptError] = useState(false);
  const autoConnectAttempted = useRef(false);

  useEffect(() => {
    setDraft(settingsSnapshot ? parseLocalHardwareSettings(settingsSnapshot) : emptySettings);
  }, [settingsSnapshot]);

  useEffect(() => () => scaleAbort.current?.abort(), []);

  useEffect(() => {
    if (autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;
    void connect().catch(() => undefined);
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedSettings);

  function saveDraft() {
    try {
      saveLocalHardwareSettings(draft);
      setNotice("Hardware connect settings saved on this register.");
    } catch {
      setNotice("Browser storage is unavailable; settings were not saved.");
    }
  }

  async function connect() {
    setBusy(true);
    setNotice(null);
    try {
      const next = await connectLocalHardware();
      setState(next);
      if (next.connected) {
        setDraft((current) => {
          let printer = current.printer;
          if (printer && next.printers.includes(printer)) {
            /* keep */
          } else if (savedSettings.printer && next.printers.includes(savedSettings.printer)) {
            printer = savedSettings.printer;
          } else if (next.printers.length === 1) {
            printer = next.printers[0];
          }
          const cashDrawer = savedSettings.printer ? current.cashDrawer : current.cashDrawer || true;
          return printer !== current.printer || cashDrawer !== current.cashDrawer
            ? { ...current, printer, cashDrawer }
            : current;
        });
      }
      if (next.bridge === "orithos-hc") {
        setNotice(`Orithos Hardware Connect ${next.hardwareConnectVersion ?? ""} · ${next.printers.length} printer(s) found.`.trim());
      } else if (next.connected) {
        setNotice(`QZ Tray connected; ${next.printers.length} printer(s) found.`);
      } else if (next.error) {
        setNotice(next.error);
      } else if (!next.qzAvailable && !next.error) {
        setNotice(
          qzScriptError
            ? "Start Orithos Hardware Connect on this PC, or install QZ Tray, then connect again."
            : "Orithos Hardware Connect (port 9170) and QZ Tray are not reachable on this register.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function testPrint() {
    setBusy(true);
    try {
      await printReceiptTestThroughLocalBridge(draft);
      setNotice("Test print submitted. Confirm paper and cut at the printer.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Print job failed.");
    } finally {
      setBusy(false);
    }
  }

  async function testDrawer() {
    setBusy(true);
    try {
      const active = dirty ? draft : savedSettings;
      await testOpenCashDrawer(active);
      setNotice("Cash drawer pulse sent. Confirm the drawer opened.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Cash drawer test failed.");
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

  const activePrinter = dirty ? draft.printer : savedSettings.printer;
  const printerReady = Boolean(state.connected && activePrinter && state.printers.includes(activePrinter));
  const printerNames = [...new Set([...state.printers, ...(activePrinter ? [activePrinter] : [])])];
  const readinessToneClass = (tone: HardwareReadinessItem["tone"]) =>
    tone === "ok" ? "bg-emerald-50 text-emerald-900" : tone === "warn" ? "bg-amber-50 text-amber-950" : "bg-slate-100 text-slate-700";

  return (
    <div className="space-y-6">
      <section id="hardware-printer" className="rounded-lg border border-[var(--oh-border)] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--oh-border)] pb-4">
          <div>
            <h2 id="hardware-connect-title" className="text-base font-semibold text-[var(--oh-text)]">
              Hardware connect settings
            </h2>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">
              Local bridge:{" "}
              {state.bridge === "orithos-hc"
                ? `Orithos Hardware Connect ${state.hardwareConnectVersion ?? ""}`.trim()
                : state.bridge === "qz"
                  ? "QZ Tray"
                  : "not connected"}
              {state.connected ? ` · ${state.printers.length} Windows printer(s)` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void testDrawer()}
              disabled={busy || !draft.cashDrawer || !draft.printer}
              className="inline-flex min-h-10 items-center rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50"
            >
              Test open cash drawer
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={!dirty}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save size={15} aria-hidden="true" />
              Save
            </button>
          </div>
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {readiness
            .filter((item) => item.id !== "eftpos")
            .map((item) => {
              const live =
                item.id === "printer" && printerReady
                  ? { status: `Ready · ${activePrinter}`, tone: "ok" as const }
                  : item;
              return (
                <li key={item.id} className={`rounded-md px-3 py-2 text-sm ${readinessToneClass(live.tone)}`}>
                  <span className="block text-xs font-medium opacity-80">{item.label}</span>
                  <span className="font-semibold">{live.status}</span>
                </li>
              );
            })}
        </ul>
        {!state.connected && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
          >
            <p className="font-semibold">Set up the local print agent</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs sm:text-sm">
              <li>
                Install .NET 8 Runtime on this register (optional script:{" "}
                <span className="font-mono">tools\orithos-hardware-connect\install-runtime.ps1</span>).
              </li>
              <li>
                Start <span className="font-mono">Orithos Hardware Connect</span> (dev:{" "}
                <span className="font-mono">run-dev.ps1</span> in the repo).
              </li>
              <li>Click <span className="font-semibold">Connect local bridge</span> above and choose your receipt printer.</li>
            </ol>
          </div>
        )}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {state.bridge !== "orithos-hc" && (
            <a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium">
              <ExternalLink size={15} aria-hidden="true" />
              Get QZ Tray (fallback)
            </a>
          )}
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className={
              state.connected
                ? "inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50"
                : "inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            }
          >
            <RefreshCw size={15} className={busy ? "animate-spin" : undefined} aria-hidden="true" />
            {busy ? "Connecting…" : state.connected ? "Refresh printers" : "Connect local bridge"}
          </button>
        </div>
        {state.bridge !== "orithos-hc" && (
          <p className="mt-2 text-xs text-[var(--oh-muted)]">
            Preferred: on this PC install .NET 8, then run{" "}
            <span className="font-mono">tools\orithos-hardware-connect\run-dev.ps1</span> (listens on{" "}
            <span className="font-mono">127.0.0.1:9170</span>).
          </p>
        )}
        {state.error && <p role="alert" className="mt-3 text-sm text-red-800">{state.error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-[var(--oh-text-secondary)]">{notice}</p>}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Printer
            <select
              value={draft.printer}
              onChange={(event) => setDraft((current) => ({ ...current, printer: event.target.value }))}
              disabled={!state.connected}
              className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-3 disabled:opacity-50"
            >
              <option value="">{state.connected ? "Select local printer" : "Connect bridge to list printers"}</option>
              {printerNames.map((printer) => (
                <option key={printer} value={printer}>
                  {printer}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Cash drawer trigger
            <select
              value={draft.cashDrawerPin}
              onChange={(event) => setDraft((current) => ({ ...current, cashDrawerPin: event.target.value === "1" ? "1" : "0", cashDrawer: true }))}
              className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-3"
            >
              <option value="0">Pin 2 (default)</option>
              <option value="1">Pin 5</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Receipt printer brand
            <select
              value={draft.printerBrand}
              onChange={(event) => {
                const printerBrand = event.target.value === "star" || event.target.value === "generic" ? event.target.value : "epson";
                setDraft((current) => ({ ...current, printerBrand }));
              }}
              className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-3"
            >
              <option value="epson">Epson</option>
              <option value="star">Star</option>
              <option value="generic">Generic ESC/POS</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Cut delay (ms)
            <input
              type="number"
              min={0}
              max={10000}
              step={50}
              value={draft.cutDelayMs}
              onChange={(event) => setDraft((current) => ({ ...current, cutDelayMs: Number(event.target.value) || 0 }))}
              className="h-10 rounded-md border border-[var(--oh-border)] px-3 tabular-nums"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium sm:col-span-2">
            Cash drawer kick code
            <input
              aria-label="Cash drawer kick code"
              readOnly
              value={formatCashDrawerKickCode(draft)}
              className="h-10 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 font-mono text-xs"
              aria-describedby="kick-code-help"
            />
            <span id="kick-code-help" className="text-xs font-normal text-[var(--oh-muted)]">Derived from brand and drawer trigger. Adjust brand or pin if the drawer does not open.</span>
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.cashDrawer}
              onChange={(event) => setDraft((current) => ({ ...current, cashDrawer: event.target.checked }))}
            />
            Cash drawer attached to selected printer
          </label>
          <button
            type="button"
            onClick={() => void testPrint()}
            disabled={busy || !draft.printer}
            className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50 sm:col-span-2 sm:max-w-xs"
          >
            Print test receipt
          </button>
        </div>
      </section>

      <details id="hardware-optional-tests" className="rounded-lg border border-dashed border-[var(--oh-border)] bg-white px-4 py-3 sm:px-5">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--oh-text)]">Optional · Scanner & scale tests</summary>
        <p className="mt-2 text-xs text-[var(--oh-muted)]">
          USB barcode scanners work as keyboard input on Sell. EFTPOS setup is in Step 2 below.
        </p>
        <label className="mt-4 grid max-w-lg gap-1 text-sm font-medium">
          Barcode input check
          <input
            value={scanTest}
            onChange={(event) => setScanTest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && scanTest.trim()) {
                markBarcodeScannerTested();
                setNotice(`Barcode input captured: ${scanTest.trim()}`);
              }
            }}
            placeholder="Focus here and scan a barcode"
            className="h-11 rounded-md border border-[var(--oh-border)] px-3 font-normal"
            autoComplete="off"
          />
        </label>
        <p className="mt-2 text-xs text-[var(--oh-muted)]">
          BarcodeDetector: {supportsBarcodeDetection() ? "available" : "not available in this browser"}.
        </p>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-t border-[var(--oh-border)] pt-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--oh-text)]">Electronic scale (diagnostic)</h3>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">9600 baud Web Serial · not used for pricing.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void readScale()} disabled={scaleReading} className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50">
              Connect scale reader
            </button>
            {scaleReading && (
              <button type="button" onClick={stopScaleRead} className="min-h-10 rounded-md border border-red-300 px-3 text-sm font-semibold text-red-800">
                Stop reader
              </button>
            )}
          </div>
        </div>
        {scaleReader && (
          <pre role="status" className="mt-3 max-h-32 overflow-auto rounded-md bg-[var(--oh-surface)] p-3 text-xs">
            {scaleReader}
          </pre>
        )}
      </details>
      <Script
        src="https://cdn.jsdelivr.net/npm/qz-tray@2.3.0/qz-tray.js"
        strategy="afterInteractive"
        onLoad={() => void connect().catch(() => undefined)}
        onError={() => setQzScriptError(true)}
      />
    </div>
  );
}