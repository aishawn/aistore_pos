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
const base = "https://demo.orithos.com.au";
const password = env.INITIAL_ADMIN_PASSWORD?.trim() ?? "";
const expectedRuntimeSha = process.env.PILOT_EXPECTED_RUNTIME_SHA
  ?? (process.env.PILOT_DEPLOYMENT_VERIFIED === "true" ? process.env.PILOT_DEPLOYMENT_SHA : null);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const checks = [];
const fixtureReads = [];
let sessionAuthenticated = false;
let runtime = {};

class BlockedUatCheck extends Error {
  constructor(message) {
    super(message);
    this.name = "BlockedUatCheck";
  }
}

async function check(name, run) {
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const evidence = await run();
    checks.push({ name, status: "PASS", evidence });
  } catch (error) {
    const pageText = await page.locator("body").innerText().catch(() => "");
    const odooUnavailable = /Orithos session expired|Connect your store|Connect Orithos/i.test(pageText);
    checks.push({
      name,
      status: error instanceof BlockedUatCheck || odooUnavailable ? "BLOCKED" : "FAIL",
      evidence: odooUnavailable && !(error instanceof BlockedUatCheck)
        ? `Orithos session is unavailable; page controls or data could not load. ${error instanceof Error ? error.message : "Unexpected failure"}`
        : error instanceof Error ? error.message : "Unexpected failure",
    });
  }
}

try {
  if (!password) {
    checks.push({
      name: "Admin session for interaction UAT",
      status: "BLOCKED",
      evidence: "The local .env has no non-empty INITIAL_ADMIN_PASSWORD value; no login request or authenticated browser interaction was run.",
    });
  } else {
    const login = await context.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password },
      headers: { Origin: base },
      timeout: 15000,
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok() || loginBody.code !== 0) {
      checks.push({
        name: "Admin session for interaction UAT",
        status: "BLOCKED",
        evidence: `Admin login was rejected with HTTP ${login.status()} (API code ${loginBody.code ?? "unavailable"}); no authenticated browser interactions were run.`,
      });
    } else {
      const odooSession = await context.request.get(`${base}/api/odoo/session`, { headers: { Origin: base }, timeout: 60000 });
      const odooSessionBody = await odooSession.json().catch(() => ({}));
      if (!odooSession.ok() || !odooSessionBody.user) {
        checks.push({ name: "Odoo session warmup", status: "BLOCKED", evidence: `Odoo session warmup returned HTTP ${odooSession.status()}.` });
      }
      const versionResponse = await context.request.get(`${base}/api/public/version`, { timeout: 20000 });
      const version = await versionResponse.json().catch(() => ({}));
      runtime = {
        frontendCommit: version?.frontend?.commit ?? null,
        backendCommit: version?.backend?.commit ?? null,
      };
      if (!/^[\da-f]{40}$/i.test(expectedRuntimeSha ?? "")) {
        checks.push({ name: "Exact Demo runtime guard", status: "BLOCKED", evidence: "Set PILOT_EXPECTED_RUNTIME_SHA before authenticated interaction checks." });
      } else if (!versionResponse.ok() || runtime.frontendCommit !== expectedRuntimeSha || runtime.backendCommit !== expectedRuntimeSha) {
        checks.push({ name: "Exact Demo runtime guard", status: "BLOCKED", evidence: "The live frontend/backend SHA does not match the expected SHA; no interaction checks were run." });
      } else {
        await context.route("**/api/sell/parked**", async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (request.method() === "GET" && url.origin === base && url.pathname === "/api/sell/parked") {
            fixtureReads.push({ path: url.pathname, reason: "Replace the legacy read endpoint because its current deployed handler expires overdue parked sales." });
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: [] }) });
          }
          return route.continue();
        });
        sessionAuthenticated = true;

  await check("Mobile dashboard module navigation reaches Products workspace", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const modules = page.getByRole("list", { name: "Store modules" });
    await modules.waitFor({ timeout: 30000 });
    const stock = modules.getByRole("link", { name: /Stock/ });
    await stock.waitFor({ timeout: 15000 });
    if (new URL(await stock.getAttribute("href"), base).pathname !== "/products") {
      throw new Error("The Stock module does not link to the Products workspace");
    }
    await stock.click();
    await page.waitForURL("**/products", { timeout: 15000 });
    await page.setViewportSize({ width: 1440, height: 900 });
    return "At 390px, the in-page Stock module linked to the Products workspace and reached that route without the hidden Sidebar/Header chrome.";
  });

  await check("Compact account popover opens and closes accessibly", async () => {
    const accountContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const accountLogin = await accountContext.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password },
      headers: { Origin: base },
      timeout: 60000,
    });
    if (!accountLogin.ok()) throw new Error(`Account menu session login failed (${accountLogin.status()})`);
    const accountPage = await accountContext.newPage();
    try {
      await accountPage.setViewportSize({ width: 1440, height: 900 });
      await accountPage.goto(`${base}/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
      const trigger = accountPage.locator("[data-user-menu-trigger]");
      const menu = accountPage.locator("#user-menu");
      await trigger.waitFor({ timeout: 15000 });
      if (await trigger.getAttribute("aria-expanded") !== "false") throw new Error("Account menu is not initially collapsed");
      await trigger.evaluate((element) => (element instanceof HTMLElement ? element.click() : undefined));
      await accountPage.waitForFunction(() => document.querySelector("#user-menu")?.getAttribute("aria-hidden") === "false", null, { timeout: 10000 });
      const menuSemantics = await accountPage.evaluate(() => {
        const element = document.querySelector("#user-menu");
        return { role: element?.getAttribute("role"), label: element?.getAttribute("aria-label"), hidden: element?.getAttribute("aria-hidden") };
      });
      if (menuSemantics.role !== "dialog" || menuSemantics.label !== "User menu" || menuSemantics.hidden === "true") {
        throw new Error("Account menu did not expose the expected dialog semantics when opened");
      }
      if (await trigger.getAttribute("aria-expanded") !== "true") throw new Error("Trigger did not expose the expanded state");
      await accountPage.keyboard.press("Escape");
      await accountPage.waitForFunction(() => {
        const triggerElement = document.querySelector("[data-user-menu-trigger]");
        const menuElement = document.querySelector("#user-menu");
        return triggerElement?.getAttribute("aria-expanded") === "false" && menuElement?.getAttribute("aria-hidden") !== "false";
      }, null, { timeout: 10000 });
      if (await trigger.getAttribute("aria-expanded") !== "false") throw new Error("Escape did not reset the expanded state");
      await trigger.evaluate((element) => (element instanceof HTMLElement ? element.click() : undefined));
      await accountPage.waitForFunction(() => document.querySelector("#user-menu")?.getAttribute("aria-hidden") === "false", null, { timeout: 10000 });
      await accountPage.locator("#main-content").click({ position: { x: 12, y: 12 } });
      await accountPage.waitForFunction(() => {
        const triggerElement = document.querySelector("[data-user-menu-trigger]");
        const menuElement = document.querySelector("#user-menu");
        return triggerElement?.getAttribute("aria-expanded") === "false" && menuElement?.getAttribute("aria-hidden") !== "false";
      }, null, { timeout: 10000 });
      return "Account popover opens, exposes aria-expanded, and closes on Escape and an outside click.";
    } finally {
      await accountPage.close();
      await accountContext.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
      await accountContext.close();
    }
  });

  await check("Sidebar keeps the active settings destination reachable", async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/settings/payment`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const settingsGroup = page.locator('#main-navigation > div nav button[aria-controls^="sidebar-group-setup"]');
    await settingsGroup.waitFor({ timeout: 30000 });
    if (await settingsGroup.getAttribute("aria-expanded") !== "true") {
      throw new Error("Settings group did not auto-expand for the active payment page");
    }
    const paymentLink = page.locator('#main-navigation a[href="/settings/store"]');
    await paymentLink.waitFor({ timeout: 30000 });
    await page.goto(`${base}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.goto(`${base}/settings/payment`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => {
      const group = document.querySelector('#main-navigation button[aria-controls^="sidebar-group-setup"]');
      return group?.getAttribute("aria-expanded") === "true";
    }, null, { timeout: 30000 });
    return "The active Setup group expands on direct navigation and remains expanded when the route changes back to a settings child page.";
  });

  await check("Legacy classification route opens the read-only category workspace", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const writes = [];
    const onRequest = (request) => {
      if (request.method() !== "GET" && /\/api\/odoo\/categories(?:\/|\?|$)/.test(new URL(request.url()).pathname)) writes.push(request.url());
    };
    page.on("request", onRequest);
    try {
      await page.goto(`${base}/classifications`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForURL("**/products?dialog=categories", { timeout: 15000 });
      const dialog = page.getByRole("dialog", { name: "Manage Categories" });
      await dialog.waitFor({ state: "visible", timeout: 10000 });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 10000 });
      await page.waitForURL("**/products", { timeout: 10000 });
      if (writes.length) throw new Error("Opening and closing the category workspace issued a category write");
    } finally {
      page.off("request", onRequest);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    return "The legacy classification route opened the 390px Manage Categories dialog; Escape closed it and removed the query without category writes.";
  });

  await check("Product search filters the Odoo catalogue", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const emptyProducts = page.getByText(/No POS products yet|No POS products were returned by Odoo\./).first();
    const emptyProductsVisible = await emptyProducts.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
    if (emptyProductsVisible) {
      throw new BlockedUatCheck("Odoo returned an explicit empty POS catalogue; a product fixture is required for search validation.");
    }
    await page.waitForFunction(() => document.querySelectorAll("main section article").length > 0, null, { timeout: 30000 }).catch(() => {
      throw new BlockedUatCheck("Odoo returned no product cards; a product fixture is required for search validation.");
    });
    const search = page.getByPlaceholder("Search product, barcode or SKU");
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll("main section article")];
      const text = document.querySelector("main section")?.innerText ?? "";
      return cards.length > 0 && /SKU (?:R2|DEMO)-/i.test(text);
    }, null, { timeout: 30000 }).catch(() => {
      throw new BlockedUatCheck("Odoo has no uniquely identified product fixture (R2-* or DEMO-*); a product fixture is required for search validation.");
    });
    const table = page.locator("table");
    if (await table.evaluate((element) => getComputedStyle(element).display !== "none")) {
      throw new Error("The wide product table is visible at the mobile viewport");
    }
    const firstCard = page.locator("main section article").first();
    const sku = (await firstCard.innerText()).match(/SKU\s+((?:R2|DEMO)-[A-Za-z0-9-]+)/)?.[1];
    if (!sku) throw new BlockedUatCheck("Odoo has no uniquely identified product fixture (R2-* or DEMO-*); a product fixture is required for search validation.");
    await search.fill(sku);
    await page.waitForFunction((expectedSku) => {
      const cards = [...document.querySelectorAll("main section article")];
      const text = document.querySelector("main section")?.innerText ?? "";
      return cards.length === 1 && text.includes(expectedSku);
    }, sku, { timeout: 30000 });
    await page.setViewportSize({ width: 1440, height: 900 });
    return "At 390px the product cards replaced the wide table; searching a unique SKU returned one matching result.";
  });

  await check("Product edit dialog is prefilled from Odoo", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const emptyProducts = page.getByText(/No POS products yet|No POS products were returned by Odoo\./).first();
    const emptyProductsVisible = await emptyProducts.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
    if (emptyProductsVisible) {
      throw new BlockedUatCheck("Odoo returned an explicit empty POS catalogue; a product fixture is required for edit validation.");
    }
    await page.waitForFunction(() => document.querySelectorAll("main section article").length > 0, null, { timeout: 30000 }).catch(() => {
      throw new BlockedUatCheck("Odoo returned no product cards; a product fixture is required for edit validation.");
    });
    const search = page.getByPlaceholder("Search product, barcode or SKU");
    await page.locator("main section article").first().waitFor({ timeout: 30000 });
    const initialCard = page.locator("main section article").first();
    const sku = (await initialCard.innerText()).match(/SKU\s+((?:R2|DEMO)-[A-Za-z0-9-]+)/)?.[1];
    if (!sku) throw new BlockedUatCheck("Odoo has no uniquely identified product fixture (R2-* or DEMO-*); a product fixture is required for edit validation.");
    await search.fill(sku);
    await page.waitForFunction((expectedSku) => {
      const cards = [...document.querySelectorAll("main section article")];
      return cards.length === 1 && (document.querySelector("main section")?.innerText ?? "").includes(expectedSku);
    }, sku, { timeout: 30000 });
    const card = page.locator("main section article").filter({ hasText: sku });
    await card.waitFor({ timeout: 15000 });
    const cardText = await card.innerText();
    const displayedPrice = Number(cardText.match(/\$([\d,]+\.\d{2})/)?.[1]?.replaceAll(",", ""));
    if (!Number.isFinite(displayedPrice) || displayedPrice <= 0) throw new Error("Odoo product does not show a valid sale price");
    await card.getByRole("button", { name: /Edit/i }).click();
    const dialog = page.getByRole("dialog", { name: "Edit product" });
    await dialog.waitFor({ timeout: 10000 });
    const dialogBox = await dialog.boundingBox();
    if (!dialogBox || dialogBox.width > 390 || dialogBox.height > 844) {
      throw new Error(`Product edit dialog exceeds the 390x844 viewport: ${JSON.stringify(dialogBox)}`);
    }
    const priceInput = page.getByLabel("Sale price");
    if (!(await priceInput.evaluate((input) => document.activeElement === input))) throw new Error("Product edit dialog did not focus Sale price");
    const price = await priceInput.evaluate((input) => Number(input.value));
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Odoo sale price was not prefilled (received ${price})`);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    return "At 390px the edit dialog fit the viewport, prefilled a valid Odoo price, and was closed without saving.";
  });

  await check("New product form blocks submission without a name", async () => {
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const trigger = page.getByRole("button", { name: "New product" });
    await trigger.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === "New product");
      return button instanceof HTMLButtonElement && !button.disabled;
    }, null, { timeout: 30000 }).catch(() => {
      throw new BlockedUatCheck("Odoo product workspace controls did not finish loading; a product fixture or session warmup is required.");
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "New product" });
    const name = dialog.getByLabel(/Product name/i);
    await name.waitFor({ timeout: 10000 });
    if (!(await name.evaluate((input) => document.activeElement === input))) throw new Error("New product dialog did not focus Product name");
    const blocked = await name.evaluate((input) => input.required && input.form?.checkValidity() === false);
    if (!blocked) throw new Error("An empty product form can pass browser validation");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached", timeout: 10000 });
    if (!(await trigger.evaluate((element) => document.activeElement === element))) throw new Error("New product dialog did not restore trigger focus");
    return "Product name is required; dialog focus and trigger restoration passed; empty form validation was checked and no product was created.";
  });

  await check("CSV product import previews valid rows without writing to Odoo", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/products/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const writes = [];
    const onRequest = (request) => {
      if (request.method() === "POST" && /\/api\/odoo\/products(?:\/import)?(?:\?|$)/.test(new URL(request.url()).pathname)) {
        writes.push(request.url());
      }
    };
    page.on("request", onRequest);
    try {
      let importButton;
      let moreVisible = false;
      for (let attempt = 0; attempt < 3 && !moreVisible; attempt += 1) {
        if (attempt > 0) await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
        await page.getByRole("heading", { name: "Products", exact: true }).waitFor({ timeout: 30000 });
        await page.waitForFunction(() => document.querySelectorAll("main section article").length > 0, null, { timeout: 30000 });
        await page.waitForFunction(() => {
          const button = [...document.querySelectorAll("button")].find((element) => element.textContent?.trim() === "New product");
          return button instanceof HTMLButtonElement && !button.disabled;
        }, null, { timeout: 60000 });
        const more = page.locator("details > summary").filter({ hasText: /^More$/ });
        moreVisible = await more.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
        if (moreVisible) {
          await more.click();
          importButton = page.getByRole("button", { name: /^Import(?: CSV)?$/ });
          await importButton.waitFor({ state: "visible", timeout: 15000 });
          const enabled = await importButton.isEnabled().catch(() => false);
          if (!enabled) moreVisible = false;
        }
      }
      if (!moreVisible) {
        const state = await page.evaluate(() => ({
          url: location.pathname + location.search,
          viewport: innerWidth,
          moreSummaries: [...document.querySelectorAll("details > summary")].map((summary) => (summary.innerText || "").trim()),
          access: (() => {
            try {
              const user = JSON.parse(localStorage.getItem("sf_user") || "{}");
              return {
                isAdmin: user.isAdmin === true || user.roleCode === "ADMIN",
                canImportExport: user.isAdmin === true || user.roleCode === "ADMIN" || (user.permissions || []).includes("stock.products.import_export"),
              };
            } catch {
              return { isAdmin: false, canImportExport: false };
            }
          })(),
          importButtons: [...document.querySelectorAll("button")]
            .filter((button) => /import/i.test(button.innerText || button.getAttribute("aria-label") || ""))
            .map((button) => ({ text: (button.innerText || "").trim().replace(/\s+/g, " "), label: button.getAttribute("aria-label"), disabled: button.disabled, visible: Boolean(button.offsetWidth || button.offsetHeight) })),
        }));
        if (!state.access.canImportExport) {
          throw new BlockedUatCheck(`The signed-in Demo account lacks stock.products.import_export; the UI correctly omits the CSV import action. ${JSON.stringify(state.access)}`);
        }
        throw new Error(`CSV import menu is absent after the Products toolbar loaded: ${JSON.stringify(state)}`);
      }
      await importButton.waitFor({ state: "visible", timeout: 10000 });
      await importButton.click();
      const dialog = page.getByRole("dialog", { name: "Import products from CSV" });
      await dialog.waitFor({ timeout: 10000 });
      const fileInput = dialog.locator('input[type="file"]');
      await page.waitForFunction(() => {
        const input = document.querySelector('input[type="file"]');
        return Boolean(input && !input.disabled);
      }, null, { timeout: 15000 });
      if (!(await fileInput.evaluate((input) => document.activeElement === input))) throw new Error("CSV import dialog did not focus file chooser after categories loaded");
      await dialog.locator('input[type="file"]').setInputFiles({
        name: "preview-only.csv",
        mimeType: "text/csv",
        buffer: Buffer.from([
          "Product Name,SKU,Barcode,Sale Price,Cost",
          "Preview Only Shiraz,UAT-PREVIEW-001,,19.95,10.00",
          "",
        ].join("\n")),
      });
      await page.waitForFunction(() => document.body.innerText.includes("1 valid product ready to import"), null, { timeout: 10000 });
      const preview = await dialog.innerText();
      if (!preview.includes("Preview Only Shiraz") || !preview.includes("UAT-PREVIEW-001")) {
        throw new Error(`CSV preview did not show the parsed row: ${preview.slice(0, 500)}`);
      }
      if (writes.length) throw new Error("Selecting a CSV unexpectedly wrote products to Odoo");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await dialog.waitFor({ state: "detached", timeout: 10000 });
      return "A valid one-row CSV was parsed and previewed; Cancel closed the dialog with no Odoo product write.";
    } finally {
      page.off("request", onRequest);
    }
  });

  await check("Customer creation form is required-field guarded", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/customers/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const trigger = page.getByRole("button", { name: /New customer/i });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "New customer" });
    const name = dialog.getByLabel(/Customer name/i);
    await name.waitFor({ timeout: 10000 });
    if (!(await name.evaluate((input) => document.activeElement === input))) throw new Error("New customer dialog did not focus Customer name");
    const dialogBox = await dialog.boundingBox();
    if (!dialogBox || dialogBox.width > 390 || dialogBox.height > 844) {
      throw new Error(`Customer creation dialog exceeds the 390x844 viewport: ${JSON.stringify(dialogBox)}`);
    }
    if (await name.getAttribute("required") === null) throw new Error("Customer name is not required");
    const emptyFormIsInvalid = await name.evaluate((input) => input.form?.checkValidity() === false);
    if (!emptyFormIsInvalid) throw new Error("An empty customer form passes browser validation");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    if (!(await trigger.evaluate((element) => document.activeElement === element))) throw new Error("New customer dialog did not restore trigger focus");
    return "At 390px the customer dialog fit the viewport; initial focus, trigger restoration, required Customer name and empty-form protection passed.";
  });

  await check("Customer mobile card and edit dialog render from a read-only fixture", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/odoo/records", async (route) => {
      const body = route.request().postDataJSON();
      if (body?.type !== "customers") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [{ id: 987654, name: "Pilot Fixture Customer", phone: "0400 123 456", email: "fixture@example.test", customer_rank: 1, ref: "PILOT-FIXTURE" }] }),
      });
    });
    try {
      await page.goto(`${base}/customers/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const card = page.locator("main section article").filter({ hasText: "Pilot Fixture Customer" });
      await card.waitFor({ timeout: 15000 });
      const table = page.locator("table");
      if (await table.evaluate((element) => getComputedStyle(element).display !== "none")) {
        throw new Error("The wide customer table is visible at the mobile viewport");
      }
      if (await card.getByRole("link", { name: /0400 123 456/ }).getAttribute("href") !== "tel:0400%20123%20456") {
        throw new Error("Customer phone card does not expose the expected tap-to-call link");
      }
      await card.getByRole("button", { name: "Edit", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Edit customer" });
      await dialog.waitFor({ timeout: 10000 });
      const dialogBox = await dialog.boundingBox();
      if (!dialogBox || dialogBox.width > 390 || dialogBox.height > 844) {
        throw new Error(`Customer edit dialog exceeds the 390x844 viewport: ${JSON.stringify(dialogBox)}`);
      }
      if (await dialog.getByLabel("Customer name").inputValue() !== "Pilot Fixture Customer") {
        throw new Error("Customer edit dialog did not prefill the fixture record");
      }
      await page.getByRole("button", { name: "Close", exact: true }).click();
      return "Mobile customer card showed Odoo fixture details and tap-to-call; edit dialog fit the viewport and was closed without saving.";
    } finally {
      await page.unroute("**/api/odoo/records");
    }
  });

  await check("Sales history searches and opens a refunded receipt", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/history/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes("No sales yet") || document.querySelectorAll('button[aria-label^="View receipt "]').length > 0, null, { timeout: 30000 });
    if (await page.getByRole("heading", { name: "No sales yet", exact: true }).isVisible().catch(() => false)) {
      throw new BlockedUatCheck("Odoo returned an explicit empty sales history; a refunded-sale fixture is required for receipt validation.");
    }
    const statusFilter = page.locator("label").filter({ hasText: "Filter sales by status" }).locator("select");
    await statusFilter.selectOption("refunded");
    const table = page.locator("table");
    const receipt = page.getByRole("button", { name: /^View receipt / }).first();
    await receipt.waitFor({ timeout: 30000 });
    if (await table.evaluate((element) => getComputedStyle(element).display !== "none")) {
      throw new Error("The wide sales table is visible at the mobile viewport");
    }
    await receipt.focus();
    await page.keyboard.press("Enter");
    const detail = page.getByRole("dialog", { name: /Sale receipt/i });
    await detail.waitFor({ timeout: 10000 });
    const dialogBox = await detail.boundingBox();
    if (!dialogBox || dialogBox.width > 390 || dialogBox.height > 844) {
      throw new Error(`Receipt dialog exceeds the 390x844 viewport: ${JSON.stringify(dialogBox)}`);
    }
    if (await detail.getByRole("button", { name: "Refund full sale" }).count()) {
      throw new Error("A refunded sale still exposes the full-refund action");
    }
    await page.getByRole("button", { name: "Close receipt" }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    return "At 390px the Refunded filter returned a mobile receipt card; the receipt dialog opened by keyboard, fit the viewport, and hid the duplicate full-refund action.";
  });

  await check("Replenishment coverage control refreshes the estimate", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/stock/replenishment`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const coverage = page.locator("#coverage-days");
    await coverage.waitFor({ timeout: 15000 });
    await coverage.selectOption("7");
    await page.getByText(/suggested units · 7d/).waitFor({ timeout: 15000 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    if (dimensions.document > dimensions.viewport) throw new Error(`Mobile replenishment overflows horizontally: ${dimensions.document}px > ${dimensions.viewport}px`);
    if (await page.locator("main table").isVisible().catch(() => false)) throw new Error("Mobile replenishment should show product cards instead of the wide table");
    await page.getByLabel("Filter replenishment list").selectOption("all");
    await page.getByRole("heading", { name: "All POS products" }).waitFor({ timeout: 10000 });
    const emptyReplenishment = page.getByText(/No POS products were returned by Odoo\./).first();
    const emptyReplenishmentVisible = await emptyReplenishment.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
    if (emptyReplenishmentVisible) {
      throw new BlockedUatCheck("Odoo returned an explicit empty replenishment catalogue; product demand data is required for card validation.");
    }
    await page.waitForFunction(() => document.querySelectorAll("main section article").length > 0, null, { timeout: 30000 });
    if (await page.getByText("No POS products were returned by Odoo.", { exact: true }).isVisible().catch(() => false)) {
      throw new BlockedUatCheck("Odoo returned an explicit empty replenishment catalogue; product demand data is required for card validation.");
    }
    const productSection = page.locator("main section").filter({ has: page.getByRole("heading", { name: "All POS products" }) });
    if (!(await productSection.locator("article").count())) throw new Error("Mobile all-products view did not render product cards");
    const body = await page.locator("body").innerText();
    if (/No recent sales found/i.test(body) && !/Zero suggested orders does not mean stock is sufficient/i.test(body)) {
      throw new Error("No-sales warning does not explain that zero orders are not a stock sufficiency signal");
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    return `At 390px, replenishment showed product cards without overflow (${dimensions.document}px); coverage changed to 7 days; no-sales state remains explicitly qualified.`;
  });

  await check("Reports period controls refresh the Orithos dashboard", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/reports/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "Reports", exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole("group", { name: "Orithos sales reporting range" }).waitFor({ timeout: 30000 });
    await page.getByRole("region", { name: /Orithos summary/ }).waitFor({ timeout: 30000 });
    const updatedRange = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/odoo/reporting-dashboard" && url.searchParams.get("hours") === "24" && response.ok();
    }, { timeout: 30000 });
    await page.getByRole("button", { name: "24 hours", exact: true }).click();
    const rangeResponse = await updatedRange;
    const rangeData = await rangeResponse.json();
    await page.getByText(/Orithos POS activity · 24 hours/).waitFor({ timeout: 15000 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    if (dimensions.document > dimensions.viewport) throw new Error(`Mobile overview overflows horizontally: ${dimensions.document}px > ${dimensions.viewport}px`);
    const chartMarks = page.locator('[role="img"][aria-label]');
    if (rangeData.trend?.length) {
      if (await chartMarks.count() !== rangeData.trend.length) throw new Error("Overview trend marks do not match the returned data");
    } else {
      if (Number(rangeData.transactions) !== 0 || Number(rangeData.refundTransactions) !== 0) {
        throw new Error("Overview trend is empty despite sales or refunds in the selected period");
      }
      await page.getByText("No Orithos sales in this period", { exact: true }).waitFor({ timeout: 10000 });
    }
    const launcher = page.getByRole("button", { name: "Open Orithos AI assistant" });
    await launcher.waitFor({ timeout: 10000 });
    await launcher.click();
    await page.getByRole("dialog", { name: "Orithos AI assistant" }).waitFor({ timeout: 10000 });
    await page.getByRole("dialog", { name: "Orithos AI assistant" }).getByTitle("Close").click();
    return rangeData.trend?.length
      ? `At 390px there is no horizontal overflow (${dimensions.document}px); the 24-hour trend renders ${rangeData.trend.length} accessible marks, and the AI assistant opens/closes.`
      : `At 390px there is no horizontal overflow (${dimensions.document}px); the 24-hour Orithos report has no sales, so the qualified empty state renders, and the AI assistant opens/closes.`;
  });

  await check("Legacy sales report opens the live reporting dashboard", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/reports/sales`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForURL("**/reports/dashboard", { timeout: 15000 });
    await page.getByRole("heading", { name: "Reports", exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole("group", { name: "Orithos sales reporting range" }).waitFor({ timeout: 30000 });
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    if (dimensions.document > dimensions.viewport) throw new Error(`Reports dashboard overflows horizontally: ${dimensions.document}px > ${dimensions.viewport}px`);
    return "The legacy sales report route redirected to the live Reports dashboard; its period controls rendered without horizontal overflow at 390px.";
  });
      }
  }
  }
} finally {
  if (sessionAuthenticated) {
    try { await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base }, timeout: 5000 }); } catch { /* Session expires normally. */ }
  }
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  expectedRuntimeSha: expectedRuntimeSha?.toLowerCase() ?? null,
  runtime,
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  scope: "exact-runtime read-only interactions; parked-sales GET replaced by an empty fixture because the deployed handler expires old records; product/customer forms validated but not submitted; CSV parsed only in browser and cancelled; no product, customer, sale, refund, RFQ, or register-close writes",
  result: checks.some((item) => item.status === "FAIL") ? "FAIL" : checks.some((item) => item.status === "BLOCKED") ? "BLOCKED" : "PASS",
  fixtureReads,
  checks,
};
const requestedOutput = process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_INTERACTION_2026-10-14.json";
const outputPath = path.isAbsolute(requestedOutput)
  ? requestedOutput
  : path.join(root, requestedOutput.startsWith(`docs${path.sep}`) || requestedOutput.startsWith("docs/")
    ? requestedOutput
    : path.join("docs", requestedOutput));
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, result: output.result, passed: checks.filter((item) => item.status === "PASS").length, blocked: checks.filter((item) => item.status === "BLOCKED").length, failed: checks.filter((item) => item.status === "FAIL").length, checks }));
if (checks.some((item) => item.status === "FAIL")) process.exitCode = 2;
else if (checks.some((item) => item.status === "BLOCKED")) process.exitCode = 3;
