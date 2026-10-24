import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.lvh.me:3102";
const targetUrl = new URL(base);
if (!(targetUrl.hostname === "demo.lvh.me" && targetUrl.port === "3102") && !/^(localhost|127\.0\.0\.1|[\w-]+\.localhost)$/.test(targetUrl.hostname)) {
  throw new Error("The POS checkout fixture only accepts a localhost target.");
}

const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTreeDirty = Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim());
const screenshotDir = path.resolve(root, "docs/screenshots/2026-10-24-local-ui-sync/checkout");
const outputPath = path.resolve(root, "docs/UAT_LOCAL_UI_SYNC_CHECKOUT_2026-10-24.json");
fs.mkdirSync(screenshotDir, { recursive: true });

const user = { id: "fixture-user", username: "pos-checkout-fixture", name: "POS Checkout Fixture", isAdmin: true, vendorId: 41, outletId: 1 };
const checks = [];
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });

function product() {
  return { id: 11, name: "Fixture Product", display_name: "Fixture Product", barcode: false, default_code: "FX-11", list_price: 12.5, taxes_id: [1], price_included: 12.5, price_tax: 1.14, qty_available: 8, free_qty: 8, uom_id: [1, "Units"], pos_categ_ids: [1], available_in_pos: true };
}

async function newRegister({ method = "cash", checkoutMode = "success" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const writes = [];
  const checkoutBodies = [];
  let checkoutCount = 0;
  let statusCount = 0;
  let releaseCheckout;
  const checkoutGate = new Promise((resolve) => { releaseCheckout = resolve; });
  await context.addCookies([{ name: "orithos_access_token", value: "pos-checkout-fixture", url: base }]);
  await context.addInitScript((fixtureUser) => {
    // This HTTP preview lacks the HTTPS-only UUID API. One fixture sale uses
    // a deterministic UUID; this does not validate production secure contexts.
    if (typeof crypto.randomUUID !== "function") {
      crypto.randomUUID = () => "00000000-0000-4000-8000-000000000041";
    }
    localStorage.setItem("sf_token", "pos-checkout-fixture");
    localStorage.setItem("sf_user", JSON.stringify(fixtureUser));
  }, user);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const methodName = request.method();
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/auth/me" && methodName === "GET") return fulfill({ code: 0, data: user });
    if (url.pathname === "/api/odoo/session" && methodName === "GET") return fulfill({ user: { id: "fixture-odoo-user", name: "Fixture Odoo User" }, autoRecoverConfigured: false });
    if (url.pathname === "/api/odoo/pos-bootstrap" && methodName === "GET") {
      const paymentMethods = method === "both"
        ? [{ id: 2, name: "Cash", type: "cash", is_cash_count: true }, { id: 3, name: "Card", type: "bank", is_cash_count: false }]
        : [{ id: method === "card" ? 3 : 2, name: method === "card" ? "Card" : "Cash", type: method === "card" ? "bank" : "cash", is_cash_count: method !== "card" }];
      return fulfill({ activeSessionId: 5, configs: [{ id: 3, name: "Fixture Register", company: [41, "Fixture Store"], timezone: "Australia/Adelaide", session: { id: 5, name: "Fixture Session", state: "opened", config_id: [3, "Fixture Register"], user_id: [1, "Fixture User"], start_at: "2026-10-24T09:00:00Z", cashBalanceStart: 100, cashBalanceEnd: null }, paymentMethods, pricelistIds: [], cashRounding: null, onlyRoundCashMethod: false }] });
    }
    if (url.pathname === "/api/odoo/records" && methodName === "POST") {
      const body = request.postDataJSON();
      if (body.type === "products") return fulfill({ items: [product()], limit: body.limit ?? 50, offset: 0, hasNext: false });
      if (body.type === "posCategories") return fulfill({ items: [{ id: 1, name: "Fixture Category", parent_id: false }], limit: body.limit ?? 100, offset: 0, hasNext: false });
      return fulfill({ items: [], limit: body.limit ?? 50, offset: body.offset ?? 0, hasNext: false });
    }
    if (url.pathname === "/api/odoo/checkout/quote" && methodName === "POST") {
      const body = request.postDataJSON();
      return fulfill({ subtotal: 11.36, tax: 1.14, total: 12.5, unroundedTotal: 12.5, lines: body.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, uomFactor: line.uomFactor ?? 1, subtotal: 11.36, tax: 1.14, total: 12.5 })) });
    }
    if (url.pathname === "/api/odoo/checkout" && methodName === "POST") {
      writes.push(`${methodName} ${url.pathname}`);
      checkoutCount += 1;
      checkoutBodies.push(request.postDataJSON());
      if (checkoutMode === "gate") await checkoutGate;
      if (checkoutMode === "unknown") return fulfill({ message: "fixture timeout" }, 503);
      return fulfill({ saleId: 501, receipt: "POS/2026/00501", total: 12.5, gst: 1.14, subtotal: 11.36, tendered: checkoutBodies.at(-1)?.tendered ?? 12.5, change: Math.max(0, (checkoutBodies.at(-1)?.tendered ?? 12.5) - 12.5), lines: [{ name: "Fixture Product", quantity: 1, subtotal: 11.36, total: 12.5 }], date: "2026-10-24T09:30:00Z", session: "Fixture Session" });
    }
    if (url.pathname === "/api/odoo/checkout/status" && methodName === "GET") {
      statusCount += 1;
      return checkoutMode === "unknown" && statusCount === 1
        ? fulfill({ resultState: "pending" })
        : fulfill({ resultState: "confirmed", result: { saleId: 501, receipt: "POS/2026/00501", total: 12.5, gst: 1.14, subtotal: 11.36, tendered: 15, change: 2.5, lines: [{ name: "Fixture Product", quantity: 1, subtotal: 11.36, total: 12.5 }], date: "2026-10-24T09:30:00Z", session: "Fixture Session" } });
    }
    if (methodName !== "GET" && methodName !== "HEAD" && methodName !== "OPTIONS") {
      writes.push(`${methodName} ${url.pathname}`);
      return fulfill({ message: "Fixture blocked unexpected write" }, 405);
    }
    return fulfill({ items: [] });
  });
  await page.goto(`${base}/register/odoo`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.getByRole("combobox", { name: "Search products by name, barcode or code" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "All products", exact: true }).first().click();
  await page.getByRole("option", { name: /Fixture Product/ }).waitFor({ state: "visible" });
  return { context, page, writes, checkoutBodies, releaseCheckout, get checkoutCount() { return checkoutCount; }, get statusCount() { return statusCount; }, pageErrors };
}

try {
 const {context,page,writes,pageErrors,checkoutBodies}=await newRegister();
 const search=page.getByRole('combobox',{name:'Search products by name, barcode or code'});
 await search.fill('Fixture');await page.getByRole('option',{name:/Fixture Product/}).waitFor();
 await search.fill('');await page.getByRole('option',{name:/Fixture Product/}).waitFor();
 checks.push({id:'search-and-clear',status:'PASS'});
 await page.getByRole('button',{name:'List view',exact:true}).click();
 await page.getByRole('option',{name:/Fixture Product/}).waitFor();
 await page.getByRole('button',{name:'Grid view',exact:true}).click();
 checks.push({id:'catalogue-density',status:'PASS'});
 await page.getByRole('option',{name:/Fixture Product/}).click();
 await page.getByRole('button',{name:'Exact Cash',exact:true}).click();
 const tendered=page.locator('#cash-tendered');await tendered.fill('10.00');
 const shortfall=page.getByRole('button',{name:'Enter cash received',exact:true}).first();
 await shortfall.waitFor();assert.ok(await shortfall.isDisabled());
 checks.push({id:'cash-shortfall-blocks-checkout',status:'PASS'});
 await tendered.fill('15.00');await page.getByText('Change $2.50',{exact:true}).waitFor();
 const submit=page.getByRole('button',{name:'Finalise Sale',exact:true}).first();
 assert.equal(await submit.isDisabled(),false);await page.keyboard.press('Tab');await submit.focus();
 assert.notEqual(await submit.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 await page.screenshot({path:path.join(screenshotDir,'cash-ready-1440.png'),fullPage:true});
 await submit.click();await page.getByRole('dialog',{name:/Sale complete/}).waitFor();
 assert.equal(checkoutBodies.length,1);assert.equal(checkoutBodies[0].tendered,15);
 assert.ok((await page.getByRole('dialog').innerText()).includes('POS/2026/00501'));
 checks.push({id:'cash-change-checkout-receipt-focus',status:'PASS'});
 for(const width of [390,768,1440]) {
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const rect=await page.getByRole('dialog').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width);
  await page.screenshot({path:path.join(screenshotDir,`receipt-${width}.png`),fullPage:true});
  checks.push({id:'receipt-'+width,status:'PASS'});
 }
 assert.deepEqual(pageErrors,[]);assert.deepEqual(writes,['POST /api/odoo/checkout']);
 checks.push({id:'fixture-only-write-no-browser-errors',status:'PASS'});
 const report={status:'PASS',source:'Local browser fixtures; all API requests intercepted; UUID fixture for HTTP preview',nodeVersion:process.version,sourceHead,sourceTreeDirty,checks,productionBusinessWrites:0,fixtureWrites:writes};
 fs.writeFileSync(outputPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await context.close();
} catch(error) {
 const pages=browser.contexts().flatMap(c=>c.pages());
 const body=pages.length?(await pages.at(-1).locator('body').innerText()).slice(-1800):'';
 const report={status:'FAIL',sourceHead,sourceTreeDirty,checks,error:error.message,body};
 fs.writeFileSync(outputPath,JSON.stringify(report,null,2));console.error(JSON.stringify(report));process.exitCode=1;
} finally {await browser.close();}
