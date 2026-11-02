import process from "node:process";
import { chromium } from "playwright";

const user = process.env.DOKPLOY_USER;
const password = process.env.DOKPLOY_PASS;
const composeId = process.env.DOKPLOY_POS_COMPOSE_ID || "y4IqIQ8dvwEYL06Hppkjc";
if (!user || !password) throw new Error("DOKPLOY credentials are required in the environment");

const base = "https://dokploy.modkie.com";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator('input[name="email"]').fill(user);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForTimeout(1000);

  const compose = await page.evaluate(async (id) => {
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { composeId: id } } }));
    const response = await fetch(`/api/trpc/compose.one?batch=1&input=${input}`);
    const body = await response.json();
    const item = body?.[0]?.result?.data?.json;
    const env = Object.fromEntries(String(item?.env || "").split(/\r?\n/)
      .filter((line) => line && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }));
    let targets = [];
    let inventoryTargetsParseable = false;
    try {
      const rawTargets = String(env.INVENTORY_SNAPSHOT_TARGETS || "[]").trim()
        .replace(/^(['"])(.*)\1$/s, "$2");
      targets = JSON.parse(rawTargets);
      inventoryTargetsParseable = Array.isArray(targets);
    } catch {
      targets = [];
    }
    return {
      httpStatus: response.status,
      composeFound: Boolean(item?.composeId || item?.id),
      forecastEnabled: env.AI_FORECAST_ENABLED ?? null,
      forecastBaseUrl: env.AI_FORECAST_BASE_URL ?? null,
      odooDatabase: env.ODOO_DATABASE ?? null,
      inventoryTargets: targets.map((target) => ({
        companyId: target.companyId ?? null,
        timezone: target.timezone ?? null,
      })),
      inventoryTargetsPresent: Object.hasOwn(env, "INVENTORY_SNAPSHOT_TARGETS"),
      inventoryTargetsParseable,
    };
  }, composeId);

  await page.goto(`${base}/dashboard/project/6v8D8TDLvzJCQRH93Dx_z/environment/tm97Mlr4oIRKCExPqVucV/services/compose/${composeId}?tab=logs`, {
    waitUntil: "domcontentloaded", timeout: 30000,
  });
  await page.waitForTimeout(1500);
  let logStatus = "container selector unavailable";
  let workerStatuses = [];
  let errorLineCount = 0;
  const selector = page.getByRole("combobox").first();
  if (await selector.count()) {
    await selector.click();
    const option = page.getByRole("option", { name: /inventory-snapshots-1|inventory-snapshots/i }).first();
    if (await option.count()) {
      await option.click();
      await page.waitForTimeout(2500);
      const lines = (await page.locator("body").innerText()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      workerStatuses = lines.flatMap((line) => {
        try {
          const value = JSON.parse(line);
          return Number.isInteger(value.companyId) && typeof value.status === "string"
            ? [{ companyId: value.companyId, status: value.status }]
            : [];
        } catch {
          return [];
        }
      });
      errorLineCount = lines.filter((line) => /error|exception|traceback|failed/i.test(line)).length;
      logStatus = "selected";
    }
  }
  console.log(JSON.stringify({ compose, logStatus, workerStatuses, errorLineCount }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
