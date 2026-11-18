"use client";

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

export type LocalHardwareState = {
  qzAvailable: boolean;
  connected: boolean;
  printers: string[];
  error: string | null;
};

export type ReceiptPrinterBrand = "epson" | "star" | "generic";

export type HardwareSettings = {
  printer: string;
  cashDrawer: boolean;
  printerBrand: ReceiptPrinterBrand;
  cashDrawerPin: "0" | "1";
  cutDelayMs: number;
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
  linklyTerminal: "",
  linklyAcquirer: "",
  linklyConnection: "",
};
const localSettingsListeners = new Set<() => void>();

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

export async function connectLocalHardware(): Promise<LocalHardwareState> {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return { qzAvailable: false, connected: false, printers: [], error: "Use this page on HTTPS to connect local devices." };
  }

  const qz = window.qz;
  if (!qz) return { qzAvailable: false, connected: false, printers: [], error: null };

  try {
    if (!qz.websocket.isActive()) await qz.websocket.connect({ retries: 1, delay: 500 });
    const printers = await qz.printers.find();
    return { qzAvailable: true, connected: true, printers, error: null };
  } catch (cause) {
    return {
      qzAvailable: true,
      connected: false,
      printers: [],
      error: cause instanceof Error ? cause.message : "Local hardware bridge connection failed.",
    };
  }
}

export async function printThroughLocalBridge(printer: string, data: string): Promise<void> {
  const qz = typeof window !== "undefined" ? window.qz : undefined;
  if (!qz?.websocket.isActive()) throw new Error("Connect the QZ Tray local bridge before printing.");
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
  const qz = typeof window !== "undefined" ? window.qz : undefined;
  if (!qz?.websocket.isActive()) throw new Error("Connect the QZ Tray local bridge before printing.");
  await qz.print(qz.configs.create(printer), [{
    type: "raw",
    format: "command",
    flavor: "hex",
    data: bytesToQzHex(bytes),
  }]);
}

export async function testOpenCashDrawer(settings: HardwareSettings): Promise<void> {
  if (!settings.printer) throw new Error("Select a receipt printer first.");
  if (!settings.cashDrawer) throw new Error("Turn on cash drawer for the selected printer first.");
  await printRawBytesThroughLocalBridge(settings.printer, resolveCashDrawerKickBytes(settings));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Test print with optional paper cut after brand-specific delay (ESC/POS GS V). */
export async function printReceiptTestThroughLocalBridge(settings: HardwareSettings): Promise<void> {
  if (!settings.printer) throw new Error("Select a receipt printer first.");
  const body = "Orithos POS hardware test\n\n";
  await printThroughLocalBridge(settings.printer, body);
  const delay = Number.isFinite(settings.cutDelayMs) ? Math.max(0, Math.min(settings.cutDelayMs, 10_000)) : 500;
  await sleep(delay);
  if (settings.printerBrand === "star") {
    await printRawBytesThroughLocalBridge(settings.printer, [27, 100, 3]);
  } else {
    await printRawBytesThroughLocalBridge(settings.printer, [29, 86, 0]);
  }
}

export type SaleReceiptPlainTextInput = {
  companyName: string;
  reference: string;
  dateLabel: string;
  customerName: string;
  session: string;
  lines: { name: string; quantity: number; total: number }[];
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
};

export async function printReceiptDocument(options?: PrintReceiptDocumentOptions): Promise<void> {
  if (typeof window === "undefined") return;

  const plainText = options?.plainText?.trim();
  if (plainText) {
    const settings = getLocalHardwareSettings();
    const qz = window.qz;
    if (settings.printer && qz?.websocket.isActive()) {
      try {
        await printThroughLocalBridge(settings.printer, `${plainText}\n\n`);
        return;
      } catch {
        /* fall through to the system print dialog */
      }
    }
  }

  window.print();
}

export type HardwareReadinessTone = "ok" | "warn" | "muted";

export type HardwareReadinessItem = {
  id: "printer" | "drawer" | "scanner" | "eftpos";
  label: string;
  status: string;
  tone: HardwareReadinessTone;
};

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
  const qzActive = isLocalPrinterBridgeActive();
  const scannerTested = hasBarcodeScannerTested();

  const printer = !settings.printer
    ? ({ status: "Not configured", tone: "warn" as const })
    : qzActive
      ? ({ status: `Ready · ${settings.printer}`, tone: "ok" as const })
      : ({ status: "Configured; connect QZ on Hardware", tone: "warn" as const });

  const drawer = settings.cashDrawer
    ? ({ status: "Attached; register auto-open disabled", tone: "warn" as const })
    : ({ status: "Not configured", tone: "muted" as const });

  const scanner = scannerTested
    ? ({ status: "Keyboard wedge tested", tone: "ok" as const })
    : ({ status: "Keyboard wedge (not tested)", tone: "warn" as const });

  const eftposFields = Boolean(
    settings.linklyTerminal.trim() || settings.linklyAcquirer.trim() || settings.linklyConnection.trim(),
  );
  const eftpos = eftposFields
    ? ({ status: "Planning only; payments disabled", tone: "warn" as const })
    : ({ status: "Not configured", tone: "muted" as const });

  return [
    { id: "printer", label: "Receipt printer", ...printer },
    { id: "drawer", label: "Cash drawer", ...drawer },
    { id: "scanner", label: "Barcode scanner", ...scanner },
    { id: "eftpos", label: "EFTPOS terminal", ...eftpos },
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

export function subscribeLocalHardwareSettings(listener: () => void): () => void {
  localSettingsListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SETTINGS_KEY || event.key === BARCODE_SCANNER_TEST_KEY) listener();
  };
  window.addEventListener?.("storage", onStorage);
  return () => {
    localSettingsListeners.delete(listener);
    window.removeEventListener?.("storage", onStorage);
  };
}

export function saveLocalHardwareSettings(settings: HardwareSettings): void {
  if (typeof window === "undefined") throw new Error("Local preferences are only available in a browser.");
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  localSettingsListeners.forEach((listener) => listener());
}
