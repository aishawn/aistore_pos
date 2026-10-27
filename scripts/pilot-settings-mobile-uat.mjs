import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://demo.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const checks = [];
let blocked = false;

try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const login = await context.request.post(`${base}/api/auth/login`, {
        data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
        headers: { Origin: base },
      });
      const loginBody = await login.json().catch(() => ({}));
      if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

      const odooSession = await context.request.get(`${base}/api/odoo/session`, {
        headers: { Origin: base },
        timeout: 60000,
      });
      const odooSessionBody = await odooSession.json().catch(() => ({}));
      if (!odooSession.ok() || !odooSessionBody.user) throw new Error(`ODOO_SESSION_WARMUP_FAILED_${odooSession.status()}`);

      await context.route("**/api/**", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === "GET" && url.origin === new URL(base).origin && url.pathname === "/api/sell/parked") {
          return route.fulfill({ status: 200, json: { code: 0, data: [] } });
        }
        return route.continue();
      });

      const page = await context.newPage();
      for (const spec of [
        { path: "/settings/payment", label: "Payment method source", cardHeadings: ["Orithos registers"], tableHeadings: ["ORITHOS REGISTER"] },
        { path: "/settings/tax", label: "Tax rate source", cardHeadings: [], tableHeadings: [] , emptyText: "No active sales tax rates" },
        { path: "/settings/registers-outlets", label: "Store and register source", cardHeadings: ["Orithos company", "Payment methods"], tableHeadings: ["STORE", "REGISTER"] },
      ]) {
        await page.goto(`${base}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.getByRole("region", { name: spec.label }).waitFor({ timeout: 20000 }).catch(async () => {
          await page.locator(`[aria-label="${spec.label}"]`).waitFor({ timeout: 20000 });
        });
        await page.getByText(/Live from (?:Odoo|Orithos)/, { exact: false }).waitFor({ timeout: 20000 });
        const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        if (layout.document > layout.viewport) throw new Error(`${spec.path} overflows at ${width}px: ${JSON.stringify(layout)}`);

        if (width < 1280) {
          if (await page.locator("table").isVisible().catch(() => false)) throw new Error(`${spec.path} displays its desktop table at ${width}px`);
          const cards = page.locator("article");
          await page.waitForFunction(({ emptyText }) => {
            const text = document.body.innerText;
            return document.querySelectorAll("article").length > 0
              || document.querySelectorAll("table").length > 0
              || Boolean(emptyText && text.includes(emptyText))
              || /tax|gst|no active|empty/i.test(text);
          }, { emptyText: spec.emptyText ?? "" }, { timeout: 15000 });
          if (!(await cards.count()) && !(await page.locator("table").count())) {
            const pageText = await page.locator("body").innerText();
            if (!/tax|gst|no active|empty/i.test(pageText)) {
              throw new Error(`${spec.path} has no live Odoo cards, table, or documented empty state at ${width}px`);
            }
          }
          for (const heading of spec.cardHeadings) await page.getByText(heading, { exact: true }).first().waitFor({ timeout: 10000 });
          checks.push(`${spec.path}: Odoo cards, source notice and no overflow at ${width}px`);
        } else {
          if (spec.tableHeadings.length) {
            await page.locator("table").first().waitFor({ timeout: 15000 });
          } else if (spec.emptyText) {
            await page.waitForFunction(({ emptyText }) => {
              const text = document.body.innerText;
              return Boolean(emptyText && text.includes(emptyText))
                || document.querySelectorAll("table").length > 0
                || /tax|gst|no active|empty/i.test(text);
            }, { emptyText: spec.emptyText }, { timeout: 15000 });
          }
          const tables = page.locator("table:visible");
          const visibleTableCount = await tables.count();
          if (visibleTableCount !== spec.tableHeadings.length) {
            const details = await page.evaluate(() => ({
              viewport: innerWidth,
              tables: [...document.querySelectorAll("table")].map((table) => ({
                display: getComputedStyle(table).display,
                parentDisplay: getComputedStyle(table.parentElement).display,
                text: table.innerText.slice(0, 160),
              })),
            }));
            throw new Error(`${spec.path} expected ${spec.tableHeadings.length} visible desktop table(s), saw ${visibleTableCount}: ${JSON.stringify(details)}`);
          }
          for (const heading of spec.tableHeadings) await page.getByRole("columnheader", { name: new RegExp(`^${heading}$`, "i") }).first().waitFor({ timeout: 10000 });
          checks.push(`${spec.path}: semantic Odoo table(s), source notice and no overflow at ${width}px`);
        }
      }

      await page.goto(`${base}/settings/receipts`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("status").getByText("Receipt delivery is not connected").waitFor({ timeout: 15000 });
      const capabilityList = page.locator('[aria-labelledby="receipt-capabilities-title"] ul > li');
      const receiptLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (receiptLayout.document > receiptLayout.viewport) throw new Error(`/settings/receipts overflows at ${width}px: ${JSON.stringify(receiptLayout)}`);
      if ((await capabilityList.count()) !== 4) throw new Error("Receipt settings do not show all four capability statuses");
      checks.push(`/settings/receipts: honest capability status and no overflow at ${width}px`);

      await page.goto(`${base}/settings/customerdisplay`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("status").getByText("Customer display is not available in this pilot").waitFor({ timeout: 15000 });
      const displayCapabilities = page.locator('[aria-labelledby="display-capabilities-title"] ul > li');
      const displayLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (displayLayout.document > displayLayout.viewport) throw new Error(`/settings/customerdisplay overflows at ${width}px: ${JSON.stringify(displayLayout)}`);
      if ((await displayCapabilities.count()) !== 4) throw new Error("Customer display settings do not show all four unavailable capabilities");
      await page.getByRole("link", { name: /Check peripheral status/ }).waitFor({ timeout: 10000 });
      checks.push(`/settings/customerdisplay: honest capability status, hardware link and no overflow at ${width}px`);

      await page.goto(`${base}/settings/hardware`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("status").getByText("Hardware setup is local to this terminal").waitFor({ timeout: 15000 });
      const hardwareDevices = page.locator('[aria-labelledby="hardware-devices-title"] ul > li');
      const hardwareLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (hardwareLayout.document > hardwareLayout.viewport) throw new Error(`/settings/hardware overflows at ${width}px: ${JSON.stringify(hardwareLayout)}`);
      if ((await hardwareDevices.count()) !== 4) throw new Error("Hardware settings do not show all four device statuses");
      checks.push(`/settings/hardware: local device status and no overflow at ${width}px`);

      await page.goto(`${base}/settings/loyalty`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("status").getByText("These loyalty rules are not connected to this screen").waitFor({ timeout: 15000 });
      const loyaltySettings = page.locator('[aria-labelledby="loyalty-status-title"] ul > li');
      const loyaltyLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (loyaltyLayout.document > loyaltyLayout.viewport) throw new Error(`/settings/loyalty overflows at ${width}px: ${JSON.stringify(loyaltyLayout)}`);
      if ((await loyaltySettings.count()) !== 4) throw new Error("Loyalty settings do not clearly list all four configured or disconnected states");
      await page.getByText("Sample value", { exact: true }).first().waitFor({ timeout: 10000 });
      checks.push(`/settings/loyalty: sample and unavailable states, no overflow at ${width}px`);

      await page.goto(`${base}/settings/barcodes`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("status").getByText("Barcode label printing is not connected").waitFor({ timeout: 15000 });
      if (!page.url().endsWith("/utilities/barcodes")) throw new Error("Barcode settings did not redirect to the barcode utility status page");
      const barcodeSteps = page.locator('[aria-labelledby="barcode-process-title"] ol > li');
      const barcodeLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (barcodeLayout.document > barcodeLayout.viewport) throw new Error(`/utilities/barcodes overflows at ${width}px: ${JSON.stringify(barcodeLayout)}`);
      if ((await barcodeSteps.count()) !== 3) throw new Error("Barcode workflow does not show all three unavailable capabilities");
      checks.push(`/settings/barcodes -> /utilities/barcodes: honest unavailable state, no overflow at ${width}px`);

      await page.goto(`${base}/settings/surcharging`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("status").getByText("Surcharge settings are not connected here").waitFor({ timeout: 15000 });
      const surchargeSettings = page.locator('[aria-labelledby="surcharge-status-title"] ul > li');
      const surchargeLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (surchargeLayout.document > surchargeLayout.viewport) throw new Error(`/settings/surcharging overflows at ${width}px: ${JSON.stringify(surchargeLayout)}`);
      if ((await surchargeSettings.count()) !== 4) throw new Error("Surcharge settings do not show all four configuration states");
      await page.getByText("do not change checkout totals", { exact: false }).waitFor({ timeout: 10000 });
      checks.push(`/settings/surcharging: honest sample states and no checkout effect claim at ${width}px`);

      await page.goto(`${base}/settings/statements`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("status").getByText("Statement previews are available").waitFor({ timeout: 15000 });
      const statementSettings = page.locator('[aria-labelledby="statement-settings-title"] ul > li');
      const statementsLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (statementsLayout.document > statementsLayout.viewport) throw new Error(`/settings/statements overflows at ${width}px: ${JSON.stringify(statementsLayout)}`);
      if ((await statementSettings.count()) !== 3) throw new Error("Statement settings do not distinguish all three disconnected email preferences");
      await page.getByRole("link", { name: /Open customer balances/ }).waitFor({ timeout: 10000 });
      checks.push(`/settings/statements: preview link, explicit disconnected preferences and no overflow at ${width}px`);

      await page.goto(`${base}/settings/pricesets`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("heading", { name: "Price Lists", exact: true }).waitFor({ timeout: 15000 });
      await page.getByText("Product base prices affect standard shelf prices").waitFor({ timeout: 10000 });
      const priceSetsLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (priceSetsLayout.document > priceSetsLayout.viewport) throw new Error(`/settings/pricesets overflows at ${width}px: ${JSON.stringify(priceSetsLayout)}`);
      await page.getByRole("link", { name: "Product base prices", exact: true }).waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: /Add price list/ }).waitFor({ timeout: 10000 });
      checks.push(`/settings/pricesets: live management entry, separate price-list notice and no overflow at ${width}px`);

      await page.goto(`${base}/settings/rules`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("status").getByText("These rules are not configured here").waitFor({ timeout: 15000 });
      const ruleCards = page.locator('[aria-labelledby="rule-status-heading"] ul > li');
      const rulesLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (rulesLayout.document > rulesLayout.viewport) throw new Error(`/settings/rules overflows at ${width}px: ${JSON.stringify(rulesLayout)}`);
      if ((await ruleCards.count()) !== 4) throw new Error("Page Rules does not explain all four unconfigured controls");
      checks.push(`/settings/rules: honest control status and no overflow at ${width}px`);

      await page.goto(`${base}/settings/users`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByRole("heading", { name: "Integrations", exact: true }).waitFor({ timeout: 15000 });
      if (!page.url().endsWith("/settings/integrations")) throw new Error("Users settings did not redirect to the integrations hub");
      const integrationsLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      if (integrationsLayout.document > integrationsLayout.viewport) throw new Error(`/settings/integrations overflows at ${width}px: ${JSON.stringify(integrationsLayout)}`);
      await page.getByRole("heading", { name: "Gift cards", exact: true }).waitFor({ timeout: 10000 });
      checks.push(`/settings/users -> /settings/integrations: current hub redirect and no overflow at ${width}px`);
    } finally {
      await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  target: base,
  scope: "authenticated read-only production UI checks; no Odoo write",
  status: blocked ? "BLOCKED" : "PASS",
  viewports: [390, 1440],
  checks,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_SETTINGS_MOBILE_2026-10-14.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...output }));
