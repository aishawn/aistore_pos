import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTreeDirty = Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim());
const expectedRuntimeCommit = process.env.PILOT_EXPECTED_RUNTIME_SHA ?? sourceCommit;
if (!/^[\da-f]{40}$/i.test(expectedRuntimeCommit)) throw new Error("INVALID_EXPECTED_RUNTIME_SHA");
const suffix = expectedRuntimeCommit.slice(0, 8).toUpperCase();
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? `docs/UAT_REGISTER_CART_MOBILE_READONLY_2026-10-26_RUNTIME-${suffix}.json`);
const screenshotDir = path.resolve(root, process.env.PILOT_UAT_SCREENSHOT_DIR ?? "docs/screenshots/register-cart-mobile-readonly");
const checks = [];
const blockedWrites = [];
const allowedReadPosts = [];
const fixtureReads = [];
const optionalImageFailures = [];
let version = {};
let runtime = {};
let screenshot = null;

function record(name, pass, details = null) {
  checks.push({ name, status: pass ? "PASS" : "FAIL", ...(details ? { details } : {}) });
}

let browser;
let context;
let authenticated = false;
try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 30000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  authenticated = true;

  const versionResponse = await context.request.get(`${base}/api/public/version`, { timeout: 20000 });
  version = await versionResponse.json().catch(() => ({}));
  if (version?.frontend?.commit !== expectedRuntimeCommit || version?.backend?.commit !== expectedRuntimeCommit) throw new Error("RUNTIME_SHA_MISMATCH");
  const session = await context.request.get(`${base}/api/odoo/session`, { headers: { Origin: base }, timeout: 45000 });
  const sessionBody = await session.json().catch(() => ({}));
  if (!session.ok() || !sessionBody.user) throw new Error(`ODOO_SESSION_WARMUP_FAILED_${session.status()}`);

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET" && url.origin === new URL(base).origin && url.pathname === "/api/sell/parked") {
      fixtureReads.push({ path: url.pathname, reason: "Avoid the legacy GET endpoint that may clean up parked sales." });
      return route.fulfill({ status: 200, json: { code: 0, data: [] } });
    }
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())
      || request.method() === "POST" && url.origin === new URL(base).origin && ["/api/auth/refresh", "/api/odoo/checkout/quote"].includes(url.pathname)) return route.continue();
    if (request.method() === "POST" && url.origin === new URL(base).origin && url.pathname === "/api/odoo/records") {
      try {
        const body = request.postDataJSON();
        const allowedKeys = body?.type === "products"
          ? ["type", "query", "limit", "offset", "categoryId", "stockOnly", "catalogueView"]
          : body?.type === "posCategories"
            ? ["type", "limit", "offset"]
            : [];
        if (allowedKeys.length && Object.keys(body).every((key) => allowedKeys.includes(key))) {
          allowedReadPosts.push({ type: body.type, keys: Object.keys(body).filter((key) => key !== "type") });
          return route.continue();
        }
      } catch { /* Unknown payloads stay blocked. */ }
    }
    blockedWrites.push({ method: request.method(), path: url.pathname });
    return route.fulfill({ status: 405, json: { message: "Read-only mobile cart UAT blocked this request" } });
  });

  const page = await context.newPage();
  const errors = [];
  const apiFailures = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/") && response.status() >= 400) {
      const failure = { path: url.pathname, status: response.status() };
      if (/\/api\/odoo\/products\/\d+\/image$/.test(url.pathname)) optionalImageFailures.push(failure);
      else apiFailures.push(failure);
    }
  });
  await page.goto(`${base}/register`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("heading", { name: "Sell", exact: true }).waitFor({ timeout: 30000 });

  const allProducts = page.getByRole("button", { name: "All products", exact: true }).first();
  if (await allProducts.isVisible().catch(() => false)) await allProducts.click();
  const results = page.getByRole("listbox", { name: "POS product search results", exact: true });
  await results.waitFor({ timeout: 30000 });
  const firstProduct = results.getByRole("option").filter({ visible: true }).first();
  await firstProduct.waitFor({ timeout: 15000 });
  if (await firstProduct.isDisabled()) throw new Error("NO_SELLABLE_PRODUCT_IN_FIRST_PAGE");
  const productText = (await firstProduct.innerText()).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const productName = productText.find((line) => !/^\$?\d+(?:\.\d{2})?$/.test(line) && !/^(?:\d+(?:\.\d+)?\s+(?:avail\.|left)|No stock)$/.test(line));
  if (!productName) throw new Error("PRODUCT_NAME_NOT_FOUND_IN_CATALOG_CARD");
  await firstProduct.click();

  const backToProductsBeforePayment = page.getByRole("button", { name: "Back to products", exact: true });
  if (await backToProductsBeforePayment.isVisible().catch(() => false)) {
    await backToProductsBeforePayment.click({ force: true });
    await page.waitForFunction(() => ![...document.querySelectorAll("aside")].some((element) => element.className.includes("fixed")), null, { timeout: 10000 });
  }
  const eftposButton = page.getByRole("button", { name: "EFTPOS", exact: true }).first();
  await eftposButton.waitFor({ state: "visible", timeout: 10000 });
  await eftposButton.click({ force: true });
  record("Card payment can be selected before opening the mobile cart", await eftposButton.evaluate((element) => element.className.includes("ring-2")));

  const cartButton = page.getByRole("button", { name: "Cart", exact: true });
  await cartButton.waitFor({ timeout: 10000 });
  await cartButton.click();
  const cartAside = page.locator("aside").filter({ hasText: "Subtotal" }).first();
  const cartLine = cartAside.locator("li").filter({ hasText: productName }).first();
  await cartLine.waitFor({ timeout: 10000 });
  const rectAfterCartClick = await cartAside.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight, visible: rect.bottom > 0 && rect.top < innerHeight };
  });
  record("Cart button reveals cart within the mobile viewport", rectAfterCartClick.visible, rectAfterCartClick);
  const finaliseButton = cartAside.locator("button").last();
  const finaliseRect = await finaliseButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, viewportHeight: innerHeight, visible: rect.top >= 0 && rect.bottom <= innerHeight };
  });
  record("Finalise action fits the mobile viewport without scrolling", finaliseRect.visible, finaliseRect);

  record("Added product appears in cart", (await cartLine.innerText()).includes(productName), { productName });
  const increase = cartLine.getByRole("button", { name: /^Increase / });
  await cartLine.locator("div[role=button]").first().click();
  await increase.waitFor({ state: "visible", timeout: 10000 });
  await increase.click();
  await page.getByText("2 items", { exact: true }).waitFor({ timeout: 10000 });
  record("Cart quantity control updates line quantity", (await cartLine.innerText()).includes("2"));

  await page.waitForFunction(() => {
    const aside = [...document.querySelectorAll("aside")].find((element) => element.innerText.includes("Subtotal"));
    return aside && !aside.innerText.includes("Calculating…") && !aside.innerText.includes("Waiting for tax…");
  }, null, { timeout: 30000 });
  const checkoutReadiness = await cartAside.evaluate((element) => {
    const totalLabel = [...element.querySelectorAll("span")].find((node) => node.textContent.trim().toLowerCase() === "total");
    const total = totalLabel?.parentElement?.querySelector("p")?.innerText.replace(/\s+/g, " ").trim() ?? "";
    const finaliseLabel = element.querySelectorAll("button").item(element.querySelectorAll("button").length - 1)?.innerText.trim() ?? "";
    const settled = !element.innerText.includes("Calculating…") && !element.innerText.includes("Waiting for tax…");
    return { total, finaliseLabel, settled };
  });
  record("Checkout quote settles to a non-zero total", checkoutReadiness.settled && checkoutReadiness.total !== "$0.00", checkoutReadiness);
  record("Card checkout remains available from the mobile cart", checkoutReadiness.settled && checkoutReadiness.finaliseLabel === "Finalise Sale", checkoutReadiness);

  const screenshotPath = path.join(screenshotDir, `cart-390-${suffix.toLowerCase()}.png`);
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: screenshotPath });
  screenshot = path.relative(root, screenshotPath).replaceAll(path.sep, "/");
  record("No browser errors or API read failures", errors.length === 0 && apiFailures.length === 0, { errors, apiFailures });
  const backToProducts = page.getByRole("button", { name: "Back to products", exact: true });
  const canReturnToProducts = await backToProducts.isVisible().catch(() => false);
  record("Back to products returns to the mobile catalogue", canReturnToProducts);
  if (canReturnToProducts) {
    await backToProducts.click();
    await cartButton.waitFor({ state: "visible", timeout: 10000 });
  }
  await page.close();
} catch (error) {
  record("Run", false, error instanceof Error ? error.message : "Unexpected failure");
} finally {
  if (context && authenticated) await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base }, timeout: 5000 }).catch(() => null);
  await browser?.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  target: base,
  sourceCommit,
  sourceTreeDirty,
  expectedRuntimeCommit,
  runtime: {
    frontendCommit: version?.frontend?.commit ?? null,
    backendCommit: version?.backend?.commit ?? null,
    matchesExpectedRuntimeCommit: version?.frontend?.commit === expectedRuntimeCommit && version?.backend?.commit === expectedRuntimeCommit,
  },
  viewport: { width: 390, height: 844 },
  scope: "Mobile register add-to-cart, cart visibility, quantity update, and read-only quote; all other API mutations blocked",
  status: checks.some((check) => check.status === "FAIL") || blockedWrites.length ? "FAIL" : "PASS",
  businessWrites: 0,
  blockedWrites,
  allowedReadPosts,
  fixtureReads,
  optionalImageFailures,
  screenshot,
  checks,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, failed: checks.filter((check) => check.status === "FAIL").length, blockedWrites: blockedWrites.length, businessWrites: output.businessWrites }));
if (output.status !== "PASS") process.exitCode = 1;
