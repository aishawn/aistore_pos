import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const businessWrites = [];
let scanCalls = 0;
let capabilityCalls = 0;
page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/") && request.method() !== "GET") {
    businessWrites.push(`${request.method()} ${url.pathname}`);
  }
});
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Orithos admin login failed");

  await page.route("**/api/orders/receives/scan", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 405, body: "Unexpected method" });
    scanCalls += 1;
    if (scanCalls === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: 50212, message: "temporary OCR provider failure", data: null }) });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, message: "ok", data: {
        supplierName: "MOCK Harbour Wine Co",
        supplierAbn: "MOCK-ABN-0001",
        invoiceNumber: "MOCK-INV-2026-001",
        invoiceDate: "14/10/2026",
        dueDate: "30/10/2026",
        totalPayable: 220,
        totalCases: 2,
        lines: [{ description: "MOCK Shiraz test line", packQty: 6, qtyCases: 2, unitPrice: 110, lineTotal: 220 }],
      } }),
    });
  });
  await page.route("**/api/ai/config/client", async (route) => {
    capabilityCalls += 1;
    if (capabilityCalls === 1) {
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: 50301, message: "temporary capability probe failure", data: null }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, message: "ok", data: {
        enabled: true,
        assistantAvailable: true,
        invoiceVisionAvailable: true,
      } }),
    });
  });

  await page.goto(`${base}/invoices/scan`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Scan supplier invoice" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Photograph or upload" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  const retryAvailability = page.getByRole("button", { name: "Retry availability" });
  await retryAvailability.waitFor({ state: "visible", timeout: 10000 });
  await retryAvailability.click();
  const uploadAction = page.getByRole("button", { name: "Photograph or upload" });
  await page.waitForFunction((button) => button instanceof HTMLButtonElement && !button.disabled, await uploadAction.elementHandle(), { timeout: 20000 });
  const save = page.getByRole("button", { name: "Save as received order" });
  if (await save.count() !== 0) throw new Error("Invoice preview unexpectedly exposes a received-order save button");
  const upload = page.locator('input[type="file"][aria-label="Choose or photograph a supplier invoice"]');
  await upload.setInputFiles({
    name: "mock-invoice.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6IooooA//2Q==", "base64"),
  });
  console.log("INVOICE_FILE_SELECTED", await upload.evaluate((input) => ({ count: input.files?.length ?? 0, name: input.files?.[0]?.name ?? null })));
  await page.waitForFunction(() => [...document.querySelectorAll("h2")].some((heading) => heading.textContent?.trim() === "Invoice details") || document.querySelector('[role="alert"]'), undefined, { timeout: 30000 }).catch(async () => {
    throw new Error(`Invoice scan never reached review/error; intercepted calls=${scanCalls}; writes=${businessWrites.join("|")}; page=${(await page.locator("body").innerText()).slice(-650)}`);
  });
  const alertText = (await page.getByRole("alert").allInnerTexts()).map((text) => text.trim()).find(Boolean);
  if (alertText) {
    await page.getByRole("button", { name: "Retry scan" }).click();
    await page.getByRole("heading", { name: "Invoice details" }).waitFor({ timeout: 30000 });
  }
  await page.getByRole("heading", { name: "Invoice details" }).waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "Invoice line items" }).waitFor({ timeout: 10000 });
  const invoiceNumber = page.locator("label").filter({ hasText: "Invoice number" }).locator("input");
  if (await invoiceNumber.inputValue() !== "MOCK-INV-2026-001") throw new Error("Mock invoice number was not shown in the review form");
  const dueDate = page.locator("label").filter({ hasText: "Due date" }).locator("input");
  if (await dueDate.inputValue() !== "2026-10-30") throw new Error("Mock invoice due date was not shown in the review form");
  const productDescription = page.locator('input[aria-label="Product description 1"]:visible');
  if (!(await productDescription.inputValue()).includes("MOCK Shiraz")) throw new Error("Mock line item was not shown for review");
  if (!(await page.getByRole("img", { name: "Invoice preview" }).count())) throw new Error("Uploaded image preview was not shown");
  if (await save.count() !== 0) throw new Error("Invoice preview unexpectedly exposes a received-order save button after scanning");
  await page.getByRole("link", { name: "Open Odoo Purchases" }).waitFor({ timeout: 10000 });
  await page.getByRole("link", { name: "Open Replenishment" }).waitFor({ timeout: 10000 });
  const cases = page.locator('input[aria-label="Cases for line 1"]:visible');
  await cases.fill("3");
  if (await cases.inputValue() !== "3") throw new Error("Line quantity was not editable before leaving preview");
  if (businessWrites.some((entry) => entry.includes("from-scan") || entry.includes("supplier") || entry.includes("purchase"))) {
    throw new Error(`Unexpected business write request: ${businessWrites.join(", ")}`);
  }
  if (scanCalls !== 2) throw new Error(`Expected one failed and one successful intercepted scan call, got ${scanCalls}`);

  const output = {
    generatedAt: new Date().toISOString(),
    sourceCommit: process.env.PILOT_SOURCE_COMMIT ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    deployment: process.env.PILOT_DEPLOYMENT_SHA || null,
    target: base,
    status: "PASS",
    fixture: "invoice scan endpoint intercepted in browser; no model call, supplier creation or purchase receipt write",
    viewport: 390,
    checks: ["invoice AI availability retry recovers after a transient failure", "invoice scan retry reuses the selected file after a transient OCR failure", "invoice preview has no received-order save button before scanning", "mock scan image preview and details render", "invoice line is editable before leaving preview", "Odoo purchasing links are shown and no business write was sent"],
    scanCalls,
    capabilityCalls,
    businessWrites,
  };
  const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
    ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
    : path.join(root, "docs", "UAT_INVOICE_SCAN_MOCK_2026-10-14.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({ outputPath, status: output.status, checks: output.checks }));
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}
