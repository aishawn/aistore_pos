"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Script from "next/script";
import { ExternalLink, RefreshCw, Save } from "lucide-react";
import {
  connectLocalHardware,
  formatCashDrawerKickCode,
  isQzTrayFallbackEnabled,
  getLocalHardwareSettingsSnapshot,
  hasBarcodeScannerTested,
  parseLocalHardwareSettings,
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
  fetchShelfExportPathsFromAgent,
  saveShelfExportPathsToAgent,
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
  docketTagRoutes: {},
  shelfTemplateDirectory: "",
  shelfExportDirectory: "",
  linklyTerminal: "",
  linklyAcquirer: "",
  linklyConnection: "",
};

export function HardwareSetupPanel() {
  const settingsSnapshot = useSyncExternalStore(subscribeLocalHardwareSettings, getLocalHardwareSettingsSnapshot, () => "");
  const scannerVerified =
    useSyncExternalStore(
      subscribeLocalHardwareSettings,
      () => (hasBarcodeScannerTested() ? "1" : "0"),
      () => "0",
    ) === "1";
  const savedSettings = settingsSnapshot ? parseLocalHardwareSettings(settingsSnapshot) : emptySettings;
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

  useEffect(() => {
    if (!state.connected || state.bridge !== "orithos-hc") return;
    void fetchShelfExportPathsFromAgent().then((paths) => {
      if (!paths) return;
      setDraft((current) => ({
        ...current,
        shelfTemplateDirectory: current.shelfTemplateDirectory || paths.templateDirectory,
        shelfExportDirectory: current.shelfExportDirectory || paths.exportDirectory || paths.defaultExportDirectory || "",
      }));
    });
  }, [state.connected, state.bridge]);

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
  const bridgeLabel =
    state.bridge === "orithos-hc"
      ? `Hardware Connect ${state.hardwareConnectVersion ?? ""}`.trim()
      : state.bridge === "qz"
        ? "QZ Tray"
        : null;

  return (
    <div className="space-y-6">
      <section id="hardware-connect" className="sr-only" aria-hidden="true" />
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
          <div className="text-right">
            <button
              type="button"
              onClick={saveDraft}
              disabled={!dirty}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save size={15} aria-hidden="true" />
              Save
            </button>
            <p className="mt-1 max-w-[14rem] text-[11px] leading-snug text-[var(--oh-muted)]">Saved on this PC only (this browser).</p>
          </div>
        </div>

        {state.bridge !== "orithos-hc" && !state.connected ? (
          <div
            role="status"
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"
          >
            <HardwareConnectInstallCard stepsCollapsed />
          </div>
        ) : null}
        {state.connected && state.bridge !== "orithos-hc" && isQzTrayFallbackEnabled() ? (
          <p className="mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text)]">
            Using QZ Tray.{" "}
            <span className="font-medium">Orithos Hardware Connect</span> is recommended — install it above, then reconnect.
          </p>
        ) : null}
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
              {connectBusy ? "Connecting…" : "Connect on this PC"}
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

          <details className="rounded-md border border-[var(--oh-border)] px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-[var(--oh-text)]">Cash drawer not opening?</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-[var(--oh-muted)]">
              <li>Run <span className="font-medium text-[var(--oh-text)]">Test receipt</span> first — the drawer pulse uses the receipt printer.</li>
              <li>Confirm paper, USB/power, and the RJ12 cable from printer to drawer.</li>
              <li>Clear the Windows print queue for this printer, then test again.</li>
              <li>Restart the printer and Hardware Connect (tray icon), then reconnect on this page.</li>
            </ol>
          </details>

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
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-[var(--oh-text)]">Docket by product tag</p>
                <p className="mt-1 text-xs text-[var(--oh-muted)]">
                  Match Shopfront tag names (e.g. Coffee). Uses product Shopfront category when present.
                </p>
                {Object.entries(draft.docketTagRoutes).map(([tag, printer]) => (
                  <div key={tag} className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={tag}
                      readOnly
                      className="h-9 min-w-[6rem] rounded-md border border-[var(--oh-border)] px-2 text-sm"
                    />
                    <select
                      value={printer}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          docketTagRoutes: { ...current.docketTagRoutes, [tag]: event.target.value },
                        }))
                      }
                      className="h-9 min-w-[10rem] flex-1 rounded-md border border-[var(--oh-border)] px-2 text-sm"
                    >
                      {printerNames.map((name) => (
                        <option key={`${tag}-${name}`} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-xs font-medium text-red-700"
                      onClick={() =>
                        setDraft((current) => {
                          const next = { ...current.docketTagRoutes };
                          delete next[tag];
                          return { ...current, docketTagRoutes: next };
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-[var(--oh-primary)]"
                  onClick={() => {
                    const label = window.prompt("Product tag name");
                    if (!label?.trim()) return;
                    const printer = draft.docketPrinter || draft.printer || printerNames[0] || "";
                    setDraft((current) => ({
                      ...current,
                      docketTagRoutes: { ...current.docketTagRoutes, [label.trim()]: printer },
                    }));
                  }}
                >
                  Add tag route
                </button>
              </div>
            </div>
          </details>

          <details className="rounded-md border border-[var(--oh-border)] px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-[var(--oh-text)]">Shelf ticket export (Hardware Connect)</summary>
            <p className="mt-2 text-xs text-[var(--oh-muted)]">
              Ticket printing in Orithos uses the browser. Export folder is for IT shelf workflows (Shopfront-style).
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Template folder (read-only on PC)
                <input
                  value={draft.shelfTemplateDirectory}
                  onChange={(event) => setDraft((current) => ({ ...current, shelfTemplateDirectory: event.target.value }))}
                  className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal"
                  placeholder="C:\ShelfTickets\templates"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Export folder
                <input
                  value={draft.shelfExportDirectory}
                  onChange={(event) => setDraft((current) => ({ ...current, shelfExportDirectory: event.target.value }))}
                  className="h-10 rounded-md border border-[var(--oh-border)] px-3 font-normal"
                  placeholder="%LocalAppData%\Orithos\HardwareConnect\shelf-export"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!state.connected || actionBusy}
              onClick={() =>
                void saveShelfExportPathsToAgent(draft.shelfTemplateDirectory, draft.shelfExportDirectory)
                  .then(() => setNotice("Shelf export paths saved on this PC."))
                  .catch((cause) => setNotice(cause instanceof Error ? cause.message : "Could not save shelf paths."))
              }
              className="mt-3 min-h-9 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50"
            >
              Save paths to local agent
            </button>
          </details>
        </div>
      </section>

      <section id="hardware-scanner" className="rounded-lg border border-[var(--oh-border)] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--oh-text)]">Barcode scanner</h2>
            <p className="mt-1 text-xs text-[var(--oh-muted)]">
              USB keyboard mode — plug in the scanner; no Hardware Connect or pairing.
            </p>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              scannerVerified
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            {scannerVerified ? "Input verified on this PC" : "Not verified yet"}
          </span>
        </div>
        <label className="mt-4 grid max-w-lg gap-1 text-sm font-medium">
          Scan test
          <input
            value={scanTest}
            onChange={(event) => setScanTest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && scanTest.trim()) {
                markBarcodeScannerTested();
                setNotice(`Barcode input captured: ${scanTest.trim()}`);
              }
            }}
            placeholder="Click here, then scan a product barcode"
            className="h-11 rounded-md border border-[var(--oh-border)] px-3 font-normal"
            autoComplete="off"
          />
        </label>
        <p className="mt-2 text-xs text-[var(--oh-muted)]">
          If characters appear when you scan, the scanner is connected. Press Enter after scan (or set scanner suffix to Enter).
          Sell search uses the same input path.
        </p>
        <details className="mt-3 rounded-md border border-[var(--oh-border)] px-3 py-2 text-xs text-[var(--oh-muted)]">
          <summary className="cursor-pointer font-medium text-[var(--oh-text)]">Scanner setup tips</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Use HID keyboard mode with an Enter suffix after each scan (Zebra: scan the CR barcodes in the quick-start guide).</li>
            <li>If scans stay in the search bar, the suffix is missing — rescan the Enter setup barcodes.</li>
            <li>Leading zeros on barcodes must be preserved; test with a known product.</li>
          </ul>
        </details>
      </section>

      <details id="hardware-optional-tests" className="rounded-lg border border-[var(--oh-border)] bg-white px-4 py-3 sm:px-5">
        <summary className="cursor-pointer text-sm font-medium text-[var(--oh-text)]">Electronic scale (diagnostic)</summary>
        <p className="mt-2 text-xs text-[var(--oh-muted)]">
          Optional Web Serial check — not used for checkout pricing. BarcodeDetector (camera):{" "}
          {supportsBarcodeDetection() ? "available" : "not available in this browser"}.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--oh-muted)]">9600 baud Web Serial</p>
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