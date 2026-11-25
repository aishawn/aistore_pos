import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  connectLocalHardware,
  formatSaleDocketPlainText,
  formatSaleReceiptPlainText,
  summarizePostSaleHardwareOutcome,
  getHardwareReadinessItems,
  getLocalHardwareSettings,
  buildEscPosReceiptJob,
  formatCashDrawerKickCode,
  printReceiptDocument,
  printRawBytesThroughLocalBridge,
  printThroughLocalBridge,
  resetLocalBridgeStateForTests,
  testOpenCashDrawer,
  readSerialDiagnostic,
  saveLocalHardwareSettings,
  subscribeLocalHardwareSettings,
} from "./local-hardware.ts";

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

function mockHardwareConnectOffline() {
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("127.0.0.1:9170")) {
      throw new Error("offline");
    }
    return originalFetch(input, init);
  };
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  globalThis.localStorage?.clear();
  globalThis.fetch = originalFetch;
  delete process.env.NEXT_PUBLIC_ORITHOS_QZ_FALLBACK;
  resetLocalBridgeStateForTests();
});

function enableQzTrayFallbackForTests() {
  process.env.NEXT_PUBLIC_ORITHOS_QZ_FALLBACK = "true";
}

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value });
}

test("refuses a local hardware connection on an insecure origin", async () => {
  setWindow({ isSecureContext: false });
  assert.deepEqual(await connectLocalHardware(), {
    bridge: null,
    qzAvailable: false,
    connected: false,
    printers: [],
    error: "Use this page on HTTPS to connect local devices.",
    hardwareConnectVersion: null,
  });
});

test("reports QZ Tray as unavailable when its browser library is missing", async () => {
  mockHardwareConnectOffline();
  setWindow({ isSecureContext: true });
  assert.deepEqual(await connectLocalHardware(), {
    bridge: null,
    qzAvailable: false,
    connected: false,
    printers: [],
    error: "The browser could not reach Hardware Connect. Confirm this page is HTTPS, allow local network access, and check the tray app is running.",
    hardwareConnectVersion: null,
  });
});

test("reports when Hardware Connect is running but printer discovery fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/v1/health")) return new Response(JSON.stringify({ version: "1.2.3" }), { status: 200 });
    if (String(input).endsWith("/v1/printers")) return new Response("", { status: 503 });
    return originalFetch(input);
  };
  setWindow({ isSecureContext: true });
  try {
    assert.deepEqual(await connectLocalHardware(), {
      bridge: "orithos-hc",
      qzAvailable: false,
      connected: true,
      printers: [],
      error: "Hardware Connect is running, but printer discovery failed (503). Check the Windows print service and reconnect.",
      hardwareConnectVersion: "1.2.3",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("prefers Orithos Hardware Connect when the local agent responds", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/v1/health")) {
      return new Response(JSON.stringify({ ok: true, version: "0.1.0.0" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/v1/printers")) {
      return new Response(JSON.stringify({ printers: ["EPSON TM-T82II Receipt"] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input);
  };
  setWindow({ isSecureContext: true });
  try {
    assert.deepEqual(await connectLocalHardware(), {
      bridge: "orithos-hc",
      qzAvailable: false,
      connected: true,
      printers: ["EPSON TM-T82II Receipt"],
      error: null,
      hardwareConnectVersion: "0.1.0.0",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("connects to QZ Tray and returns discovered printers", async () => {
  enableQzTrayFallbackForTests();
  mockHardwareConnectOffline();
  let connected = false;
  setWindow({
    isSecureContext: true,
    qz: {
      websocket: { isActive: () => connected, connect: async () => { connected = true; } },
      printers: { find: async () => ["Receipt Printer"] },
    },
  });

  assert.deepEqual(await connectLocalHardware(), {
    bridge: "qz",
    qzAvailable: true,
    connected: true,
    printers: ["Receipt Printer"],
    error: null,
    hardwareConnectVersion: null,
  });
});

test("returns a readable error when QZ Tray cannot connect", async () => {
  enableQzTrayFallbackForTests();
  mockHardwareConnectOffline();
  setWindow({
    isSecureContext: true,
    qz: {
      websocket: { isActive: () => false, connect: async () => { throw new Error("Connection refused"); } },
      printers: { find: async () => [] },
    },
  });

  assert.deepEqual(await connectLocalHardware(), {
    bridge: null,
    qzAvailable: true,
    connected: false,
    printers: [],
    error: "Connection refused",
    hardwareConnectVersion: null,
  });
});

function readEftposChecklistItem(snapshot: Record<string, unknown>) {
  const registerId = typeof snapshot.registerId === "number" ? snapshot.registerId : 7;
  const selectedRegisterId = typeof snapshot.selectedRegisterId === "number" ? snapshot.selectedRegisterId : registerId;
  const storage = new Map<string, string>([[
    "orithos.hardware.eftpos-readiness.v1",
    JSON.stringify({
      testPaymentRegisterId: registerId,
      updatedAt: new Date().toISOString(),
      currentConfigurationKey: "test-config",
      testConfigurationKey: "test-config",
      ...snapshot,
    }),
  ], [
    "orithos.eftpos.register-id.v1",
    String(selectedRegisterId),
  ]]);
  setWindow({ localStorage: { getItem: (key: string) => storage.get(key) ?? null } });
  return getHardwareReadinessItems().find((item) => item.id === "eftpos")!;
}

test("lab connector is never shown as ready for real card payments", () => {
  const item = readEftposChecklistItem({
    enabled: true,
    paymentsEnabled: true,
    connectorHealth: "reachable",
    connectorMode: "lab",
    tokenConfigured: true,
    testPaymentStatus: "APPROVED",
    testPaymentAt: new Date().toISOString(),
    registerId: 1,
  });

  assert.equal(item.tone, "warn");
  assert.match(item.status, /test mode/i);
  assert.match(item.status, /blocked/i);
});

test("real Linkly without a token or approved terminal test remains incomplete", () => {
  const missingToken = readEftposChecklistItem({
    enabled: true,
    paymentsEnabled: true,
    connectorHealth: "reachable",
    connectorMode: "tcp-proxy",
    tokenConfigured: false,
  });
  assert.equal(missingToken.tone, "warn");
  assert.match(missingToken.status, /token/i);

  const noApprovedTest = readEftposChecklistItem({
    enabled: true,
    paymentsEnabled: true,
    connectorHealth: "reachable",
    connectorMode: "tcp-proxy",
    tokenConfigured: true,
  });
  assert.equal(noApprovedTest.tone, "warn");
  assert.match(noApprovedTest.status, /test/i);
});

test("real card payments are ready only after a recent approved test for this register", () => {
  const item = readEftposChecklistItem({
    enabled: true,
    paymentsEnabled: true,
    connectorHealth: "reachable",
    connectorMode: "tcp-proxy",
    tokenConfigured: true,
    testPaymentStatus: "APPROVED",
    testPaymentAt: new Date(Date.now() - 60_000).toISOString(),
    registerId: 7,
  });

  assert.equal(item.tone, "ok");
  assert.match(item.status, /ready for sell/i);
});

test("disabled or future-dated readiness snapshots do not produce a green card status", () => {
  const disabled = readEftposChecklistItem({
    enabled: false,
    paymentsEnabled: true,
    connectorHealth: "reachable",
    connectorMode: "tcp-proxy",
    tokenConfigured: true,
    testPaymentStatus: "APPROVED",
    testPaymentAt: new Date().toISOString(),
    registerId: 7,
  });
  assert.equal(disabled.tone, "muted");
  assert.doesNotMatch(disabled.status, /ready/i);

  const futureTest = readEftposChecklistItem({
    enabled: true,
    paymentsEnabled: true,
    connectorHealth: "reachable",
    connectorMode: "tcp-proxy",
    tokenConfigured: true,
    testPaymentStatus: "APPROVED",
    testPaymentAt: new Date(Date.now() + 60_000).toISOString(),
    registerId: 7,
  });
  assert.equal(futureTest.tone, "warn");
  assert.match(futureTest.status, /test/i);
});

test("terminal approval from a different selected register does not make the checklist green", () => {
  const item = readEftposChecklistItem({
    enabled: true,
    paymentsEnabled: true,
    connectorHealth: "reachable",
    connectorMode: "tcp-proxy",
    tokenConfigured: true,
    testPaymentRegisterId: 7,
    testPaymentStatus: "APPROVED",
    testPaymentAt: new Date(Date.now() - 60_000).toISOString(),
    registerId: 7,
    selectedRegisterId: 8,
  });

  assert.equal(item.tone, "warn");
  assert.match(item.status, /test/i);
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
  await assert.rejects(printThroughLocalBridge("Receipt Printer", "test"), /Connect the local hardware bridge/);
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
    autoPrintReceiptOnSale: true,
    autoOpenDrawerOnCashSale: true,
    printDocketOnSale: false,
    docketPrinter: "",
    docketTagRoutes: {},
    shelfTemplateDirectory: "",
    shelfExportDirectory: "",
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

test("formats docket text without payment totals", () => {
  const text = formatSaleDocketPlainText({
    companyName: "Demo",
    reference: "S0002",
    dateLabel: "19 Nov 2026",
    session: "Register 1",
    customerName: "Walk-in",
    lines: [{ name: "Milk", quantity: 1, total: 5 }],
  });
  assert.match(text, /Docket/);
  assert.match(text, /1 x Milk/);
  assert.doesNotMatch(text, /\$5\.00/);
});

test("summarizes failed post-sale hardware outcomes", () => {
  const message = summarizePostSaleHardwareOutcome({
    receipt: { channel: "bridge", ok: false, message: "Printer offline" },
    drawer: { ok: false, message: "Drawer kick failed" },
  });
  assert.match(message ?? "", /Printer offline/);
  assert.match(message ?? "", /Drawer kick failed/);
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
  mockHardwareConnectOffline();
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

  const outcome = await printReceiptDocument({ plainText: "Receipt body" });
  assert.equal(printed, false);
  assert.equal(outcome.channel, "bridge");
  assert.equal(jobs.length, 1);
  assert.equal((jobs[0]?.[1] as { type?: string } | undefined)?.type, "raw");
});

test("bundles Epson receipt text, feed, and cut into one ESC/POS job", () => {
  const job = buildEscPosReceiptJob({ printerBrand: "epson" }, "Orithos POS hardware test\n");
  assert.equal(job[0], 0x1b);
  assert.equal(job[1], 0x40);
  assert.ok(job.includes(0x1d));
  assert.deepEqual(job.slice(-3), [0x1d, 0x56, 0]);
});

test("prints sale receipts through Hardware Connect when the agent is running", async () => {
  const originalFetch = globalThis.fetch;
  const jobs: { url: string; body?: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    jobs.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.includes("/v1/health")) {
      return new Response(JSON.stringify({ ok: true, version: "0.1.0.0" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/v1/printers")) {
      return new Response(JSON.stringify({ printers: ["Receipt Printer"] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/v1/print/raw")) {
      return new Response(JSON.stringify({ printed: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/v1/print/text")) {
      return new Response(JSON.stringify({ error: "unexpected text print" }), { status: 400 });
    }
    return originalFetch(input, init);
  };
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
    isSecureContext: true,
    localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
    print: () => { printed = true; },
  });
  try {
    await connectLocalHardware();
    await printReceiptDocument({ plainText: "Receipt body" });
    assert.equal(printed, false);
    assert.ok(jobs.some((job) => job.url.includes("/v1/print/raw")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("falls back to the browser print dialog when the local bridge is unavailable", async () => {
  mockHardwareConnectOffline();
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
  assert.equal(items.find((item) => item.id === "drawer")?.status, "Ready · opens on cash sales");
});

test("notifies readiness subscribers after a local hardware connect attempt", async () => {
  setWindow({ isSecureContext: true });
  let notifications = 0;
  const unsubscribe = subscribeLocalHardwareSettings(() => { notifications += 1; });
  await connectLocalHardware();
  unsubscribe();
  assert.equal(notifications, 1);
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
