"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { ExternalLink, RefreshCw, Save } from "lucide-react";
import {
  connectLocalHardware,
  formatCashDrawerKickCode,
  getHardwareReadinessSnapshot,
  isQzTrayFallbackEnabled,
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
import { HardwareConnectInstallCard } from "@/components/admin/HardwareConnectInstallCard";
import { useHardwareLoopbackReady } from "@/components/admin/hardware-loopback-context";

const emptySettings: HardwareSettings = {
  printer: "",
  cashDrawer: false,
  printerBrand: "epson",
  cashDrawerPin: "0",
  cutDelayMs: 500,
  autoPrintReceiptOnSale: true,
  autoOpenDrawerOnCashSale: true,
  printDocketOnSale: false,
  docketPrinter: "",
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
  const [connectBusy, setConnectBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const busy = connectBusy || actionBusy;
  const [scaleReader, setScaleReader] = useState<string | null>(null);
  const [scaleReading, setScaleReading] = useState(false);
  const scaleAbort = useRef<AbortController | null>(null);
  const [qzScriptError, setQzScriptError] = useState(false);
  const [loadQzFallback, setLoadQzFallback] = useState(false);
  const autoConnectAttempted = useRef(false);
  const loopbackReady = useHardwareLoopbackReady();

  function applyBridgeFallback(next: LocalHardwareState) {
    if (next.bridge === "orithos-hc") {
      setLoadQzFallback(false);
      return;
    }
    if (!next.connected && isQzTrayFallbackEnabled()) {
      setLoadQzFallback(true);
    }
  }

  useEffect(() => {
    setDraft(settingsSnapshot ? parseLocalHardwareSettings(settingsSnapshot) : emptySettings);
  }, [settingsSnapshot]);

  useEffect(() => () => scaleAbort.current?.abort(), []);

  useEffect(() => {
    if (!loopbackReady || autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;
    void connect().catch(() => undefined);
  }, [loopbackReady]);

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
    setConnectBusy(true);
    setNotice(null);
    try {
      const next = await connectLocalHardware();
      setState(next);
      applyBridgeFallback(next);
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
          isQzTrayFallbackEnabled() && qzScriptError
            ? "Start Orithos Hardware Connect on this PC, or install QZ Tray, then connect again."
            : "Start Orithos Hardware Connect on this PC (tray icon), allow local network access in the browser, then connect again.",
        );
      }
    } finally {
      setConnectBusy(false);
    }
  }

  async function testPrint() {
    setActionBusy(true);
    try {
      await printReceiptTestThroughLocalBridge(draft);
      setNotice("Test print submitted. Confirm paper and cut at the printer.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Print job failed.");
    } finally {
      setActionBusy(false);
    }
  }

  async function testDrawer() {
    setActionBusy(true);
    try {
      const active = dirty ? draft : savedSettings;
      await testOpenCashDrawer(active);
      setNotice("Cash drawer pulse sent. Confirm the drawer opened.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Cash drawer test failed.");
    } finally {
      setActionBusy(false);
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
  const printerNames = [...new Set([...state.printers, ...(activePrinter ? [activePrinter] : [])])];
  const readinessToneClass = (tone: HardwareReadinessItem["tone"]) =>
    tone === "ok" ? "bg-emerald-50 text-emerald-900" : tone === "warn" ? "bg-amber-50 text-amber-950" : "bg-slate-100 text-slate-700";

  const bridgeLabel =
    state.bridge === "orithos-hc"
      ? `Hardware Connect ${state.hardwareConnectVersion ?? ""}`.trim()
      : state.bridge === "qz"
        ? "QZ Tray"
        : null;

  return (
    <div className="space-y-6">
      <section id="hardware-printer" className="rounded-lg border border-[var(--oh-border)] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--oh-border)] pb-4">
          <div>
            <h2 id="hardware-connect-title" className="text-base font-semibold text-[var(--oh-text)]">
              Receipt printer
            </h2>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">
              {state.connected && bridgeLabel ? (
                <>
                  <span className="font-medium text-emerald-800">{bridgeLabel}</span>
                  <span className="text-[var(--oh-muted)]"> · {state.printers.length} printer(s) on this PC</span>
                </>
              ) : (
                "Connect the local bridge on this register, then choose your receipt printer."
              )}
            </p>
          </div>
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

        {!state.connected && readiness.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {readiness
              .filter((item) => item.id !== "eftpos")
              .map((item) => (
                <li key={item.id} className={`rounded-full px-3 py-1 text-xs font-medium ${readinessToneClass(item.tone)}`}>
                  {item.label}: {item.status}
                </li>
              ))}
          </ul>
        ) : null}
        {state.bridge !== "orithos-hc" && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"
          >
            {state.connected && isQzTrayFallbackEnabled() ? (
              <p className="text-sm font-semibold">Optional: switch to Orithos Hardware Connect (preferred over QZ Tray).</p>
            ) : !state.connected ? (
              <HardwareConnectInstallCard />
            ) : null}
            <details className="mt-3 text-xs text-amber-950/90">
              <summary className="cursor-pointer font-medium">IT: publish installer to this site</summary>
              <p className="mt-1 font-mono leading-5">
                tools\orithos-hardware-connect\stage-ui-download.ps1 → pos-ui/public/downloads (then deploy)
              </p>
            </details>
          </div>
        )}
        {!state.connected ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {loadQzFallback && state.bridge !== "orithos-hc" && (
              <a href="https://qz.io/download/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium">
                <ExternalLink size={15} aria-hidden="true" />
                QZ Tray (fallback)
              </a>
            )}
            <button
              type="button"
              onClick={() => void connect()}
              disabled={connectBusy}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw size={15} className={connectBusy ? "animate-spin" : undefined} aria-hidden="true" />
              {connectBusy ? "Connecting…" : "Connect local bridge"}
            </button>
          </div>
        ) : null}
        {state.error && <p role="alert" className="mt-3 text-sm text-red-800">{state.error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-[var(--oh-text-secondary)]">{notice}</p>}

        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-[min(100%,20rem)] flex-1 gap-1 text-sm font-medium">
              Receipt printer
              <select
                value={draft.printer}
                onChange={(event) => setDraft((current) => ({ ...current, printer: event.target.value }))}
                disabled={!state.connected}
                className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-3 disabled:opacity-50"
              >
                <option value="">{state.connected ? "Select printer" : "Connect bridge first"}</option>
                {printerNames.map((printer) => (
                  <option key={printer} value={printer}>
                    {printer}
                  </option>
                ))}
              </select>
            </label>
            {state.connected ? (
              <button
                type="button"
                onClick={() => void connect()}
                disabled={connectBusy}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-muted)] disabled:opacity-50"
              >
                <RefreshCw size={14} className={connectBusy ? "animate-spin" : undefined} aria-hidden="true" />
                Refresh list
              </button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.autoPrintReceiptOnSale}
                onChange={(event) => setDraft((current) => ({ ...current, autoPrintReceiptOnSale: event.target.checked }))}
              />
              Auto-print receipt at checkout
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.autoOpenDrawerOnCashSale}
                onChange={(event) => setDraft((current) => ({ ...current, autoOpenDrawerOnCashSale: event.target.checked }))}
              />
              Open cash drawer on cash sales
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.cashDrawer}
                onChange={(event) => setDraft((current) => ({ ...current, cashDrawer: event.target.checked }))}
              />
              Cash drawer on this printer
            </label>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--oh-border)] pt-4">
            <button
              type="button"
              onClick={() => void testPrint()}
              disabled={busy || !draft.printer}
              className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50"
            >
              Test receipt
            </button>
            <button
              type="button"
              onClick={() => void testDrawer()}
              disabled={busy || !draft.cashDrawer || !draft.printer}
              className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50"
            >
              Test drawer
            </button>
          </div>

          <details className="rounded-md border border-[var(--oh-border)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-[var(--oh-text)]">More · brand, drawer pin, docket</summary>
            <div className="mt-3 grid gap-3 pb-1 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Printer brand
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
                Cash drawer pin
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
                Drawer kick code
                <input
                  aria-label="Cash drawer kick code"
                  readOnly
                  value={formatCashDrawerKickCode(draft)}
                  className="h-10 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 font-mono text-xs"
                />
                <span className="text-xs font-normal text-[var(--oh-muted)]">Change brand or pin if the drawer does not open.</span>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.printDocketOnSale}
                  onChange={(event) => setDraft((current) => ({ ...current, printDocketOnSale: event.target.checked }))}
                />
                Also print kitchen docket at checkout
              </label>
              {draft.printDocketOnSale ? (
                <label className="grid gap-1 text-sm font-medium sm:col-span-2">
                  Docket printer
                  <select
                    value={draft.docketPrinter}
                    onChange={(event) => setDraft((current) => ({ ...current, docketPrinter: event.target.value }))}
                    disabled={!state.connected}
                    className="h-10 rounded-md border border-[var(--oh-border)] bg-white px-3 disabled:opacity-50"
                  >
                    <option value="">Same as receipt</option>
                    {printerNames.map((printer) => (
                      <option key={`docket-${printer}`} value={printer}>
                        {printer}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </details>
        </div>
      </section>

      <details id="hardware-optional-tests" className="rounded-lg border border-dashed border-[var(--oh-border)] bg-white px-4 py-3 sm:px-5">
        <summary className="cursor-pointer text-sm font-medium text-[var(--oh-muted)]">Scanner & scale tests</summary>
        <p className="mt-2 text-xs text-[var(--oh-muted)]">USB scanners type into Sell like a keyboard — no setup needed here.</p>
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
      {loopbackReady && loadQzFallback ? (
        <Script
          src="https://cdn.jsdelivr.net/npm/qz-tray@2.3.0/qz-tray.js"
          strategy="lazyOnload"
          onLoad={() => void connect().catch(() => undefined)}
          onError={() => setQzScriptError(true)}
        />
      ) : null}
    </div>
  );
}