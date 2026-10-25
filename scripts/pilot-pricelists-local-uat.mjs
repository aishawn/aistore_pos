import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PILOT_BASE_URL ?? "http://demo.localhost:3101").replace(/\/+$/, "");
const hostname = new URL(base).hostname;
if (!["localhost", "127.0.0.1"].includes(hostname) && !hostname.endsWith(".localhost")) {
  throw new Error("This Price Lists UAT is local-only.");
}

const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH
  ?? "docs/UAT_PRICELISTS_LOCAL_2026-10-24.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR
  ?? "docs/screenshots/2026-10-24-pricelists");
const user = {
  id: 1,
  name: "Local UAT Admin",
  username: "admin",
  isAdmin: true,
  vendorId: 1,
  outletId: 1,
  pendingPasswordReset: false,
  platformOperator: false,
};
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const checks = [];
const fixtureMutations = [];
const pageErrors = [];
const record = (name, ok, evidence = "") => checks.push({ name, status: ok ? "PASS" : "FAIL", evidence });
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });

async function testViewport(viewport) {
  const items = [
    { id: 1, name: "Default", currency: "AUD", currencyId: 1, company: "Shared", companyId: null, active: true },
    { id: 2, name: "Weekend pricing", currency: "AUD", currencyId: 1, company: "UAT Store", companyId: 41, active: true },
  ];
  const state = { listReads: 0, createAttempts: 0, nextId: 3 };
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: "orithos_access_token", value: "pricelists-fixture", url: base }]);
  await context.addInitScript((fixtureUser) => {
    localStorage.setItem("sf_token", "pricelists-fixture");
    localStorage.setItem("sf_user", JSON.stringify(fixtureUser));
  }, user);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (data, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
    if (url.pathname === "/api/auth/me" && method === "GET") return json({ code: 0, message: "OK", data: user });
    if (url.pathname === "/api/odoo/session" && method === "GET") {
      return json({ user: { name: "Fixture Odoo User", allowedCompanyIds: [41] }, autoRecoverConfigured: false });
    }
    if (url.pathname === "/api/ai/config/client" && method === "GET") {
      return json({ code: 0, message: "OK", data: { enabled: false, aiTriggerKeywords: [] } });
    }
    if (url.pathname === "/api/odoo/pricelists" && method === "GET") {
      state.listReads += 1;
      if (state.listReads === 1) return json({ message: "Fixture price lists temporarily unavailable." }, 503);
      const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 40);
      const filtered = items.filter((item) => item.name.toLowerCase().includes(query));
      return json({ items: filtered.slice(offset, offset + limit), limit, offset, hasNext: offset + limit < filtered.length });
    }
    if (url.pathname === "/api/odoo/pricelists" && method === "POST") {
      fixtureMutations.push({ viewport: viewport.width, method, path: url.pathname });
      state.createAttempts += 1;
      const body = request.postDataJSON() ?? {};
      if (state.createAttempts === 1) return json({ message: "Fixture could not save this price list." }, 502);
      const item = {
        id: state.nextId++, name: String(body.name), currency: "AUD", currencyId: 1,
        company: "UAT Store", companyId: 41, active: true,
      };
      items.push(item);
      return json({ id: item.id, name: item.name }, 201);
    }
    const match = url.pathname.match(/^\/api\/odoo\/pricelists\/(\d+)$/);
    if (match && method === "PATCH") {
      fixtureMutations.push({ viewport: viewport.width, method, path: url.pathname });
      const item = items.find((entry) => entry.id === Number(match[1]));
      if (!item) return json({ message: "Price list not found." }, 404);
      const body = request.postDataJSON() ?? {};
      if (typeof body.name === "string") item.name = body.name;
      return json({ ok: true });
    }
    if (match && method === "DELETE") {
      fixtureMutations.push({ viewport: viewport.width, method, path: url.pathname });
      const item = items.find((entry) => entry.id === Number(match[1]));
      if (!item) return json({ message: "Price list not found." }, 404);
      item.active = false;
      return json({ ok: true });
    }
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      fixtureMutations.push({ viewport: viewport.width, method, path: url.pathname, unexpected: true });
      return json({ message: "Price Lists UAT blocked an unexpected API mutation." }, 405);
    }
    return json({ code: 0, message: "OK", data: [] });
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push({ viewport: viewport.width, message: error.message }));
  const itemRow = (name) => viewport.width >= 768
    ? page.locator("tbody tr").filter({ hasText: name })
    : page.locator("article").filter({ hasText: name });
  await page.goto(`${base}/pricelists`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: "Price Lists", exact: true }).waitFor({ timeout: 15000 });
  const headerAi = page.getByRole("button", { name: "Open Orithos AI assistant", exact: true });
  record(`${viewport.width}px AI entry stays in the header`, await headerAi.isVisible()
    && await page.locator('button[aria-label="Open AI assistant"]').count() === 0, "No floating AI launcher over price list actions");
  const loadError = page.locator('[role="alert"]').filter({ hasText: "Fixture price lists temporarily unavailable." });
  await loadError.waitFor({ state: "visible", timeout: 10000 });
  record(`${viewport.width}px shows a useful retry message on load failure`, await loadError.isVisible(), `${viewport.width}px`);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await itemRow("Weekend pricing").waitFor({ state: "visible", timeout: 10000 });
  record(`${viewport.width}px recovers the list after retry`, await itemRow("Default").isVisible()
    && await itemRow("Weekend pricing").isVisible(), `GET attempts=${state.listReads}`);

  const search = page.getByRole("textbox", { name: "Search price lists" });
  await search.fill("weekend");
  await itemRow("Weekend pricing").waitFor({ state: "visible", timeout: 5000 });
  await itemRow("Default").waitFor({ state: "detached", timeout: 5000 });
  record(`${viewport.width}px filters by price list name`, await itemRow("Weekend pricing").isVisible()
    && await itemRow("Default").count() === 0, "case-insensitive server query returns the matching price list");
  await search.fill("");
  await itemRow("Default").waitFor({ state: "visible", timeout: 5000 });

  await page.getByRole("button", { name: "Add price list", exact: false }).click();
  await page.getByRole("heading", { name: "New price list", exact: true }).waitFor({ timeout: 5000 });
  const nameInput = page.getByRole("textbox", { name: "Name", exact: true });
  record(`${viewport.width}px create form requires a name`, await nameInput.evaluate((input) => !input.checkValidity()), "empty name is blocked by native required validation");
  await nameInput.fill("Summer offers");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const createError = page.locator('[role="alert"]').filter({ hasText: "Fixture could not save this price list." });
  await createError.waitFor({ state: "visible", timeout: 5000 });
  record(`${viewport.width}px create failure keeps the entered name`, await nameInput.inputValue() === "Summer offers", "failed create displays an error and preserves form state");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const createdRow = viewport.width >= 768
    ? page.locator("tbody tr").filter({ hasText: "Summer offers" })
    : page.locator("article").filter({ hasText: "Summer offers" });
  await createdRow.waitFor({ timeout: 10000 });
  record(`${viewport.width}px creates a price list after retry`, await createdRow.isVisible(), `fixture id=${state.nextId - 1}`);

  await createdRow.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("heading", { name: "Edit price list", exact: true }).waitFor({ timeout: 5000 });
  const editName = page.getByRole("textbox", { name: "Name", exact: true });
  await editName.fill("Summer member offers");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const editedRow = viewport.width >= 768
    ? page.locator("tbody tr").filter({ hasText: "Summer member offers" })
    : page.locator("article").filter({ hasText: "Summer member offers" });
  await editedRow.waitFor({ timeout: 10000 });
  record(`${viewport.width}px edits a price list`, await editedRow.isVisible(), "PATCH response is followed by fresh list data");

  await editedRow.getByRole("button", { name: "Archive", exact: true }).click();
  const archiveDialog = page.getByRole("dialog");
  await archiveDialog.getByRole("heading", { name: "Archive price list?", exact: true }).waitFor({ timeout: 5000 });
  await archiveDialog.getByRole("button", { name: "Archive", exact: true }).click();
  const archivedRow = viewport.width >= 768
    ? page.locator("tbody tr").filter({ hasText: "Summer member offers" })
    : page.locator("article").filter({ hasText: "Summer member offers" });
  await page.waitForFunction(() => [...document.querySelectorAll("article, tbody tr")].some((row) => {
    const text = row.textContent ?? "";
    return text.includes("Summer member offers") && text.includes("Archived");
  }), undefined, { timeout: 10000 });
  const archivedText = await archivedRow.textContent() ?? "";
  record(`${viewport.width}px archives without deleting the record`, archivedText.includes("Archived")
    && await archivedRow.getByRole("button", { name: "Archive", exact: true }).count() === 0, "DELETE endpoint deactivates the record and refreshes status");

  const layout = await page.evaluate(() => ({ viewportWidth: window.innerWidth, documentWidth: document.documentElement.scrollWidth }));
  record(`${viewport.width}px price lists has no horizontal overflow`, layout.documentWidth <= layout.viewportWidth + 1, JSON.stringify(layout));
  record(`${viewport.width}px archived row controls are not covered by AI`, await headerAi.isVisible()
    && await page.locator('button[aria-label="Open AI assistant"]').count() === 0, "Header launcher remains outside list action rows");
  await page.screenshot({ path: path.join(screenshotDir, `pricelists-${viewport.width}.png`), fullPage: true });
  await context.close();
}

try {
  fs.mkdirSync(screenshotDir, { recursive: true });
  for (const viewport of viewports) await testViewport(viewport);
  record("no browser runtime errors", pageErrors.length === 0, JSON.stringify(pageErrors));
  record("all mutations stayed in local fixtures", fixtureMutations.length === viewports.length * 4
    && fixtureMutations.every((item) => !item.unexpected), JSON.stringify(fixtureMutations));
} catch (error) {
  record("Price Lists UAT completed", false, error instanceof Error ? error.message : String(error));
}

await browser.close();
const failures = checks.filter((check) => check.status === "FAIL");
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceWorkingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  nodeVersion: process.version,
  environment: "local Next.js dev server; Odoo API fixtures",
  target: base,
  scope: "Price Lists read/search/create/update/archive failure recovery and responsive UI",
  status: failures.length === 0 ? "PASS" : "FAIL",
  checks,
  screenshots: viewports.map(({ width }) => path.relative(root, path.join(screenshotDir, `pricelists-${width}.png`)).replaceAll(path.sep, "/")),
  fixtureMutations,
  productionBusinessWrites: 0,
  pageErrors,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: checks.length - failures.length, total: checks.length, fixtureMutations: fixtureMutations.length }));
if (failures.length) process.exitCode = 1;
