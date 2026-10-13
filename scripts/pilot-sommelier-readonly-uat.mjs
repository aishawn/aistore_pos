import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const base = "https://app.orithos.com.au";
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const checks = [];
const record = (name, status, evidence) => checks.push({ name, status, evidence });
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();

async function request(path, method = "GET", data) {
  const response = method === "GET"
    ? await context.request.get(`${base}${path}`)
    : await context.request.post(`${base}${path}`, { data });
  const body = await response.json().catch(() => ({}));
  if (!response.ok() || body.code !== 0) {
    throw new Error(`${method} ${path} failed (${response.status()}): ${body.message || "unexpected response"}`);
  }
  return body.data;
}

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error("Production Sommelier UAT login failed");

  const identify = await request("/api/ai/sommelier/identify?q=DEMO");
  const shiraz = identify.items?.find((item) => item.productId === 62);
  if (!shiraz) throw new Error("Odoo DEMO catalog did not return product 62");
  record("Odoo catalog identify", "PASS", `Found ${identify.items.length} DEMO wines; Shiraz product 62 is present.`);

  const recommendation = await request("/api/ai/sommelier/recommend", "POST", {
    wineType: "red",
    budgetMin: 0,
    budgetMax: 100,
    dryness: 0.5,
    body: 0.5,
    fruitiness: 0.5,
    oak: 0.5,
    tannin: 0.5,
    food: [],
    occasion: "UAT read-only",
  });
  const cards = recommendation.recommendations || [];
  if (!cards.length) throw new Error(`Recommendation returned no wines: ${recommendation.emptyReason || "no reason"}`);
  if (cards.some((item) => Number(item.stockQuantity) <= 0)) throw new Error("Recommendation included a wine with no free stock");
  const recommendedShiraz = cards.find((item) => item.productId === shiraz.productId);
  if (!recommendedShiraz) throw new Error("Red wine recommendation did not include the in-stock DEMO Shiraz");
  if (Number(recommendedShiraz.sellPrice) !== Number(shiraz.sellPrice)) throw new Error("Recommendation price differs from Odoo catalog sell price");
  if (Number(recommendedShiraz.stockQuantity) !== Number(shiraz.stockQuantity)) throw new Error("Recommendation stock differs from Odoo catalog free stock");
  record("Recommendation price and free-stock parity", "PASS", `Product 62: AUD ${recommendedShiraz.sellPrice}; free stock ${recommendedShiraz.stockQuantity}; recommendation agrees with Odoo identify data.`);

  const detail = await request(`/api/ai/sommelier/wines/${shiraz.productId}`);
  if (Number(detail.sellPrice) !== Number(shiraz.sellPrice) || Number(detail.stockQuantity) !== Number(shiraz.stockQuantity)) {
    throw new Error("Wine detail price or stock differs from Odoo identify data");
  }
  record("Wine detail parity", "PASS", `Product ${shiraz.productId} detail matches the Odoo catalog price and free stock.`);

  for (const direction of ["cheaper", "upgrade"]) {
    const similar = await request("/api/ai/sommelier/similar", "POST", { productId: shiraz.productId, direction });
    if ((similar.items || []).some((item) => Number(item.stockQuantity) <= 0)) {
      throw new Error(`${direction} alternatives included a wine with no free stock`);
    }
    record(`${direction} alternatives filter unavailable stock`, "PASS", `Returned ${(similar.items || []).length} alternatives; every result has positive free stock.`);
  }

  const anonymous = await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
  if (!anonymous.ok()) throw new Error("Could not end the authenticated UAT session");
  const denied = await context.request.post(`${base}/api/ai/sommelier/recommend`, {
    data: { wineType: "red", budgetMin: 0, budgetMax: 100, food: [] },
    headers: { Origin: base },
  });
  if (denied.status() !== 401) throw new Error(`Anonymous recommendation returned HTTP ${denied.status()}, expected 401`);
  record("Anonymous access guard", "PASS", "Recommendation API returns HTTP 401 after logout.");
} catch (error) {
  record("Sommelier read-only regression", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }); } catch { /* Session expires normally. */ }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  scope: "authenticated Odoo-backed Sommelier reads only; no model, image, feedback, sale, purchase, inventory, or register write",
  checks,
};
const outputPath = path.join(root, "docs", "UAT_SOMMELIER_REGRESSION_2026-10-13.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: checks.filter((check) => check.status === "PASS").length, failed: checks.filter((check) => check.status === "FAIL").length, checks }));
if (checks.some((check) => check.status === "FAIL")) process.exitCode = 2;
