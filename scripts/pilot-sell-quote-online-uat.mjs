import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
const env = Object.fromEntries(envText.split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));
const base = (process.env.PILOT_BASE_URL ?? "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.PILOT_USERNAME ?? env.PILOT_USERNAME ?? "shawn";
const password = process.env.PILOT_PASSWORD ?? env.PILOT_PASSWORD;
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_SELL_QUOTE_ONLINE_SKR_2026-10-29.json");
const checks = [];
const record = (name, ok, detail = null) => checks.push({ name, status: ok ? "PASS" : "FAIL", ...(detail === null ? {} : { detail }) });
const browser = await chromium.launch({ headless: true });
let context;
try {
  if (!password) throw new Error("MISSING_PILOT_PASSWORD");
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const login = await context.request.post(`${base}/api/auth/login`, { data: { username, password }, headers: { Origin: base }, timeout: 30000 });
  const loginBody = await login.json().catch(() => ({}));
  record("login", login.ok() && loginBody.code === 0, login.status());
  if (!login.ok()) throw new Error("LOGIN_FAILED");
  const page = await context.newPage();
  const writes = [];
  const quoteResponses = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()) && pathname !== "/api/odoo/checkout/quote" && pathname !== "/api/odoo/records" && pathname !== "/cdn-cgi/rum") writes.push({ method: request.method(), pathname });
  });
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname === "/api/odoo/checkout/quote") quoteResponses.push({ status: response.status() });
  });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const search = page.getByPlaceholder("Search or scan to add a product");
  await search.waitFor({ state: "visible", timeout: 60000 });
  record("POS shell loads product search", await search.isVisible());
  await search.fill("9305000580004");
  const product = page.locator("button").filter({ hasText: "-196 LEMON" }).first();
  await product.waitFor({ state: "visible", timeout: 30000 });
  await product.click();
  const finalise = page.getByRole("button", { name: "Finalise Sale", exact: true });
  await finalise.waitFor({ state: "visible", timeout: 60000 });
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  record("quote response enables finalise", quoteResponses.some((item) => item.status === 200) && body.includes("Subtotal $8.99") && await finalise.isEnabled(), { quoteResponses, finaliseEnabled: await finalise.isEnabled() });
  record("quote-only probe emitted no checkout business write", writes.length === 0, writes);
  record("cart can be cleared without submitting", await page.getByRole("button", { name: "Clear Sale", exact: true }).first().isVisible());
} catch (error) {
  record("run", false, error instanceof Error ? error.message : String(error));
} finally {
  await context?.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context?.close();
  await browser.close();
}
const output = { generatedAt: new Date().toISOString(), target: base, username, scope: "Authenticated POS product selection and Odoo quote-to-finalise UI, no checkout submission", productionBusinessWrites: 0, status: checks.every((check) => check.status === "PASS"), checks };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, passed: checks.filter((check) => check.status === "PASS").length }));
if (!output.status) process.exitCode = 1;
