/**
 * Isolation-gated sell + refund UAT.
 * Refuses to run unless ODOO_DATABASE === ISOLATION_ODOO_DATABASE.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
}

const env = loadEnv();
const isolationDb = (process.env.ISOLATION_ODOO_DATABASE || env.ISOLATION_ODOO_DATABASE || "").trim();
const odooDb = (process.env.ODOO_DATABASE || env.ODOO_DATABASE || "").trim();
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
const allowSharedUatWrites = process.env.PILOT_ALLOW_SHARED_UAT_WRITES === "true";

const evidence = {
  generatedAt: new Date().toISOString(),
  baseUrl: base,
  isolationOdooDatabase: isolationDb || null,
  odooDatabase: odooDb || null,
  isolationGate: "fail",
  result: "BLOCKED",
  sales: [],
  refunds: [],
  errors: [],
  sharedUatWriteOverride: false,
};

function fail(message) {
  evidence.errors.push(message);
  evidence.result = "BLOCKED";
  const out = path.join(root, "docs", `UAT_ISOLATION_WRITE_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.error(message);
  console.error(`Wrote ${out}`);
  process.exit(1);
}

if (!isolationDb) {
  fail("Set ISOLATION_ODOO_DATABASE to the dedicated UAT Odoo database name.");
}
if (!odooDb) {
  fail("Set ODOO_DATABASE (env or .env) to the same isolation database.");
}
if (odooDb !== isolationDb) {
  fail(`Isolation gate refused: ODOO_DATABASE=${odooDb} != ISOLATION_ODOO_DATABASE=${isolationDb}`);
}
if (odooDb === "aipos") fail("Use a dedicated UAT database; a local variable cannot approve writes to aipos.");
if (!password) {
  fail("INITIAL_ADMIN_PASSWORD is required.");
}

evidence.isolationGate = "pass";

async function login(page) {
  const response = await page.request.post(`${base}/api/auth/login`, { data: { username: "admin", password }, timeout: 30000 });
  if (!response.ok()) throw new Error(`Login failed with HTTP ${response.status()}`);
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(10000);
  await page.getByRole("button", { name: "All products", exact: true }).click();
  console.log((await page.locator("body").innerText()).slice(0, 1200));
  console.log((await page.getByRole("button").allTextContents()).slice(0, 30));
  await page.locator('[id^="pos-product-option-"]').filter({ hasText: /DEMO|PINOT|wine/i }).first().waitFor({ state: "visible", timeout: 60000 });
}

async function waitForTotal(page, amount) {
  await page.waitForFunction(
    (expected) => document.body.innerText.replace(/\s+/g, " ").includes(expected),
    amount,
    { timeout: 20000 },
  );
}

async function sellOne(page, productNameRegex, paymentLabel, expectedTotal) {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "All products", exact: true }).click();
  await page.locator('[id^="pos-product-option-"]').filter({ hasText: productNameRegex }).first().click();
  await waitForTotal(page, expectedTotal);
  await page.getByRole("button", { name: paymentLabel === "Card" ? "EFTPOS" : "Exact Cash", exact: true }).click();
  await page.waitForTimeout(800);
  const finalise = page.getByRole("button", { name: /Finalise(?: Sale)?/i });
  await finalise.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll("button")].find((node) => /^Finalise(?: Sale)?$/i.test(node.textContent?.trim() ?? ""));
    return Boolean(button && !button.disabled);
  }, null, { timeout: 20000 });
  await finalise.click();
  await page.getByRole("heading", { name: /Sale complete/i }).waitFor({ timeout: 30000 });
  const text = await page.locator("body").innerText();
  const receiptMatch = text.match(/\b\d{2,}-\d+-\d+\b/);
  await page.getByRole("button", { name: /New sale/i }).click().catch(async () => {
    await page.getByRole("button", { name: /Close receipt/i }).click();
  });
  return { receiptId: receiptMatch?.[0] || null, snippet: text.replace(/\s+/g, " ").slice(0, 400) };
}

async function refundByReceipt(page, receiptId) {
  await page.goto(`${base}/history/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: receiptId }).click();
  await page.getByRole("heading", { name: /Sale receipt/i }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /Refund full sale/i }).click();
  await page.getByRole("heading", { name: /Confirm full refund/i }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: /Record full refund/i }).click();
  await page.waitForFunction(
    () => /Refund recorded|already been refunded|Refund failed/i.test(document.body.innerText),
    null,
    { timeout: 30000 },
  );
  const text = await page.locator("body").innerText();
  await page.getByRole("button", { name: /^Close$/i }).click().catch(() => {});
  return text.replace(/\s+/g, " ").slice(-1200);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await login(page);
  const attestation = await page.request.get(`${base}/api/public/uat-context`);
  const runtime = attestation.ok() ? await attestation.json() : null;
  const versionResponse = await page.request.get(`${base}/api/public/version`);
  const version = versionResponse.ok() ? await versionResponse.json() : null;
  const candidate = process.env.SOURCE_COMMIT || "";
  const runtimeShaMatches = /^[a-f0-9]{40}$/.test(candidate)
    && version?.frontend?.commit === candidate
    && version?.backend?.commit === candidate;
  const isolatedTarget = runtime?.isolated === true && runtime.database === isolationDb;
  const sharedUatOverride = allowSharedUatWrites && odooDb === "aipos_uat" && runtime?.isolated === false;
  if ((!isolatedTarget && !sharedUatOverride) || !runtimeShaMatches) {
    await browser.close();
    fail("Target runtime isolation/shared-UAT authorization or exact frontend/backend SHA could not be attested. No business writes performed.");
  }
  evidence.runtimeCommit = candidate;
  evidence.runtimeIsolationVerified = isolatedTarget;
  evidence.sharedUatWriteOverride = sharedUatOverride;
  evidence.runtimeVersion = version;
  const card = await sellOne(page, /DEMO-COLA/i, "Card", "$3.85");
  evidence.sales.push({ method: "Card", ...card });
  if (!card.receiptId) fail("Card sale did not expose a receipt id");

  const cash = await sellOne(page, /DEMO-COLA/i, "Cash", "$3.85");
  evidence.sales.push({ method: "Cash", ...cash });
  if (!cash.receiptId) fail("Cash sale did not expose a receipt id");

  for (const sale of evidence.sales) {
    const refundText = await refundByReceipt(page, sale.receiptId);
    evidence.refunds.push({ receiptId: sale.receiptId, snippet: refundText });
    if (!/Refund recorded|already been (refunded|recorded)/i.test(refundText)) {
      fail(`Refund failed for ${sale.receiptId}`);
    }
  }

  evidence.result = "PARTIAL";
  evidence.note = "Sales/refunds completed; stock, payment and GST reconciliation still require separate evidence. This is not full business acceptance.";
} catch (error) {
  evidence.errors.push(error instanceof Error ? error.message : String(error));
  evidence.result = "FAIL";
} finally {
  await browser.close();
  const out = path.join(root, "docs", `UAT_ISOLATION_WRITE_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(`Wrote ${out} result=${evidence.result}`);
  if (evidence.result !== "PASS") process.exit(1);
}
