import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const checks = [];

async function login(context, base, subdomain) {
  const response = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password, ...(subdomain ? { subdomain } : {}) },
    headers: { Origin: base, ...(subdomain ? { "X-Orithos-Tenant-Slug": subdomain } : {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok() || body.code !== 0) throw new Error(`LOGIN_FAILED_${base}_${response.status()}`);
}

try {
  const appContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let detailRequests = 0;
  await login(appContext, "https://app.orithos.com.au", "demo");
  await appContext.route("**/api/admin/tenants/123", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    detailRequests += 1;
    if (detailRequests === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Injected store detail failure" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: 0,
        data: {
          id: 123,
          name: "Mock Recovery Store",
          subdomain: "mock-recovery",
          status: "trial",
          storeUrl: "https://mock-recovery.orithos.com.au",
          owner: { id: 7, username: "owner", name: "Owner", email: "owner@example.test", isAdmin: true },
        },
      }),
    });
  });
  const appPage = await appContext.newPage();
  await appPage.goto("https://app.orithos.com.au/platform/stores/123", { waitUntil: "domcontentloaded", timeout: 60000 });
  await appPage.getByRole("alert").getByText("Injected store detail failure", { exact: true }).waitFor({ timeout: 30000 });
  await appPage.getByRole("button", { name: "Try again", exact: true }).click();
  await appPage.getByRole("heading", { name: "Mock Recovery Store", exact: true }).waitFor({ timeout: 30000 });
  checks.push({ name: "platform store detail 503 -> Try again -> recovered", passed: detailRequests === 2 });
  await appContext.close();

  const demoContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let deleteRequests = 0;
  let categoryDeleteRequests = 0;
  let vendorDeleteRequests = 0;
  let productDeleteRequests = 0;
  await login(demoContext, "https://demo.orithos.com.au", "demo");
  await demoContext.route("**/api/price-sets", async (route) => {
    if (route.request().method() === "GET") {
      const data = deleteRequests >= 2 ? [] : [{ id: 77, name: "Mock Wholesale", parentId: null }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data }) });
      return;
    }
    await route.continue();
  });
  await demoContext.route("**/api/price-sets/77", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deleteRequests += 1;
    if (deleteRequests === 1) {
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Injected linked price set failure" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: null }) });
  });
  await demoContext.route("**/api/promotion-categories", async (route) => {
    if (route.request().method() === "GET") {
      const data = categoryDeleteRequests >= 2 ? [] : [{ id: "88", name: "Mock Offers" }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data }) });
      return;
    }
    await route.continue();
  });
  await demoContext.route("**/api/promotion-categories/88", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    categoryDeleteRequests += 1;
    await route.fulfill({
      status: categoryDeleteRequests === 1 ? 409 : 200,
      contentType: "application/json",
      body: JSON.stringify(categoryDeleteRequests === 1 ? { message: "Injected linked category failure" } : { code: 0, data: null }),
    });
  });
  await demoContext.route("**/api/vendor-connections", async (route) => {
    if (route.request().method() === "GET") {
      const data = vendorDeleteRequests >= 2 ? [] : [{ id: "99", name: "Mock EDI", senderCode: "MOCK", customerId: "1" }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data }) });
      return;
    }
    await route.continue();
  });
  await demoContext.route("**/api/vendor-connections/99", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    vendorDeleteRequests += 1;
    await route.fulfill({
      status: vendorDeleteRequests === 1 ? 409 : 200,
      contentType: "application/json",
      body: JSON.stringify(vendorDeleteRequests === 1 ? { message: "Injected vendor dependency failure" } : { code: 0, data: null }),
    });
  });
  await demoContext.route("**/api/products**", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname === "/api/products/filter-options" && route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, data: { brands: [], categories: [], families: [], tags: [], suppliers: [], types: [], taxRates: [], costTaxRates: [] } }),
      });
      return;
    }
    if (requestUrl.pathname === "/api/products" && route.request().method() === "GET") {
      const items = productDeleteRequests >= 2 ? [] : [{ id: "101", name: "Mock Product", status: "ACTIVE", price: 10, stockQuantity: 1, caseQuantity: 1 }];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data: { items, total: items.length, page: 1, size: 10 } }) });
      return;
    }
    if (requestUrl.pathname === "/api/products/101" && route.request().method() === "DELETE") {
      productDeleteRequests += 1;
      await route.fulfill({
        status: productDeleteRequests === 1 ? 409 : 200,
        contentType: "application/json",
        body: JSON.stringify(productDeleteRequests === 1 ? { message: "Injected linked product failure" } : { code: 0, data: null }),
      });
      return;
    }
    await route.continue();
  });
  const demoPage = await demoContext.newPage();
  await demoPage.goto("https://demo.orithos.com.au/settings/pricesets", { waitUntil: "domcontentloaded", timeout: 60000 });
  await demoPage.getByRole("heading", { name: "Price Sets", exact: true }).waitFor({ timeout: 30000 });
  await demoPage.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = demoPage.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Delete price set", exact: true }).click();
  await dialog.getByRole("alert").getByText("Injected linked price set failure", { exact: true }).waitFor({ timeout: 10000 });
  await dialog.getByRole("button", { name: "Delete price set", exact: true }).click();
  await demoPage.getByText("No price sets yet", { exact: true }).waitFor({ timeout: 30000 });
  checks.push({ name: "price set delete failure stays in dialog and retries", passed: deleteRequests === 2 });

  await demoPage.goto("https://demo.orithos.com.au/promotion/categories", { waitUntil: "domcontentloaded", timeout: 60000 });
  await demoPage.getByRole("heading", { name: "Promotion Categories", exact: true }).waitFor({ timeout: 30000 });
  await demoPage.locator("button:visible").filter({ hasText: "Delete" }).first().click();
  const categoryDialog = demoPage.getByRole("alertdialog");
  await categoryDialog.getByRole("button", { name: "Delete category", exact: true }).click();
  await categoryDialog.getByRole("alert").getByText("Injected linked category failure", { exact: true }).waitFor({ timeout: 10000 });
  await categoryDialog.getByRole("button", { name: "Delete category", exact: true }).click();
  await demoPage.getByText("No promotion categories yet", { exact: true }).waitFor({ timeout: 30000 });
  checks.push({ name: "promotion category delete failure stays in dialog and retries", passed: categoryDeleteRequests === 2 });

  await demoPage.goto("https://demo.orithos.com.au/utilities/vendor-connections", { waitUntil: "domcontentloaded", timeout: 60000 });
  await demoPage.getByRole("heading", { name: "Vendor Connections", exact: true }).waitFor({ timeout: 30000 });
  await demoPage.getByRole("button", { name: "Delete", exact: true }).click();
  const vendorDialog = demoPage.getByRole("alertdialog");
  await vendorDialog.getByRole("button", { name: "Delete connection", exact: true }).click();
  await vendorDialog.getByRole("alert").getByText("Injected vendor dependency failure", { exact: true }).waitFor({ timeout: 10000 });
  await vendorDialog.getByRole("button", { name: "Delete connection", exact: true }).click();
  await demoPage.getByText("No vendor connections have been configured yet.", { exact: true }).waitFor({ timeout: 30000 });
  checks.push({ name: "vendor connection delete failure stays in dialog and retries", passed: vendorDeleteRequests === 2 });

  await demoPage.goto("https://demo.orithos.com.au/products", { waitUntil: "domcontentloaded", timeout: 60000 });
  await demoPage.getByRole("heading", { name: "Products", exact: true }).waitFor({ timeout: 30000 });
  await demoPage.locator("button:visible").filter({ hasText: "Delete" }).first().click();
  const productDialog = demoPage.getByRole("alertdialog");
  await productDialog.getByRole("button", { name: "Deactivate", exact: true }).click();
  await productDialog.getByRole("alert").getByText("Injected linked product failure", { exact: true }).waitFor({ timeout: 10000 });
  await productDialog.getByRole("button", { name: "Deactivate", exact: true }).click();
  await demoPage.getByText("No results found.", { exact: true }).waitFor({ timeout: 30000 });
  checks.push({ name: "product delete failure stays in dialog and retries", passed: productDeleteRequests === 2 });
  await demoContext.close();
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: "383c8a5",
  deployment: "unverified-after-deploy",
  scope: "mocked authenticated UI recovery checks; all business writes intercepted",
  status: checks.every((check) => check.passed) ? "PASS" : "FAIL",
  checks,
  writes: 0,
};
const outputPath = path.join(root, "docs", "UAT_PLATFORM_RECOVERY_2026-10-18.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...output }));
if (output.status !== "PASS") process.exitCode = 1;
