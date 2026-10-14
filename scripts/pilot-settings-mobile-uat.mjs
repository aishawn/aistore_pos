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

const base = "https://app.orithos.com.au";
const browser = await chromium.launch({ headless: true });
const checks = [];

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

      const page = await context.newPage();
      for (const spec of [
        { path: "/settings/payment", label: "Payment method source", cardHeadings: ["Odoo registers"], tableHeadings: ["Odoo register"] },
        { path: "/settings/tax", label: "Tax rate source", cardHeadings: ["Calculation"], tableHeadings: ["Calculation"] },
        { path: "/settings/registers-outlets", label: "Store and register source", cardHeadings: ["Odoo company", "Payment methods"], tableHeadings: ["Store", "Register"] },
      ]) {
        await page.goto(`${base}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.getByRole("region", { name: spec.label }).waitFor({ timeout: 20000 }).catch(async () => {
          await page.locator(`[aria-label="${spec.label}"]`).waitFor({ timeout: 20000 });
        });
        await page.getByText("Live from Odoo", { exact: false }).waitFor({ timeout: 20000 });
        const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        if (layout.document > layout.viewport) throw new Error(`${spec.path} overflows at ${width}px: ${JSON.stringify(layout)}`);

        if (width < 1280) {
          if (await page.locator("table").isVisible().catch(() => false)) throw new Error(`${spec.path} displays its desktop table at ${width}px`);
          const cards = page.locator("article");
          await cards.first().waitFor({ timeout: 15000 });
          if (!(await cards.count())) throw new Error(`${spec.path} has no live Odoo cards at ${width}px`);
          for (const heading of spec.cardHeadings) await page.getByText(heading, { exact: true }).first().waitFor({ timeout: 10000 });
          checks.push(`${spec.path}: Odoo cards, source notice and no overflow at ${width}px`);
        } else {
          await page.locator("table").first().waitFor({ timeout: 15000 });
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
          for (const heading of spec.tableHeadings) await page.getByRole("columnheader", { name: heading, exact: true }).first().waitFor({ timeout: 10000 });
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
  target: base,
  scope: "authenticated read-only production UI checks; no Odoo write",
  status: "PASS",
  viewports: [390, 1440],
  checks,
};
const outputPath = path.join(root, "docs", "UAT_SETTINGS_MOBILE_2026-10-14.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...output }));
