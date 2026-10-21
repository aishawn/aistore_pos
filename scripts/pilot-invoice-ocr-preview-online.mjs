import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
const sourceCommit = process.env.PILOT_SOURCE_COMMIT
  ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const evidence = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  worktreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
  deploymentShaVerified: false,
  runtimeCommit: null,
  target: base,
  scope: "real provider invoice OCR preview only; no supplier, purchase, receipt, inventory, or configuration writes",
  status: "FAIL",
  checks: [],
  writes: [],
};
const record = (name, status, detail) => evidence.checks.push({ name, status, detail });
const isTransientNetworkError = (value) => /socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|TLS connection|secure TLS|ERR_CONNECTION_CLOSED|Client network socket disconnected/i.test(String(value));

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 60000,
  });
  const body = await login.json().catch(() => ({}));
  if (!login.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  record("admin login", "PASS", `status=${login.status()}`);

  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff;font-family:Arial,sans-serif;color:#172033"><main style="width:1000px;padding:56px 64px"><div style="display:flex;justify-content:space-between;border-bottom:4px solid #135dcc;padding-bottom:24px"><div><h1 style="font-size:42px;margin:0;color:#135dcc">Harbour Wine Co</h1><p style="font-size:18px;margin:12px 0 0">ABN 12 345 678 901 · 18 King Street, Adelaide SA 5000</p></div><div style="text-align:right"><h2 style="font-size:30px;margin:0">TAX INVOICE</h2><p style="font-size:20px;margin:12px 0 0">Invoice No: HW-2026-1042</p><p style="font-size:20px;margin:8px 0 0">Date: 19/10/2026</p></div></div><section style="margin-top:36px;font-size:20px"><p><b>Bill to:</b> Orithos Demo Store</p><p><b>Delivery:</b> Main Store</p></section><table style="width:100%;border-collapse:collapse;margin-top:32px;font-size:20px"><thead><tr style="background:#eaf2ff"><th style="padding:16px;text-align:left">Product</th><th style="padding:16px;text-align:right">Qty</th><th style="padding:16px;text-align:right">Unit price</th><th style="padding:16px;text-align:right">Amount</th></tr></thead><tbody><tr><td style="padding:18px;border-bottom:1px solid #ccd5e3">Harbour Shiraz 2024</td><td style="padding:18px;text-align:right;border-bottom:1px solid #ccd5e3">12</td><td style="padding:18px;text-align:right;border-bottom:1px solid #ccd5e3">$18.00</td><td style="padding:18px;text-align:right;border-bottom:1px solid #ccd5e3">$216.00</td></tr><tr><td style="padding:18px;border-bottom:1px solid #ccd5e3">Coastal Sauvignon Blanc 2025</td><td style="padding:18px;text-align:right;border-bottom:1px solid #ccd5e3">6</td><td style="padding:18px;text-align:right;border-bottom:1px solid #ccd5e3">$22.00</td><td style="padding:18px;text-align:right;border-bottom:1px solid #ccd5e3">$132.00</td></tr></tbody></table><section style="margin:36px 0 0 auto;width:420px;font-size:22px"><p style="display:flex;justify-content:space-between"><span>Subtotal</span><b>$348.00</b></p><p style="display:flex;justify-content:space-between"><span>GST (10%)</span><b>$34.80</b></p><p style="display:flex;justify-content:space-between;border-top:3px solid #135dcc;padding-top:18px"><span>Total payable</span><b>$382.80</b></p></section></main></body></html>`);
  const image = await page.screenshot({ type: "png", fullPage: true });
  await page.close();

  const before = [];
  context.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/") && request.method() !== "GET") before.push(`${request.method()} ${url.pathname}`);
  });
  const response = await context.request.post(`${base}/api/orders/receives/scan`, {
    multipart: { file: { name: "harbour-test-invoice.png", mimeType: "image/png", buffer: image } },
    timeout: 120000,
  });
  const result = await response.json().catch(() => ({}));
  const data = result.data ?? {};
  if (result.code === 0) {
    const lines = Array.isArray(data.lines) ? data.lines : [];
    const line = lines[0] ?? {};
    record("provider OCR response", "PASS", `supplier=${Boolean(data.supplierName)} invoice=${data.invoiceNumber ?? ""} date=${data.invoiceDate ?? ""} lines=${data.lines?.length ?? 0} total=${data.totalPayable ?? ""}`);
    const headerCorrect = data.supplierName === "Harbour Wine Co"
      && data.invoiceNumber === "HW-2026-1042"
      && data.invoiceDate === "2026-10-19";
    record("invoice supplier, number, and date accuracy", headerCorrect ? "PASS" : "FAIL",
      `supplier=${data.supplierName ?? ""}; invoice=${data.invoiceNumber ?? ""}; date=${data.invoiceDate ?? ""}`);

    const closeAmount = (actual, expected) => Math.abs(Number(actual) - expected) < 0.01;
    const shiraz = lines.find((item) => /Harbour Shiraz 2024/i.test(item.description ?? ""));
    const sauvignon = lines.find((item) => /Coastal Sauvignon Blanc 2025/i.test(item.description ?? ""));
    const lineItemsCorrect = lines.length === 2
      && shiraz && closeAmount(shiraz.qtyCases, 12) && closeAmount(shiraz.unitPrice, 18)
      && closeAmount(shiraz.lineTotal, 216)
      && sauvignon && closeAmount(sauvignon.qtyCases, 6) && closeAmount(sauvignon.unitPrice, 22)
      && closeAmount(sauvignon.lineTotal, 132);
    const totalsCorrect = closeAmount(data.gstIncluded, 34.8) && closeAmount(data.totalPayable, 382.8);
    record("invoice line item accuracy", lineItemsCorrect ? "PASS" : "FAIL",
      `lines=${JSON.stringify(lines.map(({ description, qtyCases, unitPrice, lineTotal }) => ({ description, qtyCases, unitPrice, lineTotal })))}`);
    record("GST and payable total accuracy", totalsCorrect ? "PASS" : "FAIL",
      `gst=${data.gstIncluded ?? "missing"}; total=${data.totalPayable ?? "missing"}`);
  } else {
    record("provider OCR response", result.code === 50212 ? "INFO" : "FAIL", `code=${result.code ?? ""} message=${String(result.message ?? "").slice(0, 160)}`);
  }
  const forbidden = before.filter((entry) => !entry.includes("/api/orders/receives/scan"));
  record("preview-only write boundary", forbidden.length === 0 ? "PASS" : "FAIL", `unexpected=${forbidden.join(",")}`);
  evidence.providerCode = result.code ?? null;
  evidence.status = evidence.checks.every((check) => check.status !== "FAIL") ? "PASS" : "FAIL";
} catch (error) {
  const detail = error instanceof Error ? error.message : "Unexpected failure";
  evidence.status = isTransientNetworkError(detail) ? "BLOCKED" : "FAIL";
  record("run", evidence.status, detail);
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
  await context.close();
  await browser.close();
}

const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", `UAT_INVOICE_OCR_PREVIEW_ONLINE_${sourceCommit.toUpperCase()}.json`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status === "FAIL") process.exitCode = 1;
else if (evidence.status === "BLOCKED") process.exitCode = 2;
