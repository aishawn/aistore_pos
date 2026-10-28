import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
const username = process.env.PILOT_USERNAME || "admin";
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const expected = {
  supplierName: "Synthetic Test Supplier Pty Ltd",
  invoiceNumber: "SYNTH-20261023-001",
  invoiceDate: "2026-10-23",
  gstIncluded: 2.18,
  totalPayable: 24,
  unitPrice: 12,
  description: "Sparkling Water 12 x 750mL",
  lineTotal: 24,
};
const html = `<!doctype html><html><head><style>
  *{box-sizing:border-box}body{margin:0;padding:56px;color:#18212b;background:#fff;font:22px Arial,sans-serif}
  main{width:820px;margin:auto;border:1px solid #cbd2d9;padding:52px 58px}
  h1{font-size:34px;margin:0 0 34px}header,.addresses,.totals{display:flex;justify-content:space-between;gap:36px}
  header strong{font-size:26px}.muted{color:#536171}.addresses{margin:38px 0}table{width:100%;border-collapse:collapse;margin:22px 0}
  th,td{padding:15px 10px;border-bottom:1px solid #cbd2d9;text-align:left}th:last-child,td:last-child{text-align:right}
  .totals{margin:30px 0 0 auto;width:360px;display:grid;grid-template-columns:1fr auto}.total{font-size:28px;font-weight:bold}
  .abn{margin-top:14px}
  </style></head><body><main><h1>TAX INVOICE</h1>
  <header><div><strong>${expected.supplierName}</strong><div>1 Test Lane, Sydney NSW 2000</div><div class="abn">ABN 00 000 000 000</div></div>
  <div><div><b>Invoice number</b>: ${expected.invoiceNumber}</div><div><b>Invoice date</b>: 23 Oct 2026</div><div><b>Due date</b>: 30 Oct 2026</div></div></header>
  <section class="addresses"><div><b>Bill to</b><div>Orithos Test Store</div><div>10 Sample Street, Sydney NSW 2000</div></div><div><b>Payment terms</b><div>7 days</div></div></section>
  <table><thead><tr><th>Description</th><th>Quantity</th><th>Price per case (GST inclusive)</th><th>Line total (GST inclusive)</th></tr></thead>
  <tbody><tr><td>${expected.description}</td><td>2 cases</td><td>$${expected.unitPrice.toFixed(2)}</td><td>$${expected.lineTotal.toFixed(2)}</td></tr></tbody></table>
  <div class="totals"><span>Subtotal (ex GST)</span><span>$21.82</span><span>GST</span><span>$${expected.gstIncluded.toFixed(2)}</span>
  <span class="total">TOTAL DUE (AUD)</span><span class="total">$${expected.totalPayable.toFixed(2)}</span></div></main></body></html>`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 });
let result;
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  const image = await page.locator("main").screenshot({ type: "png" });
  const requestStartedAt = Date.now();
  const response = await context.request.post(`${base}/api/ai/invoice/preview`, {
    multipart: { file: { name: "synthetic-tax-invoice.png", mimeType: "image/png", buffer: image } },
    headers: { Origin: base },
    timeout: 120000,
  });
  const body = await response.json().catch(() => ({}));
  const data = body.data ?? {};
  const lines = Array.isArray(data.lines) ? data.lines : [];
  const numericEqual = (actual, value) => Number.isFinite(Number(actual)) && Math.abs(Number(actual) - value) <= 0.03;
  const checks = {
    supplierName: String(data.supplierName ?? "").toLowerCase().includes("synthetic test supplier"),
    invoiceNumber: data.invoiceNumber === expected.invoiceNumber,
    invoiceDate: String(data.invoiceDate ?? "").slice(0, 10) === expected.invoiceDate,
    gstAmount: numericEqual(data.gstIncluded, expected.gstIncluded),
    totalPayable: numericEqual(data.totalPayable, expected.totalPayable),
    lineDescription: lines.some((line) => String(line.description ?? "").toLowerCase().includes("sparkling water")),
    lineQuantity: lines.some((line) => numericEqual(line.qtyCases, 2)),
    unitPrice: lines.some((line) => numericEqual(line.unitPrice, expected.unitPrice)),
    lineTotal: lines.some((line) => numericEqual(line.lineTotal, expected.lineTotal)),
  };
  result = {
    generatedAt: new Date().toISOString(),
    target: base,
    runtimeVerifiedAgainst: process.env.PILOT_DEPLOYMENT_SHA || "unverified",
    scope: "synthetic invoice image OCR preview only; no Odoo writes",
    fixture: "synthetic Australian tax invoice with non-real supplier and invoice identifiers",
    httpStatus: response.status(),
    latencyMs: Date.now() - requestStartedAt,
    rateLimitHeaders: Object.fromEntries(["retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-request-id"].map((name) => [name, response.headers()[name] ?? null])),
    apiCode: body.code ?? null,
    checks,
    extractedFieldPresence: {
      supplierName: Boolean(data.supplierName),
      invoiceNumber: Boolean(data.invoiceNumber),
      invoiceDate: Boolean(data.invoiceDate),
      gstIncluded: data.gstIncluded != null,
      totalPayable: data.totalPayable != null,
      lineCount: lines.length,
    },
    extractedSyntheticLines: lines.map((line) => ({
      description: String(line.description ?? "").slice(0, 80),
      qtyCases: line.qtyCases ?? null,
      unitPrice: line.unitPrice ?? null,
      lineTotal: line.lineTotal ?? null,
    })),
    status: response.ok() && body.code === 0 && Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
    businessWrites: 0,
  };
} catch (error) {
  result = {
    generatedAt: new Date().toISOString(),
    target: base,
    runtimeVerifiedAgainst: process.env.PILOT_DEPLOYMENT_SHA || "unverified",
    scope: "synthetic invoice image OCR preview only; no Odoo writes",
    status: "BLOCKED",
    detail: String(error instanceof Error ? error.message : "Unexpected error").replace(/(cookie|authorization):[^\r\n]*/gi, "$1: [redacted]"),
    businessWrites: 0,
  };
} finally {
  await browser.close();
}

const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_VALID_INVOICE_OCR_ONLINE.json");
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: result.status, apiCode: result.apiCode ?? null, checks: result.checks ?? null }));
if (result.status !== "PASS") process.exitCode = result.status === "BLOCKED" ? 2 : 1;
