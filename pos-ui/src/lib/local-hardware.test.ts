import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  connectLocalHardware,
  formatSaleReceiptPlainText,
  getHardwareReadinessItems,
  getLocalHardwareSettings,
  formatCashDrawerKickCode,
  printReceiptDocument,
  printRawBytesThroughLocalBridge,
  printThroughLocalBridge,
  testOpenCashDrawer,
  readSerialDiagnostic,
  saveLocalHardwareSettings,
  subscribeLocalHardwareSettings,
} from "./local-hardware.ts";

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  globalThis.localStorage?.clear();
});

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value });
}

test("refuses a local hardware connection on an insecure origin", async () => {
  setWindow({ isSecureContext: false });
  assert.deepEqual(await connectLocalHardware(), {
    qzAvailable: false,
    connected: false,
    printers: [],
    error: "Use this page on HTTPS to connect local devices.",
  });
});

test("reports QZ Tray as unavailable when its browser library is missing", async () => {
  setWindow({ isSecureContext: true });
  assert.deepEqual(await connectLocalHardware(), {
    qzAvailable: false,
    connected: false,
    printers: [],
    error: null,
  });
});

test("connects to QZ Tray and returns discovered printers", async () => {
  let connected = false;
  setWindow({
    isSecureContext: true,
    qz: {
      websocket: { isActive: () => connected, connect: async () => { connected = true; } },
      printers: { find: async () => ["Receipt Printer"] },
    },
  });

  assert.deepEqual(await connectLocalHardware(), {
    qzAvailable: true,
    connected: true,
    printers: ["Receipt Printer"],
    error: null,
  });
});

test("returns a readable error when QZ Tray cannot connect", async () => {
  setWindow({
    isSecureContext: true,
    qz: {
      websocket: { isActive: () => false, connect: async () => { throw new Error("Connection refused"); } },
      printers: { find: async () => [] },
    },
  });

  assert.deepEqual(await connectLocalHardware(), {
    qzAvailable: true,
    connected: false,
    printers: [],
    error: "Connection refused",
  });
});

test("sends a print job to the selected local printer", async () => {
  const jobs: unknown[][] = [];
  setWindow({
    qz: {
      websocket: { isActive: () => true, connect: async () => undefined },
      configs: { create: (printer: string, options: unknown) => ({ printer, options }) },
      print: async (config: unknown, data: unknown[]) => { jobs.push([config, ...data]); },
    },
  });

  await printThroughLocalBridge("Receipt Printer", "Hardware test");
  assert.deepEqual(jobs, [[{ printer: "Receipt Printer", options: { encoding: "UTF-8" } }, "Hardware test"]]);
});

test("rejects print submission when the local bridge is not connected", async () => {
  setWindow({ qz: { websocket: { isActive: () => false } } });
  await assert.rejects(printThroughLocalBridge("Receipt Printer", "test"), /Connect the QZ Tray local bridge/);
});

test("propagates local printer failures to the caller", async () => {
  setWindow({
    qz: {
      websocket: { isActive: () => true },
      configs: { create: () => ({}) },
      print: async () => { throw new Error("Printer unavailable"); },
    },
  });

  await assert.rejects(printThroughLocalBridge("Receipt Printer", "test"), /Printer unavailable/);
});

test("opens the serial diagnostic at 9600 baud and closes it when cancelled", async () => {
  let cancelStream: (() => void) | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("1.25 kg\n"));
    },
    pull() {
      return new Promise<void>((resolve) => { cancelStream = resolve; });
    },
    cancel() {
      cancelStream?.();
    },
  });
  const serial = {
    requestPort: async () => ({
      open: async (options: { baudRate: number }) => assert.equal(options.baudRate, 9600),
      close: async () => { closed = true; },
      readable: stream,
    }),
  };
  const controller = new AbortController();
  const chunks: string[] = [];
  const reading = readSerialDiagnostic(serial, (chunk) => {
    chunks.push(new TextDecoder().decode(chunk));
    controller.abort();
  }, controller.signal);

  await reading;
  assert.deepEqual(chunks, ["1.25 kg\n"]);
  assert.equal(closed, true);
});

test("cancelling while the serial picker is open stops waiting before a port is selected", async () => {
  let selectPort!: (port: { open: () => Promise<void>; close: () => Promise<void>; readable: null }) => void;
  let opened = false;
  const serial = {
    requestPort: () => new Promise<{ open: () => Promise<void>; close: () => Promise<void>; readable: null }>((resolve) => { selectPort = resolve; }),
  };
  const controller = new AbortController();
  const reading = readSerialDiagnostic(serial, () => undefined, controller.signal);
  const settled = reading.then(() => true, () => true);

  controller.abort();
  const settledBeforeSelection = await Promise.race([
    settled,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20)),
  ]);
  selectPort({
    open: async () => { opened = true; },
    close: async () => undefined,
    readable: null,
  });
  await reading;

  assert.equal(settledBeforeSelection, true);
  assert.equal(opened, false);
});

test("closes the serial port when the device has no readable stream", async () => {
  let closed = false;
  const serial = {
    requestPort: async () => ({
      open: async () => undefined,
      close: async () => { closed = true; },
      readable: null,
    }),
  };

  await assert.rejects(readSerialDiagnostic(serial, () => undefined, new AbortController().signal), /no readable stream/);
  assert.equal(closed, true);
});

test("loads Linkly planning fields from local register preferences", () => {
  const storage = new Map<string, string>();
  setWindow({ localStorage: { getItem: (key: string) => storage.get(key) ?? null } });
  storage.set("orithos.hardware.settings.v1", JSON.stringify({
    printer: "Receipt Printer",
    cashDrawer: true,
    printerBrand: "epson",
    cashDrawerPin: "0",
    cutDelayMs: 500,
    linklyTerminal: "PAX model",
    linklyAcquirer: "Example Bank",
    linklyConnection: "ethernet",
  }));

  assert.deepEqual(getLocalHardwareSettings(), {
    printer: "Receipt Printer",
    cashDrawer: true,
    printerBrand: "epson",
    cashDrawerPin: "0",
    cutDelayMs: 500,
    linklyTerminal: "PAX model",
    linklyAcquirer: "Example Bank",
    linklyConnection: "ethernet",
  });
});

test("maps Epson drawer settings to the Shopfront-style kick code", () => {
  assert.equal(
    formatCashDrawerKickCode({ printerBrand: "epson", cashDrawerPin: "0" }),
    "27, 112, 0, 25, 250",
  );
});

test("sends raw kick bytes through the local bridge", async () => {
  const jobs: unknown[][] = [];
  setWindow({
    qz: {
      websocket: { isActive: () => true },
      configs: { create: (printer: string) => ({ printer }) },
      print: async (config: unknown, data: unknown[]) => { jobs.push([config, ...data]); },
    },
  });

  await printRawBytesThroughLocalBridge("Receipt Printer", [27, 112, 0, 25, 250]);
  assert.equal(jobs.length, 1);
  assert.deepEqual((jobs[0]?.[1] as { data: string })?.data, "1b700019fa");
});

test("opens the cash drawer with configured printer settings", async () => {
  const jobs: unknown[][] = [];
  setWindow({
    qz: {
      websocket: { isActive: () => true },
      configs: { create: (printer: string) => ({ printer }) },
      print: async (config: unknown, data: unknown[]) => { jobs.push([config, ...data]); },
    },
  });

  await testOpenCashDrawer({
    printer: "EPSON TM-T82II Receipt",
    cashDrawer: true,
    printerBrand: "epson",
    cashDrawerPin: "0",
    cutDelayMs: 500,
    linklyTerminal: "",
    linklyAcquirer: "",
    linklyConnection: "",
  });
  assert.equal(jobs.length, 1);
});

test("formats a completed sale receipt as plain text for the local bridge", () => {
  const text = formatSaleReceiptPlainText({
    companyName: "Demo Store",
    reference: "S0001",
    dateLabel: "18 Nov 2026",
    customerName: "Walk-in",
    session: "Register 1",
    lines: [{ name: "Coffee", quantity: 2, total: 9 }],
    subtotal: 8.18,
    gst: 0.82,
    total: 9,
    paymentMethod: "Cash",
    tendered: 10,
    change: 1,
  });
  assert.match(text, /DEMO STORE/);
  assert.match(text, /Coffee/);
  assert.match(text, /Change: \$1.00/);
});

test("strips printer control characters from dynamic receipt fields", () => {
  const text = formatSaleReceiptPlainText({
    companyName: "Demo\u001b@\u0001Store",
    reference: "S0001\r\nFAKE",
    dateLabel: "18 Nov 2026\u001b(0",
    customerName: "Alice\u001bp",
    session: "Register\t2",
    lines: [{ name: "Coffee\u001bp", quantity: 1, total: 4.5 }],
    subtotal: 4.5,
    gst: 0.45,
    total: 4.5,
    paymentMethod: "Cash\u001bp",
    tendered: 5,
    change: 0.5,
  });

  assert.doesNotMatch(text, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
  assert.match(text, /S0001 FAKE/);
  assert.match(text, /Customer: Alice p/);
  assert.match(text, /Coffee p/);
});

test("prints sale receipts through QZ when a printer is configured", async () => {
  const jobs: unknown[][] = [];
  let printed = false;
  const values = new Map<string, string>();
  values.set("orithos.hardware.settings.v1", JSON.stringify({
    printer: "Receipt Printer",
    cashDrawer: false,
    printerBrand: "epson",
    cashDrawerPin: "0",
    cutDelayMs: 500,
    linklyTerminal: "",
    linklyAcquirer: "",
    linklyConnection: "",
  }));
  setWindow({
    localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    print: () => { printed = true; },
    qz: {
      websocket: { isActive: () => true, connect: async () => undefined },
      configs: { create: (printer: string, options: unknown) => ({ printer, options }) },
      print: async (config: unknown, data: unknown[]) => { jobs.push([config, ...data]); },
    },
  });

  await printReceiptDocument({ plainText: "Receipt body" });
  assert.equal(printed, false);
  assert.equal(jobs.length, 1);
});

test("falls back to the browser print dialog when the local bridge is unavailable", async () => {
  let printed = false;
  const values = new Map<string, string>();
  values.set("orithos.hardware.settings.v1", JSON.stringify({
    printer: "Receipt Printer",
    cashDrawer: false,
    printerBrand: "epson",
    cashDrawerPin: "0",
    cutDelayMs: 500,
    linklyTerminal: "",
    linklyAcquirer: "",
    linklyConnection: "",
  }));
  setWindow({
    localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    print: () => { printed = true; },
    qz: { websocket: { isActive: () => false } },
  });

  await printReceiptDocument({ plainText: "Receipt body" });
  assert.equal(printed, true);
});

test("summarises printer readiness from saved preferences and bridge state", () => {
  const values = new Map<string, string>();
  values.set("orithos.hardware.settings.v1", JSON.stringify({
    printer: "Kitchen",
    cashDrawer: true,
    printerBrand: "epson",
    cashDrawerPin: "0",
    cutDelayMs: 500,
    linklyTerminal: "",
    linklyAcquirer: "",
    linklyConnection: "",
  }));
  setWindow({
    localStorage: { getItem: (key: string) => values.get(key) ?? null },
    qz: { websocket: { isActive: () => true } },
  });

  const items = getHardwareReadinessItems();
  assert.equal(items.find((item) => item.id === "printer")?.status, "Ready · Kitchen");
  assert.equal(items.find((item) => item.id === "drawer")?.status, "Attached; register auto-open disabled");
});

test("notifies same-tab settings subscribers after a local preference is saved", () => {
  const values = new Map<string, string>();
  setWindow({ localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  let notifications = 0;
  const unsubscribe = subscribeLocalHardwareSettings(() => { notifications += 1; });

  saveLocalHardwareSettings({
    printer: "Printer",
    cashDrawer: true,
    printerBrand: "epson",
    cashDrawerPin: "0",
    cutDelayMs: 500,
    linklyTerminal: "",
    linklyAcquirer: "",
    linklyConnection: "",
  });
  unsubscribe();

  assert.equal(notifications, 1);
  assert.equal(getLocalHardwareSettings().printer, "Printer");
});
