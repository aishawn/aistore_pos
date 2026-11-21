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
let runtimeIdentity = null;
let observedBusinessWrites = [];
try {
  if (!password) throw new Error("MISSING_PILOT_PASSWORD");
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const runtimeResponse = await context.request.get(`${base}/api/public/version`, { timeout: 30000 });
  const runtimeBody = await runtimeResponse.json().catch(() => ({}));
  runtimeIdentity = {
    frontend: runtimeBody.frontend?.commit ?? null,
    backend: runtimeBody.backend?.commit ?? null,
  };
  record("runtime identity is available and aligned", runtimeResponse.ok()
    && /^[0-9a-f]{40}$/i.test(runtimeIdentity.frontend ?? "")
    && runtimeIdentity.frontend === runtimeIdentity.backend, runtimeIdentity);
  await context.close();
  context = null;
  const writes = [];
  observedBusinessWrites = writes;
  const quoteResponses = [];
  const quoteMatcher = (response) => ["/api/sales/quote", "/api/odoo/checkout/quote"].includes(new URL(response.url()).pathname)
    && response.status() === 200;
  const quoteForQuantity = (page, expectedQuantity) => page.waitForResponse((response) => {
    if (!quoteMatcher(response)) return false;
    try {
      const payload = response.request().postDataJSON();
      return payload.items?.length === 1 && Number(payload.items[0].quantity) === expectedQuantity;
    } catch {
      return false;
    }
  }, { timeout: 30000 });
  const quoteTotal = async (response) => {
    const payload = await response.json();
    const total = payload.data?.total ?? payload.total;
    return total == null ? null : Number(total).toFixed(2);
  };
  const quoteOnlyEndpoints = new Set(["/api/sales/quote", "/api/odoo/checkout/quote"]);
  const authSessionEndpoints = new Set(["/api/auth/refresh", "/api/auth/logout"]);
  const products = [
    { barcode: "9305000580004", name: "-196 LEMON", totals: new Map([[1, "8.99"], [3, "26.97"], [4, "26.99"], [7, "53.96"], [10, "51.99"]]) },
    { barcode: "9344844002884", name: "4 PINES NEW WORLD", totals: new Map([[1, "5.99"], [6, "23.99"], [7, "29.98"], [18, "57.99"]]) },
    { barcode: "9344844001375", name: "4 PINES PACIFIC", totals: new Map([[1, "4.99"], [6, "19.99"], [7, "24.98"], [18, "51.99"]]) },
  ];
  let productPagesClosed = 0;
  for (const productCase of products) {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const login = await context.request.post(`${base}/api/auth/login`, { data: { username, password }, headers: { Origin: base }, timeout: 30000 });
    const loginBody = await login.json().catch(() => ({}));
    record(`login for ${productCase.name}`, login.ok() && loginBody.code === 0, login.status());
    if (!login.ok()) throw new Error("LOGIN_FAILED");
    const page = await context.newPage();
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())
        && !quoteOnlyEndpoints.has(pathname)
        && !authSessionEndpoints.has(pathname)
        && pathname !== "/api/odoo/records"
        && pathname !== "/cdn-cgi/rum") {
        writes.push({ method: request.method(), pathname });
      }
    });
    page.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      if (quoteOnlyEndpoints.has(pathname)) {
        let requestedQuantity = null;
        try { requestedQuantity = response.request().postDataJSON().items?.[0]?.quantity ?? null; } catch {}
        quoteResponses.push({ status: response.status(), pathname, requestedQuantity });
      }
    });
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const search = page.getByPlaceholder("Search or scan to add a product");
    await search.waitFor({ state: "visible", timeout: 60000 });
    if (productCase === products[0]) record("POS shell loads product search", await search.isVisible());
    await search.fill(productCase.barcode);
    const productButton = page.locator("button").filter({ hasText: productCase.name }).first();
    await productButton.waitFor({ state: "visible", timeout: 30000 });
    const firstQuote = quoteForQuantity(page, 1);
    await productButton.click();
    const initialQuote = await firstQuote;
    const finalise = page.getByRole("button", { name: "Finalise Sale", exact: true });
    await finalise.waitFor({ state: "visible", timeout: 60000 });

    const observedTotals = {};
    const displayedTotals = {};
    let quantity = 1;
    const readTotal = async () => {
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      const totals = [...body.matchAll(/\bTOTAL\s+\$([\d,]+\.\d{2})/g)];
      return totals.length ? totals.at(-1)[1].replaceAll(",", "") : null;
    };
    observedTotals[quantity] = await quoteTotal(initialQuote);
    displayedTotals[quantity] = await readTotal();
    const increment = page.getByRole("button", { name: "+ Qty", exact: true });
    for (const targetQuantity of productCase.totals.keys()) {
      while (quantity < targetQuantity) {
        const nextQuantity = quantity + 1;
        const nextQuote = quoteForQuantity(page, nextQuantity);
        await increment.click();
        const quoteResponse = await nextQuote;
        quantity = nextQuantity;
        observedTotals[quantity] = await quoteTotal(quoteResponse);
        if (productCase.totals.has(quantity)) {
          const expected = productCase.totals.get(quantity);
          let displayed = await readTotal();
          for (let attempt = 0; attempt < 50 && displayed !== expected; attempt += 1) {
            await page.waitForTimeout(100);
            displayed = await readTotal();
          }
          displayedTotals[quantity] = displayed;
        }
      }
    }
    const matrixMatches = [...productCase.totals].every(([qty, total]) => observedTotals[qty] === total
      && displayedTotals[qty] === total);
    record(`tier quote matrix: ${productCase.name}`, matrixMatches && await finalise.isEnabled(), {
      barcode: productCase.barcode,
      expectedTotals: Object.fromEntries(productCase.totals),
      observedTotals,
      displayedTotals,
      finaliseEnabled: await finalise.isEnabled(),
    });
    await page.close();
    await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
    await context.close();
    context = null;
    productPagesClosed += 1;
  }
  record("quote-only probe emitted no checkout business write", writes.length === 0, writes);
  record("quote-only contexts closed without checkout", productPagesClosed === products.length
    && quoteResponses.length >= products.length && quoteResponses.every((response) => response.status === 200));
} catch (error) {
  record("run", false, error instanceof Error ? error.message : String(error));
} finally {
  await context?.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context?.close();
  await browser.close();
}
const output = { generatedAt: new Date().toISOString(), target: base, username, runtimeIdentity, scope: "Authenticated three-product POS tier quote matrix in isolated quote-only sessions, no checkout submission", productionBusinessWrites: observedBusinessWrites.length, status: checks.every((check) => check.status === "PASS"), checks };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, passed: checks.filter((check) => check.status === "PASS").length }));
if (!output.status) process.exitCode = 1;
