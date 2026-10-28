import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PILOT_BASE_URL ?? "https://skr.orithos.com.au").replace(/\/+$/, "");
const username = process.env.PILOT_USERNAME ?? "shawn";
const password = process.env.PILOT_PASSWORD;
const checks = [];
const check = (name, passed, detail = {}) => {
  checks.push({ name, status: passed ? "PASS" : "FAIL", detail });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}`, detail);
  return passed;
};
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 500);

let browser;
let context;
try {
  if (!password) throw new Error("PILOT_PASSWORD is required and is never written to evidence");
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const apiLogin = await context.request.post(`${base}/api/auth/login`, { data: { username, password }, headers: { Origin: base } });
  const apiLoginBody = await apiLogin.json().catch(() => ({}));
  const storage = await context.request.storageState();
  await context.addCookies(storage.cookies);
  check("browser.login", apiLogin.ok() && apiLoginBody.code === 0 && storage.cookies.length > 0, { httpStatus: apiLogin.status(), cookieCount: storage.cookies.length });
  if (!apiLogin.ok() || apiLoginBody.code !== 0) throw new Error("LOGIN_FAILED");
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  check("browser.store.route", !page.url().includes("/login"), { url: page.url() });

  const session = await context.request.get(`${base}/api/odoo/session`);
  const sessionBody = await session.json().catch(() => ({}));
  check("browser.odoo.session", session.ok() && Boolean(sessionBody.user), { httpStatus: session.status(), user: sessionBody.user?.username });
  const bootstrap = await context.request.get(`${base}/api/odoo/pos-bootstrap`);
  const bootstrapBody = await bootstrap.json().catch(() => ({}));
  const config = (bootstrapBody.configs ?? []).find((item) => item.session) ?? bootstrapBody.configs?.[0];
  const cash = config?.paymentMethods?.find((item) => item.is_cash_count) ?? config?.paymentMethods?.[0];
  check("browser.register.ready", bootstrap.ok() && Number.isSafeInteger(config?.id) && Number.isSafeInteger(cash?.id), { httpStatus: bootstrap.status(), configId: config?.id, sessionId: config?.session?.id, paymentMethodId: cash?.id });
  if (!config?.id || !cash?.id) throw new Error("NO_OPEN_REGISTER");

  const productsResponse = await context.request.post(`${base}/api/odoo/records`, { data: { type: "products", limit: 100 }, headers: { Origin: base } });
  const productsBody = await productsResponse.json().catch(() => ({}));
  const product = (productsBody.items ?? []).find((item) => item.available_in_pos !== false && Number(item.price_included ?? item.list_price ?? 0) > 0 && Number(item.price_included ?? item.list_price ?? 0) < 40 && Number(item.free_qty ?? item.qty_available ?? 0) > 0);
  const beforeQty = Number(product?.free_qty ?? product?.qty_available ?? NaN);
  check("browser.product.available", productsResponse.ok() && Number.isSafeInteger(product?.id) && Number.isFinite(beforeQty) && beforeQty > 0, { productId: product?.id, productName: product?.name, beforeQty, price: product?.price_included ?? product?.list_price });
  if (!product) throw new Error("NO_SELLABLE_PRODUCT");

  const quote = await context.request.post(`${base}/api/odoo/checkout/quote`, { data: { configId: config.id, paymentMethodId: cash.id, lines: [{ productId: product.id, quantity: 1 }] }, headers: { Origin: base } });
  const quoteBody = await quote.json().catch(() => ({}));
  const total = Number(quoteBody.total);
  check("browser.quote", quote.ok() && Number.isFinite(total) && total > 0 && typeof quoteBody.signature === "string", { httpStatus: quote.status(), total, tax: quoteBody.tax });

  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const allProducts = page.getByRole("button", { name: "All products", exact: true });
  if (await allProducts.count()) {
    await allProducts.click({ force: true });
    await page.waitForTimeout(1_000);
  }
  const productButton = page.locator(`#pos-product-option-${product.id}`);
  const searchInput = page.locator("input").nth(1);
  await searchInput.waitFor({ state: "visible", timeout: 20_000 });
  if (await searchInput.count()) {
    const queryText = String(product.default_code || product.name).slice(0, 80);
    await searchInput.click();
    await page.keyboard.type(queryText);
  }
  await page.waitForTimeout(4_000);
  await productButton.waitFor({ state: "visible", timeout: 20_000 });
  await productButton.click();
  check("browser.cart.add", await page.locator("body").innerText().then((text) => text.includes(String(product.name).slice(0, 12))), { productName: product.name });

  const paymentSelect = page.locator("select").filter({ has: page.locator('option:has-text("Cash")') }).first();
  if (await paymentSelect.count()) await paymentSelect.selectOption({ label: "Cash" });
  const exactCash = page.getByRole("button", { name: "Exact Cash", exact: true });
  if (await exactCash.count()) await exactCash.click();
  const cashInput = page.locator("#cash-tendered");
  if (await cashInput.count()) await cashInput.fill(total.toFixed(2));
  const finalise = page.getByRole("button", { name: /Finalise/ }).first();
  await finalise.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((node) => /Finalise/.test(node.textContent ?? "") && !node.disabled), null, { timeout: 20_000 });
  await finalise.click();
  await page.getByRole("heading", { name: /Sale complete/i }).waitFor({ timeout: 30_000 });
  const receiptText = compact(await page.locator("body").innerText());
  check("browser.sale.receipt", /Sale complet|Receipt/i.test(receiptText), { text: receiptText });
  await page.getByRole("button", { name: /New sale|Close receipt/i }).first().click().catch(() => {});

  const salesResponse = await context.request.post(`${base}/api/odoo/records`, { data: { type: "sales", limit: 30 }, headers: { Origin: base } });
  const salesBody = await salesResponse.json().catch(() => ({}));
  const sale = (salesBody.items ?? []).find((item) => Number(item.product_id ?? item.productId) === product.id && Number(item.amount_total) > 0) ?? (salesBody.items ?? []).find((item) => Number(item.amount_total) > 0);
  const detailResponse = sale?.id ? await context.request.get(`${base}/api/odoo/sales/${sale.id}`, { headers: { Origin: base } }) : null;
  const detailBody = detailResponse ? await detailResponse.json().catch(() => ({})) : {};
  const receipt = sale?.pos_reference ?? sale?.receipt ?? sale?.reference ?? detailBody.pos_reference ?? detailBody.receipt ?? detailBody.name ?? (receiptText.match(/\b\d{3}-\d-\d{6}\b/) || [])[0] ?? sale?.name;
  check("browser.sale.readback", salesResponse.ok() && Boolean(sale?.id) && Boolean(receipt), { httpStatus: salesResponse.status(), saleId: sale?.id, receipt, saleName: sale?.name });
  if (!receipt) throw new Error("SALE_RECEIPT_NOT_FOUND");

  await page.goto(`${base}/history/odoo`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.getByRole("button", { name: String(receipt) }).first().waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: String(receipt) }).first().click();
  await page.getByRole("heading", { name: /Sale receipt/i }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: /Refund full sale/i }).click();
  await page.getByRole("heading", { name: /Confirm full refund/i }).waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /Record full refund/i }).click();
  await page.waitForFunction(() => /Refund recorded|already been refunded|Refund failed/i.test(document.body.innerText), null, { timeout: 30_000 });
  const refundText = compact(await page.locator("body").innerText());
  const refundStatusText = compact((await page.getByRole("status").allTextContents()).join(" "));
  check("browser.refund.receipt", /Refund recorded|Refund confirmed|already been refunded/i.test(refundStatusText), { statusText: refundStatusText, bodyText: refundText });

  const afterProducts = await context.request.post(`${base}/api/odoo/records`, { data: { type: "products", query: String(product.default_code || product.name).slice(0, 120), limit: 100 }, headers: { Origin: base } });
  const afterBody = await afterProducts.json().catch(() => ({}));
  const after = (afterBody.items ?? []).find((item) => item.id === product.id);
  const afterQty = Number(after?.free_qty ?? after?.qty_available ?? NaN);
  check("browser.refund.inventory.reconciles", afterProducts.ok() && Number.isFinite(afterQty) && Math.abs(afterQty - beforeQty) < 0.001, { beforeQty, afterQty, productId: product.id });
  const postSales = await context.request.post(`${base}/api/odoo/records`, { data: { type: "sales", limit: 30 }, headers: { Origin: base } });
  const postSalesBody = await postSales.json().catch(() => ({}));
  const refundRow = (postSalesBody.items ?? []).find((item) => Number(item.amount_total) < 0 && Number(item.id) > Number(sale.id));
  check("browser.refund.history", postSales.ok() && Boolean(refundRow), { httpStatus: postSales.status(), refundId: refundRow?.id ?? null, refundReceipt: refundRow?.pos_reference ?? null, refundTotal: refundRow?.amount_total ?? null });
} catch (error) {
  check("run", false, { message: error instanceof Error ? error.message : String(error) });
} finally {
  await context?.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context?.close();
  await browser?.close();
}

const output = { generatedAt: new Date().toISOString(), target: base, username, databaseMode: "shared-uat", odooDatabase: "aipos_uat", scope: "browser cash sale -> receipt UI -> sales history -> full refund UI -> inventory reconciliation", status: checks.every((item) => item.status === "PASS"), checks };
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? `docs/UAT_SELL_REFUND_BROWSER_SKR_${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, passed: checks.filter((item) => item.status === "PASS").length }));
if (!output.status) process.exitCode = 1;
