"use client";

import { hasFreshEftposDiagnostics, hasRecentApprovedEftposTest, isAdapterMode } from "@/lib/eftpos-readiness-core";

const ORITHOS_HARDWARE_CONNECT_BASE = "http://127.0.0.1:9170";
const LOOPBACK_PROBE_MS = 2_500;
const LOCAL_BRIDGE_CONNECT_MS = 8_000;
const LINKLY_DISCOVERY_TIMEOUT_MS = 15_000;

/** Shopfront-style default: only Orithos Hardware Connect; set NEXT_PUBLIC_ORITHOS_QZ_FALLBACK=true for legacy QZ. */
export function isQzTrayFallbackEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ORITHOS_QZ_FALLBACK?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

type LoopbackRequestInit = RequestInit & { targetAddressSpace?: "loopback" | "local" | "public" };

function loopbackHardwareConnectFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOPBACK_PROBE_MS);
  const request: LoopbackRequestInit = {
    cache: "no-store",
    mode: "cors",
    targetAddressSpace: "loopback",
    signal: controller.signal,
    ...init,
  };
  return fetch(`${ORITHOS_HARDWARE_CONNECT_BASE}${path}`, request).finally(() => clearTimeout(timer));
}

export type LinklyLocalDiscovery = {
  state: "adapter-candidate-found" | "linkly-client-found" | "not-found";
  linklyProcesses: string[];
  linklyPort2005Listening: boolean;
  httpCandidates: { port: number; baseUrl: string; healthPath: string; statusCode: number; jsonKeys: string[] }[];
  checkedAtUtc: string;
};

export async function detectLocalLinkly(): Promise<LinklyLocalDiscovery> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINKLY_DISCOVERY_TIMEOUT_MS);
  const request: LoopbackRequestInit = {
    cache: "no-store",
    mode: "cors",
    targetAddressSpace: "loopback",
    signal: controller.signal,
  };

  try {
    const response = await fetch(`${ORITHOS_HARDWARE_CONNECT_BASE}/v1/linkly-diagnostics`, request);
    if (!response.ok) throw new Error(`Linkly detection failed (${response.status}).`);
    return await response.json() as LinklyLocalDiscovery;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new Error("Linkly detection timed out. Check that Hardware Connect is running, then try again.");
    }
    throw cause instanceof Error ? cause : new Error("Could not read Linkly detection results from this PC.");
  } finally {
    clearTimeout(timer);
  }
}

function withBridgeTimeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out. Is the local agent running?`)), LOCAL_BRIDGE_CONNECT_MS);
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

async function probeOrithosHardwareConnect(): Promise<{
  reachable: boolean;
  printers: string[];
  version: string | null;
  error: string | null;
}> {
  try {
    const health = await loopbackHardwareConnectFetch("/v1/health");
    if (!health.ok) {
      return { reachable: false, printers: [], version: null, error: `Hardware Connect health check failed (${health.status}).` };
    }
    const healthBody = (await health.json()) as { version?: string };
    const printerRes = await loopbackHardwareConnectFetch("/v1/printers");
    if (!printerRes.ok) {
      return {
        reachable: true,
        printers: [],
        version: healthBody.version ?? null,
        error: `Hardware Connect is running, but printer discovery failed (${printerRes.status}). Check the Windows print service and reconnect.`,
      };
    }
    const printerBody = (await printerRes.json()) as { printers?: string[] };
    return {
      reachable: true,
      printers: printerBody.printers ?? [],
      version: healthBody.version ?? null,
      error: null,
    };
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      return { reachable: false, printers: [], version: null, error: "Hardware Connect did not respond within 2.5 seconds. Start the tray app and try again." };
    }
    return {
      reachable: false,
      printers: [],
      version: null,
      error: "The browser could not reach Hardware Connect. Confirm this page is HTTPS, allow local network access, and check the tray app is running.",
    };
  }
}

async function hardwareConnectFailureMessage(response: Response, action: string): Promise<string> {
  try {
    const body = (await response.clone().json()) as { error?: string; title?: string; detail?: string };
    const detail = body.error ?? body.detail ?? body.title;
    if (detail) return `${action}: ${detail}`;
  } catch {
    /* ignore */
  }
  return `${action} failed (${response.status})`;
}

async function printTextThroughOrithosHardwareConnect(printer: string, text: string): Promise<void> {
  const response = await loopbackHardwareConnectFetch("/v1/print/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printer, text, encoding: "utf-8" }),
  });
  if (!response.ok) throw new Error(await hardwareConnectFailureMessage(response, "Hardware Connect print"));
}

async function printRawThroughOrithosHardwareConnect(printer: string, bytes: number[]): Promise<void> {
  const response = await loopbackHardwareConnectFetch("/v1/print/raw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printer, bytes }),
  });
  if (!response.ok) throw new Error(await hardwareConnectFailureMessage(response, "Hardware Connect raw print"));
}

type QzTrayApi = {
  websocket: {
    isActive: () => boolean;
    connect: (options?: { retries?: number; delay?: number }) => Promise<void>;
  };
  printers: { find: () => Promise<string[]> };
  configs: { create: (printer: string, options?: Record<string, unknown>) => unknown };
  print: (config: unknown, data: unknown[]) => Promise<void>;
};

declare global {
  interface Window {
    qz?: QzTrayApi;
  }
}

export type LocalBridgeKind = "orithos-hc" | "qz" | null;

export type LocalHardwareState = {
  bridge: LocalBridgeKind;
  qzAvailable: boolean;
  connected: boolean;
  printers: string[];
  error: string | null;
  hardwareConnectVersion: string | null;
};

let activeLocalBridge: LocalBridgeKind = null;
let lastHardwareConnectVersion: string | null = null;

export function resetLocalBridgeStateForTests(): void {
  activeLocalBridge = null;
  lastHardwareConnectVersion = null;
}

export type ReceiptPrinterBrand = "epson" | "star" | "generic";

export type HardwareSettings = {
  printer: string;
  cashDrawer: boolean;
  printerBrand: ReceiptPrinterBrand;
  cashDrawerPin: "0" | "1";
  cutDelayMs: number;
  autoPrintReceiptOnSale: boolean;
  autoOpenDrawerOnCashSale: boolean;
  printDocketOnSale: boolean;
  docketPrinter: string;
  docketTagRoutes: Record<string, string>;
  shelfTemplateDirectory: string;
  shelfExportDirectory: string;
  linklyTerminal: string;
  linklyAcquirer: string;
  linklyConnection: string;
};

const SETTINGS_KEY = "orithos.hardware.settings.v1";
export const BARCODE_SCANNER_TEST_KEY = "orithos-barcode-scanner-tested";
const EMPTY_SETTINGS: HardwareSettings = {
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
const localSettingsListeners = new Set<() => void>();

function notifyLocalHardwareSubscribers(): void {
  if (typeof window === "undefined") return;
  localSettingsListeners.forEach((listener) => listener());
}

export type DiagnosticSerialPort = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
};

export type DiagnosticSerialApi = {
  requestPort: () => Promise<DiagnosticSerialPort>;
};

export async function readSerialDiagnostic(
  serial: DiagnosticSerialApi,
  onChunk: (chunk: Uint8Array) => void,
  signal: AbortSignal,
): Promise<void> {
  const port = await new Promise<DiagnosticSerialPort | null>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      cleanup();
      resolve(null);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }

    void serial.requestPort().then((selectedPort) => {
      cleanup();
      resolve(selectedPort);
    }, (cause: unknown) => {
      cleanup();
      reject(cause);
    });
  });
  if (!port || signal.aborted) return;

  let opened = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const cancelReader = () => { void reader?.cancel().catch(() => undefined); };
  try {
    await port.open({ baudRate: 9600 });
    opened = true;
    if (!port.readable) throw new Error("The selected serial device has no readable stream.");

    reader = port.readable.getReader();
    signal.addEventListener("abort", cancelReader, { once: true });
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) onChunk(value);
    }
  } finally {
    signal.removeEventListener("abort", cancelReader);
    if (reader) {
      if (signal.aborted) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (opened) await port.close();
  }
}

export function supportsBarcodeDetection(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

function finishLocalHardwareConnect(state: LocalHardwareState): LocalHardwareState {
  notifyLocalHardwareSubscribers();
  return state;
}

export async function connectLocalHardware(): Promise<LocalHardwareState> {
  if (typeof window === "undefined" || !window.isSecureContext) {
    activeLocalBridge = null;
    return finishLocalHardwareConnect({
      bridge: null,
      qzAvailable: false,
      connected: false,
      printers: [],
      error: "Use this page on HTTPS to connect local devices.",
      hardwareConnectVersion: null,
    });
  }

  const hardwareConnect = await probeOrithosHardwareConnect();
  if (hardwareConnect.reachable) {
    activeLocalBridge = "orithos-hc";
    lastHardwareConnectVersion = hardwareConnect.version;
    return finishLocalHardwareConnect({
      bridge: "orithos-hc",
      qzAvailable: false,
      connected: true,
      printers: hardwareConnect.printers,
      error: hardwareConnect.error,
      hardwareConnectVersion: hardwareConnect.version,
    });
  }

  if (!isQzTrayFallbackEnabled()) {
    activeLocalBridge = null;
    return finishLocalHardwareConnect({
      bridge: null,
      qzAvailable: false,
      connected: false,
      printers: [],
      error: hardwareConnect.error,
      hardwareConnectVersion: null,
    });
  }

  const qz = window.qz;
  if (!qz) {
    activeLocalBridge = null;
    return finishLocalHardwareConnect({
      bridge: null,
      qzAvailable: false,
      connected: false,
      printers: [],
      error: hardwareConnect.error,
      hardwareConnectVersion: null,
    });
  }

  try {
    if (!qz.websocket.isActive()) {
      await withBridgeTimeout("QZ Tray connection", qz.websocket.connect({ retries: 0, delay: 0 }));
    }
    const printers = await withBridgeTimeout("QZ Tray printer scan", qz.printers.find());
    activeLocalBridge = "qz";
    return finishLocalHardwareConnect({
      bridge: "qz",
      qzAvailable: true,
      connected: true,
      printers,
      error: null,
      hardwareConnectVersion: null,
    });
  } catch (cause) {
    activeLocalBridge = null;
    return finishLocalHardwareConnect({
      bridge: null,
      qzAvailable: true,
      connected: false,
      printers: [],
      error: cause instanceof Error ? cause.message : "Local hardware bridge connection failed.",
      hardwareConnectVersion: null,
    });
  }
}

/** Connects to Orithos Hardware Connect or QZ when the Sell page has not opened Hardware settings yet. */
export async function ensureLocalPrinterBridge(): Promise<boolean> {
  if (isLocalPrinterBridgeActive()) return true;
  await connectLocalHardware();
  return isLocalPrinterBridgeActive();
}

export async function printThroughLocalBridge(printer: string, data: string): Promise<void> {
  if (activeLocalBridge === "orithos-hc") {
    await printTextThroughOrithosHardwareConnect(printer, data);
    return;
  }
  const qz = typeof window !== "undefined" ? window.qz : undefined;
  if (!qz?.websocket.isActive()) throw new Error("Connect the local hardware bridge before printing.");
  await qz.print(qz.configs.create(printer, { encoding: "UTF-8" }), [data]);
}

export function resolveCashDrawerKickBytes(settings: Pick<HardwareSettings, "printerBrand" | "cashDrawerPin">): number[] {
  if (settings.printerBrand === "star") return [7];
  const pin = settings.cashDrawerPin === "1" ? 1 : 0;
  return [27, 112, pin, 25, 250];
}

export function formatCashDrawerKickCode(settings: Pick<HardwareSettings, "printerBrand" | "cashDrawerPin">): string {
  return resolveCashDrawerKickBytes(settings).join(", ");
}

function bytesToQzHex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function printRawBytesThroughLocalBridge(printer: string, bytes: number[]): Promise<void> {
  if (activeLocalBridge === "orithos-hc") {
    await printRawThroughOrithosHardwareConnect(printer, bytes);
    return;
  }
  const qz = typeof window !== "undefined" ? window.qz : undefined;
  if (!qz?.websocket.isActive()) throw new Error("Connect the local hardware bridge before printing.");
  await qz.print(qz.configs.create(printer), [{
    type: "raw",
    format: "command",
    flavor: "hex",
    data: bytesToQzHex(bytes),
  }]);
}

/** ESC/POS receipt job: init + body + feed + cut in one Windows RAW spool job (avoids cut racing ahead of text). */
export function buildEscPosReceiptJob(
  settings: Pick<HardwareSettings, "printerBrand">,
  text: string,
): number[] {
  const ESC = 0x1b;
  const GS = 0x1d;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const payload = normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  const body = Array.from(new TextEncoder().encode(payload));
  const init = [ESC, 0x40];

  if (settings.printerBrand === "star") {
    return [...init, ...body, 27, 100, 3];
  }

  const feedLines = 5;
  return [...init, ...body, ESC, 0x64, feedLines, GS, 0x56, 0];
}

export async function printFormattedReceiptThroughLocalBridge(
  settings: Pick<HardwareSettings, "printer" | "printerBrand">,
  text: string,
): Promise<void> {
  if (!settings.printer) throw new Error("Select a receipt printer first.");
  if (!(await ensureLocalPrinterBridge())) throw new Error("Connect the local hardware bridge before printing.");
  await printRawBytesThroughLocalBridge(settings.printer, buildEscPosReceiptJob(settings, text));
}

export async function testOpenCashDrawer(settings: HardwareSettings): Promise<void> {
  if (!settings.printer) throw new Error("Select a receipt printer first.");
  if (!settings.cashDrawer) throw new Error("Turn on cash drawer for the selected printer first.");
  if (!(await ensureLocalPrinterBridge())) throw new Error("Connect the local hardware bridge before opening the cash drawer.");
  await printRawBytesThroughLocalBridge(settings.printer, resolveCashDrawerKickBytes(settings));
}

/** Test print with feed + cut in the same RAW job as the text (ESC/POS). */
export async function printReceiptTestThroughLocalBridge(settings: HardwareSettings): Promise<void> {
  await printFormattedReceiptThroughLocalBridge(settings, "Orithos POS hardware test\n\n");
}

export type SaleReceiptPlainTextInput = {
  companyName: string;
  reference: string;
  dateLabel: string;
  customerName: string;
  session: string;
  lines: { name: string; quantity: number; total: number; tags?: string[] }[];
  subtotal: number;
  gst: number;
  total: number;
  paymentMethod: string;
  tendered: number;
  change: number;
};

function moneyPlain(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function cleanReceiptField(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
}

export function formatSaleDocketPlainText(
  receipt: Pick<SaleReceiptPlainTextInput, "companyName" | "reference" | "dateLabel" | "session" | "lines" | "customerName">,
): string {
  const lines = receipt.lines
    .map((line) => `${line.quantity} x ${cleanReceiptField(line.name)}`)
    .join("\n");
  return [
    cleanReceiptField(receipt.companyName).toUpperCase(),
    "Docket",
    cleanReceiptField(receipt.reference),
    cleanReceiptField(receipt.dateLabel),
    `Register: ${cleanReceiptField(receipt.session)}`,
    `Customer: ${cleanReceiptField(receipt.customerName)}`,
    "",
    lines,
    "",
    "---",
  ].join("\n");
}

export function formatSaleReceiptPlainText(receipt: SaleReceiptPlainTextInput): string {
  const lines = receipt.lines
    .map((line) => `${cleanReceiptField(line.name)}\n  ${line.quantity} x ${moneyPlain(line.total)}`)
    .join("\n");
  const payment =
    receipt.change > 0
      ? `Method: ${cleanReceiptField(receipt.paymentMethod)}\nCash received: ${moneyPlain(receipt.tendered)}\nChange: ${moneyPlain(receipt.change)}`
      : `Method: ${cleanReceiptField(receipt.paymentMethod)}`;
  return [
    cleanReceiptField(receipt.companyName).toUpperCase(),
    "Sales receipt",
    cleanReceiptField(receipt.reference),
    cleanReceiptField(receipt.dateLabel),
    "",
    `Customer: ${cleanReceiptField(receipt.customerName)}`,
    `Register: ${cleanReceiptField(receipt.session)}`,
    "",
    lines,
    "",
    `Subtotal: ${moneyPlain(receipt.subtotal)}`,
    `Tax: ${moneyPlain(receipt.gst)}`,
    `Total: ${moneyPlain(receipt.total)}`,
    "",
    payment,
    "",
    "Thank you for shopping with us.",
  ].join("\n");
}

export type PrintReceiptDocumentOptions = {
  /** When provided, a configured QZ bridge prints raw text before falling back to the browser dialog. */
  plainText?: string;
  /** When true, never open the browser print dialog (post-checkout automation). */
  bridgeOnly?: boolean;
};

export type PrintReceiptOutcome = {
  channel: "bridge" | "browser" | "skipped";
  ok: boolean;
  message?: string;
};

export async function printReceiptDocument(options?: PrintReceiptDocumentOptions): Promise<PrintReceiptOutcome> {
  if (typeof window === "undefined") {
    return { channel: "skipped", ok: false, message: "Printing is only available in the browser." };
  }

  const plainText = options?.plainText?.trim();
  if (plainText) {
    const settings = getLocalHardwareSettings();
    const bridgeReady = settings.printer ? await ensureLocalPrinterBridge() : isLocalPrinterBridgeActive();
    if (settings.printer && bridgeReady) {
      try {
        await printFormattedReceiptThroughLocalBridge(settings, `${plainText}\n\n`);
        return { channel: "bridge", ok: true };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Receipt printer failed.";
        if (options?.bridgeOnly) return { channel: "bridge", ok: false, message };
      }
    } else if (options?.bridgeOnly) {
      return {
        channel: "skipped",
        ok: false,
        message: settings.printer
          ? "Local bridge is offline. Open Settings → Hardware and connect, or install Hardware Connect."
          : "No receipt printer selected on this register.",
      };
    }
  }

  if (options?.bridgeOnly) {
    return { channel: "skipped", ok: false, message: "Receipt text was empty." };
  }
  window.print();
  return { channel: "browser", ok: true };
}

export type PostSaleHardwareOutcome = {
  receipt?: PrintReceiptOutcome;
  docket?: PrintReceiptOutcome;
  drawer?: { ok: boolean; message?: string };
};

function isCashLikePayment(method: string): boolean {
  return /\bcash\b/i.test(method);
}

async function openCashDrawerForSale(settings: HardwareSettings): Promise<{ ok: boolean; message?: string }> {
  try {
    await testOpenCashDrawer(settings);
    return { ok: true };
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : "Cash drawer failed." };
  }
}

/** Non-blocking Sell automation: receipt, optional docket, cash drawer kick. */
export async function runPostSaleLocalHardwareActions(
  receipt: SaleReceiptPlainTextInput,
): Promise<PostSaleHardwareOutcome> {
  const settings = getLocalHardwareSettings();
  const outcome: PostSaleHardwareOutcome = {};

  if (settings.autoPrintReceiptOnSale && settings.printer) {
    outcome.receipt = await printReceiptDocument({
      plainText: formatSaleReceiptPlainText(receipt),
      bridgeOnly: true,
    });
  }

  const tagRoutes = settings.docketTagRoutes ?? {};
  const taggedJobs = Object.entries(tagRoutes).filter(([, printer]) => printer.trim());
  if (taggedJobs.length > 0) {
    const anyFail: string[] = [];
    for (const [tag, printer] of taggedJobs) {
      const taggedLines = receipt.lines.filter((line) =>
        (line.tags ?? []).some((value) => value.toLowerCase() === tag.toLowerCase()),
      );
      if (!taggedLines.length) continue;
      const docketText = formatSaleDocketPlainText({ ...receipt, lines: taggedLines });
      try {
        if (!(await ensureLocalPrinterBridge())) {
          anyFail.push(`Docket for ${tag}: bridge offline.`);
          continue;
        }
        await printFormattedReceiptThroughLocalBridge(
          { printer: printer.trim(), printerBrand: settings.printerBrand },
          docketText,
        );
      } catch (cause) {
        anyFail.push(cause instanceof Error ? cause.message : `Docket for ${tag} failed.`);
      }
    }
    outcome.docket = anyFail.length
      ? { channel: "bridge", ok: false, message: anyFail.join(" ") }
      : { channel: "bridge", ok: true };
  } else if (settings.printDocketOnSale) {
    const docketPrinter = settings.docketPrinter.trim() || settings.printer;
    if (docketPrinter) {
      const docketText = formatSaleDocketPlainText(receipt);
      try {
        if (await ensureLocalPrinterBridge()) {
          await printFormattedReceiptThroughLocalBridge(
            { printer: docketPrinter, printerBrand: settings.printerBrand },
            docketText,
          );
          outcome.docket = { channel: "bridge", ok: true };
        } else {
          outcome.docket = { channel: "skipped", ok: false, message: "Local bridge offline for docket." };
        }
      } catch (cause) {
        outcome.docket = {
          channel: "bridge",
          ok: false,
          message: cause instanceof Error ? cause.message : "Docket print failed.",
        };
      }
    }
  }

  if (
    settings.autoOpenDrawerOnCashSale
    && settings.cashDrawer
    && settings.printer
    && isCashLikePayment(receipt.paymentMethod)
  ) {
    outcome.drawer = await openCashDrawerForSale(settings);
  }

  return outcome;
}

export function summarizePostSaleHardwareOutcome(outcome: PostSaleHardwareOutcome): string | null {
  const issues: string[] = [];
  if (outcome.receipt && !outcome.receipt.ok) issues.push(outcome.receipt.message ?? "Receipt did not print.");
  if (outcome.docket && !outcome.docket.ok) issues.push(outcome.docket.message ?? "Docket did not print.");
  if (outcome.drawer && !outcome.drawer.ok) issues.push(outcome.drawer.message ?? "Cash drawer did not open.");
  if (!issues.length) return null;
  return issues.join(" ");
}

export type HardwareReadinessTone = "ok" | "warn" | "muted";

export type HardwareReadinessItem = {
  id: "agent" | "printer" | "drawer" | "eftpos";
  label: string;
  status: string;
  tone: HardwareReadinessTone;
};

function readEftposReadinessInline(): {
  registerId: number | null;
  testPaymentRegisterId: number | null;
  selectedRegisterId: number | null;
  enabled: boolean;
  paymentsEnabled: boolean;
  connectorHealth: string;
  connectorMode: string;
  tokenConfigured: boolean;
  testPaymentAt: string;
  testPaymentStatus: "APPROVED" | "DECLINED" | "UNKNOWN" | "";
  currentConfigurationKey: string;
  testConfigurationKey: string;
  updatedAt: string;
} {
  const empty = {
    registerId: null,
    testPaymentRegisterId: null,
    selectedRegisterId: null,
    enabled: false,
    paymentsEnabled: false,
    connectorHealth: "unknown",
    connectorMode: "unknown",
    tokenConfigured: false,
    testPaymentAt: "",
    testPaymentStatus: "" as const,
    currentConfigurationKey: "",
    testConfigurationKey: "",
    updatedAt: "",
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(EFTPOS_READINESS_KEY);
    if (!raw) return empty;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const selectedRegisterValue = Number(window.localStorage.getItem("orithos.eftpos.register-id.v1"));
    return {
      registerId: typeof value.registerId === "number" ? value.registerId : null,
      testPaymentRegisterId: typeof value.testPaymentRegisterId === "number" ? value.testPaymentRegisterId : null,
      selectedRegisterId: Number.isFinite(selectedRegisterValue) && selectedRegisterValue > 0 ? selectedRegisterValue : null,
      enabled: value.enabled === true,
      paymentsEnabled: value.paymentsEnabled === true,
      connectorHealth: typeof value.connectorHealth === "string" ? value.connectorHealth : "unknown",
      connectorMode: typeof value.connectorMode === "string" ? value.connectorMode : "unknown",
      tokenConfigured: value.tokenConfigured === true,
      testPaymentAt: typeof value.testPaymentAt === "string" ? value.testPaymentAt : "",
      testPaymentStatus:
        value.testPaymentStatus === "APPROVED" || value.testPaymentStatus === "DECLINED" || value.testPaymentStatus === "UNKNOWN"
          ? value.testPaymentStatus
          : "",
      currentConfigurationKey: typeof value.currentConfigurationKey === "string" ? value.currentConfigurationKey : "",
      testConfigurationKey: typeof value.testConfigurationKey === "string" ? value.testConfigurationKey : "",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    };
  } catch {
    return empty;
  }
}

export function markBarcodeScannerTested(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BARCODE_SCANNER_TEST_KEY, new Date().toISOString());
    localSettingsListeners.forEach((listener) => listener());
  } catch {
    /* ignore */
  }
}

export function hasBarcodeScannerTested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(BARCODE_SCANNER_TEST_KEY));
  } catch {
    return false;
  }
}

export function isLocalPrinterBridgeActive(): boolean {
  if (activeLocalBridge === "orithos-hc") return true;
  return typeof window !== "undefined" && Boolean(window.qz?.websocket?.isActive());
}

export function getHardwareReadinessSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return JSON.stringify(getHardwareReadinessItems());
  } catch {
    return "";
  }
}

export function getHardwareReadinessItems(): HardwareReadinessItem[] {
  const settings = getLocalHardwareSettings();
  const bridgeActive = isLocalPrinterBridgeActive();
  const eftposSnap = readEftposReadinessInline();

  const agent = bridgeActive
    ? ({
        status: lastHardwareConnectVersion
          ? `Hardware Connect ${lastHardwareConnectVersion}`
          : "Hardware Connect running",
        tone: "ok" as const,
      })
  : ({ status: "Install agent and connect bridge", tone: "warn" as const });

  const printer = !settings.printer
    ? ({ status: "Choose a receipt printer", tone: "warn" as const })
    : bridgeActive
      ? ({ status: `Ready · ${settings.printer}`, tone: "ok" as const })
      : ({ status: "Saved; connect bridge on this page", tone: "warn" as const });

  const drawer = !settings.cashDrawer
    ? ({ status: "Optional · RJ12 via receipt printer", tone: "muted" as const })
    : bridgeActive
      ? ({
          status: settings.autoOpenDrawerOnCashSale
            ? "Ready · opens on cash sales"
            : "Ready · use Test drawer",
          tone: "ok" as const,
        })
      : ({ status: "Enabled; connect bridge to test", tone: "warn" as const });

  const eftposDiagnosticsFresh = hasFreshEftposDiagnostics(eftposSnap);
  const eftposTestApproved = hasRecentApprovedEftposTest(eftposSnap, eftposSnap.selectedRegisterId);
  const eftposReady = eftposSnap.enabled
    && eftposSnap.paymentsEnabled
    && eftposSnap.registerId === eftposSnap.selectedRegisterId
    && eftposSnap.connectorHealth === "reachable"
    && isAdapterMode(eftposSnap.connectorMode)
    && eftposSnap.tokenConfigured
    && eftposDiagnosticsFresh
    && eftposTestApproved;
  const eftpos = eftposReady
    ? ({ status: "Ready for Sell · real terminal test confirmed", tone: "ok" as const })
    : !eftposSnap.paymentsEnabled || !eftposSnap.enabled
      ? ({ status: "Card payments are disabled for this register", tone: "muted" as const })
        : !eftposDiagnosticsFresh || eftposSnap.connectorHealth !== "reachable"
          ? ({ status: "Check local EFTPOS bridge status below", tone: "warn" as const })
          : !isAdapterMode(eftposSnap.connectorMode)
            ? ({ status: "Test mode · real card payments are blocked", tone: "warn" as const })
            : !eftposSnap.tokenConfigured
              ? ({ status: "Connector token required", tone: "warn" as const })
              : ({ status: "Run an approved real terminal test", tone: "warn" as const });

  return [
    { id: "agent", label: "Local agent", ...agent },
    { id: "printer", label: "Receipt printer", ...printer },
    { id: "drawer", label: "Cash drawer", ...drawer },
    { id: "eftpos", label: "Card payments", ...eftpos },
  ];
}

export function getLocalHardwareSettings(): HardwareSettings {
  if (typeof window === "undefined") return { ...EMPTY_SETTINGS };
  try {
    return parseLocalHardwareSettings(window.localStorage.getItem(SETTINGS_KEY) ?? "");
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

export function parseLocalHardwareSettings(raw: string): HardwareSettings {
  try {
    const value = JSON.parse(raw || "null") as Partial<HardwareSettings> | null;
    const brand = value?.printerBrand;
    const pin = value?.cashDrawerPin;
    const cutDelay = typeof value?.cutDelayMs === "number" ? value.cutDelayMs : Number(value?.cutDelayMs);
    return {
      printer: typeof value?.printer === "string" ? value.printer : "",
      cashDrawer: value?.cashDrawer === true,
      printerBrand: brand === "epson" || brand === "star" || brand === "generic" ? brand : "epson",
      cashDrawerPin: pin === "1" ? "1" : "0",
      cutDelayMs: Number.isFinite(cutDelay) ? Math.max(0, Math.min(cutDelay, 10_000)) : 500,
      autoPrintReceiptOnSale: value?.autoPrintReceiptOnSale !== false,
      autoOpenDrawerOnCashSale: value?.autoOpenDrawerOnCashSale !== false,
      printDocketOnSale: value?.printDocketOnSale === true,
      docketPrinter: typeof value?.docketPrinter === "string" ? value.docketPrinter : "",
      docketTagRoutes:
        value?.docketTagRoutes && typeof value.docketTagRoutes === "object" && !Array.isArray(value.docketTagRoutes)
          ? Object.fromEntries(
              Object.entries(value.docketTagRoutes as Record<string, unknown>)
                .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
            )
          : {},
      shelfTemplateDirectory:
        typeof value?.shelfTemplateDirectory === "string" ? value.shelfTemplateDirectory : "",
      shelfExportDirectory: typeof value?.shelfExportDirectory === "string" ? value.shelfExportDirectory : "",
      linklyTerminal: typeof value?.linklyTerminal === "string" ? value.linklyTerminal : "",
      linklyAcquirer: typeof value?.linklyAcquirer === "string" ? value.linklyAcquirer : "",
      linklyConnection: typeof value?.linklyConnection === "string" ? value.linklyConnection : "",
    };
  } catch {
    return { ...EMPTY_SETTINGS };
  }
}

export function getLocalHardwareSettingsSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(SETTINGS_KEY) ?? "";
  } catch {
    return "";
  }
}

const EFTPOS_READINESS_KEY = "orithos.hardware.eftpos-readiness.v1";

export function publishLocalHardwareSettingsChange(): void {
  notifyLocalHardwareSubscribers();
}

export function subscribeLocalHardwareSettings(listener: () => void): () => void {
  localSettingsListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === SETTINGS_KEY
      || event.key === BARCODE_SCANNER_TEST_KEY
      || event.key === EFTPOS_READINESS_KEY
    ) {
      listener();
    }
  };
  const onCustom = () => listener();
  window.addEventListener?.("storage", onStorage);
  window.addEventListener?.("orithos-hardware-settings", onCustom);
  return () => {
    localSettingsListeners.delete(listener);
    window.removeEventListener?.("storage", onStorage);
    window.removeEventListener?.("orithos-hardware-settings", onCustom);
  };
}

export function saveLocalHardwareSettings(settings: HardwareSettings): void {
  if (typeof window === "undefined") throw new Error("Local preferences are only available in a browser.");
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  localSettingsListeners.forEach((listener) => listener());
}

export type ShelfExportPaths = { templateDirectory: string; exportDirectory: string; defaultExportDirectory?: string };

export async function fetchShelfExportPathsFromAgent(): Promise<ShelfExportPaths | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await loopbackHardwareConnectFetch("/v1/shelf-export");
    if (!response.ok) return null;
    const body = (await response.json()) as ShelfExportPaths;
    return {
      templateDirectory: body.templateDirectory ?? "",
      exportDirectory: body.exportDirectory ?? "",
      defaultExportDirectory: body.defaultExportDirectory,
    };
  } catch {
    return null;
  }
}

export async function saveShelfExportPathsToAgent(
  templateDirectory: string,
  exportDirectory: string,
): Promise<void> {
  const response = await loopbackHardwareConnectFetch("/v1/shelf-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateDirectory, exportDirectory }),
  });
  if (!response.ok) throw new Error(await hardwareConnectFailureMessage(response, "Shelf export paths"));
}

export const CUSTOMER_DISPLAY_OPEN_KEY = "orithos.hardware.customer-display-open.v1";

export function markCustomerDisplayOpen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOMER_DISPLAY_OPEN_KEY, new Date().toISOString());
    publishLocalHardwareSettingsChange();
  } catch {
    /* ignore */
  }
}

export function isCustomerDisplayMarkedOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(CUSTOMER_DISPLAY_OPEN_KEY));
  } catch {
    return false;
  }
}
