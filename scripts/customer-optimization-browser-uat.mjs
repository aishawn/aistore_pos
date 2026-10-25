import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const root = path.resolve(import.meta.dirname, "..");
const base = process.env.PILOT_BASE_URL || "http://demo.lvh.me:3102";
assert.ok(["localhost", "127.0.0.1", "demo.lvh.me"].includes(new URL(base).hostname), "Local fixture only");
const directory = path.join(root, "docs/screenshots/2026-10-25-customer-optimization"); fs.mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server", "--host-resolver-rules=MAP demo.lvh.me 127.0.0.1"] });
const checks = [], errors = [], simulatedWrites = [];
let completed = false;
function record(width, name) { checks.push({ width, name }); console.log(`PASS ${width} ${name}`); }
try {
  for (const width of [390, 768, 1440]) {
    const user = { id: 1, username: "fixture-admin", name: "Fixture Admin", isAdmin: true, vendorId: 41 };
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addCookies([{ name: "orithos_access_token", value: "customer-fixture", url: base }]);
    await context.addInitScript((user) => { localStorage.setItem("sf_token", "customer-fixture"); localStorage.setItem("sf_user", JSON.stringify(user)); }, user);
    const account = { id: 501, name: "Fixture Account", phone: "0412345678", email: "fixture@example.test", ref: "F-501", credit: 25, company_type: "company", property_product_pricelist: [3, "Wholesale"], category_id: [4] };
    let attempts = 0, available = true, giftFailure = false;
    const customerQueries = [];
    await context.route("**/api/**", async (route) => {
      const req = route.request(), url = new URL(req.url()), method = req.method();
      const send = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/api/auth/me") return send({ code: 0, data: user });
      if (url.pathname === "/api/odoo/session") return send({ user: { id: "1", name: "Staff", allowedCompanyIds: [41] }, autoRecoverConfigured: false });
      if (url.pathname === "/api/odoo/pos-bootstrap") return send({ configs: [{ id: 2, name: "Register", timezone: "Australia/Adelaide", company: [41, "Store"], session: null, paymentMethods: [] }], activeSessionId: null });
      if (url.pathname === "/api/odoo/customer-tools") return send({ baseUrl: "https://odoo.fixture.invalid" });
      if (url.pathname === "/api/odoo/records") { const body = req.postDataJSON(); customerQueries.push(body); return send({ items: [account], hasNext: body.offset === 0 }); }
      if (url.pathname === "/api/odoo/customer-groups") return send({ items: [{ id: 4, name: "Members", color: 0, parentId: null, parentName: null, customerCount: 1, writable: true }], hasNext: false });
      if (url.pathname === "/api/odoo/pricelists") return send({ items: [{ id: 3, name: "Wholesale", currency: "AUD", currencyId: 1, company: "Store", companyId: 41, active: true }], hasNext: false });
      if (url.pathname === "/api/odoo/pricelists/3/details") return send({ rules: [{ id: 1, product_id: [10, "Fixture Wine"], min_quantity: 12, compute_price: "fixed", fixed_price: 8, date_start: false, date_end: false }], rulesHasNext: false, customers: [{ id: 501, name: account.name }], customersHasNext: false, customersAvailable: true });
      if (url.pathname === "/api/odoo/customer-balances") return send({ items: [{ ...account, currency: "AUD", totalInvoiced: 100, pricelist: "Wholesale" }], hasNext: false });
      if (url.pathname.endsWith("/invoices")) {
        const offset = Number(url.searchParams.get("offset") || 0);
        return send({ customer: account, items: [{ id: offset + 1, name: offset ? "Invoice page two" : "Credit note fixture", moveType: offset ? "out_invoice" : "out_refund", amountTotal: offset ? 33 : -22, amountResidual: offset ? 11 : -11, paymentState: "partial", currency: offset ? "AUD" : "NZD", dueDate: "2026-10-30" }], hasNext: offset === 0 });
      }
      if (url.pathname === "/api/odoo/gift-cards") return giftFailure ? send({ message: "Fixture service unavailable" }, 502) : send({ available, module: available ? "loyalty.card" : null, items: available ? [{ id: 1, code: "GIFT-ONLY", balance: 50, currency: "AUD", partner: "Fixture Account", program: "Gifts", status: "active" }] : [], hasNext: false });
      if (url.pathname === "/api/odoo/customers" && method === "POST") { simulatedWrites.push(req.postDataJSON()); attempts++; return attempts === 1 ? send({ message: "Fixture temporary failure" }, 422) : send({ id: 902, name: "New fixture" }, 201); }
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) return send({ message: "Unexpected fixture write blocked" }, 405);
      return send({ code: 0, data: {} });
    });
    const page = await context.newPage(); page.setDefaultTimeout(20000); page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/customers/odoo`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByRole("button", { name: "Fixture Account", exact: true }).waitFor().catch(async (error) => { console.log(await page.locator("body").innerText()); console.log(errors); await page.screenshot({path:path.join(directory, "failure.png")}); throw error; });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.waitForFunction(() => document.body.textContent.includes("Showing 41")).catch(async (error) => { console.log(customerQueries); console.log(await page.locator("body").innerText()); throw error; });
    await page.getByText("Filters", { exact: true }).click();
    await page.getByRole("combobox", { name: "Customer group", exact: true }).selectOption("4");
    await page.waitForFunction(() => document.body.textContent.includes("Filters · active"));
    await page.waitForTimeout(300);
    assert.ok(customerQueries.some((query) => query.groupId === 4 && query.offset === 0));
    record(width, "server filters and directory rows");
    await page.getByRole("button", { name: "Fixture Account", exact: true }).click();
    const detail = page.getByRole("dialog"); await detail.getByRole("heading", { name: "Fixture Account" }).waitFor();
    await detail.getByRole("link", { name: "Open unpaid invoices" }).waitFor();
    await page.screenshot({ path: path.join(directory, `customer-details-${width}.png`) });
    await page.keyboard.press("Escape"); await detail.waitFor({ state: "detached" }); record(width, "customer detail and Escape");
    await page.getByRole("button", { name: "Manage groups" }).click();
    await page.getByRole("dialog", { name: "Manage customer groups" }).getByRole("heading", { name: "Groups", exact: true }).waitFor();
    await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" }); record(width, "embedded group management");
    await page.getByRole("button", { name: "New customer" }).click();
    const form = page.getByRole("dialog"); await form.getByLabel("Customer name").fill("New fixture");
    assert.equal(await form.getByRole("combobox", { name: "Type", exact: true }).isVisible(), false);
    await form.getByText("Advanced information", { exact: true }).click();
    await form.getByRole("combobox", { name: "Price list", exact: true }).selectOption("3");
    await form.getByRole("checkbox", { name: "Members", exact: true }).check();
    await form.getByRole("button", { name: "Create customer", exact: true }).click();
    await form.getByRole("alert").waitFor(); assert.equal(await form.getByLabel("Customer name").inputValue(), "New fixture");
    await form.getByRole("button", { name: "Create customer", exact: true }).click(); await form.waitFor({ state: "detached" });
    assert.equal(simulatedWrites.at(-1).property_product_pricelist, 3); assert.deepEqual(simulatedWrites.at(-1).category_id, [4]); record(width, "quick create advanced fields and retry preservation");
    await page.goto(`${base}/pricelists`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByRole("button", { name: "Wholesale", exact: true }).click();
    await page.getByRole("dialog").getByText("Fixture Wine", { exact: true }).waitFor();
    assert.match(await page.getByRole("dialog").innerText(), /minimum 12 base units/);
    assert.match(await page.getByRole("dialog").getByRole("link", { name: "Edit rules in Odoo" }).getAttribute("href"), /product.pricelist.*id=3/);
    await page.screenshot({ path: path.join(directory, `price-rules-${width}.png`) });
    await page.keyboard.press("Escape"); record(width, "read-only price rules and assigned customers");
    await page.goto(`${base}/customers/balances`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByRole("button", { name: "Open invoices", exact: true }).click();
    await page.getByText("Credit note fixture", { exact: true }).waitFor(); assert.match(await page.getByRole("dialog").innerText(), /NZD -11.00/);
    await page.getByRole("button", { name: "Next invoices", exact: true }).click(); await page.getByText("Invoice page two", { exact: true }).waitFor();
    await page.keyboard.press("Escape"); record(width, "credit signs currencies and invoice pagination");
    await page.goto(`${base}/giftcards`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByText("GIFT-ONLY", { exact: true }).filter({visible:true}).waitFor(); assert.match(await page.locator("main").last().innerText(), /AUD 50.00/);
    record(width, "gift card currency");
    available = false;
    await page.goto(`${base}/settings/integrations`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.getByText(/Gift cards are not enabled/).waitFor();
    const nav = page.getByRole("navigation"); assert.equal(await nav.getByRole("link", { name: "Gift Cards", exact: true }).count(), 0);
    giftFailure = true; await page.getByRole("button", { name: "Retry availability", exact: true }).click();
    await page.getByText("Fixture service unavailable", { exact: true }).waitFor(); record(width, "gift capability distinguishes missing module from failure");
    await page.goto(`${base}/customer-groups`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForURL(/customers\/odoo\?manage=groups/); await page.getByRole("dialog", { name: "Manage customer groups" }).waitFor();
    record(width, "legacy group route opens integrated manager");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
    assert.deepEqual(errors, []); await context.close();
  }
  completed = true;
} finally {
  await browser.close();
  fs.writeFileSync(path.join(root, "docs/UAT_CUSTOMER_OPTIMIZATION_BROWSER_2026-10-25.json"), JSON.stringify({ passed: completed, scope: "Local browser fixture only; no live Odoo acceptance", liveBusinessWrites: 0, checks, errors, simulatedWrites: simulatedWrites.length }, null, 2));
}
console.log(`${checks.length}/${checks.length} PASS`);
