import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3100";
if (!new URL(base).hostname.endsWith(".localhost") && !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("This fixture UAT is local-only.");
}
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_CUSTOMER_GROUPS_LOCAL_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-24-customer-groups-local");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });

const checks = [];
const simulatedWrites = [];
const widths = [390, 768, 1024, 1440];
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server", "--host-resolver-rules=MAP demo.localhost 127.0.0.1"] });

function record(width, role, name, status, details) {
  checks.push({ width, role, name, status, ...(details ? { details } : {}) });
}

async function fixturePage(width, isAdmin) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const fixtureUser = { id: 1, username: "fixture-user", name: "Fixture User", isAdmin, vendorId: 41, outletId: 1 };
  await context.addCookies([{ name: "orithos_access_token", value: `customer-groups-${isAdmin}`, url: base }]);
  await context.addInitScript((user) => {
    localStorage.setItem("sf_token", "customer-groups-fixture");
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, fixtureUser);

  let groups = [{ id: 9, name: "Wholesale", color: 0, parentId: null, parentName: null, customerCount: 2 }];
  let nextId = 10;
  let releaseDelayedSearch;
  let delayedSearchStartedResolve;
  const delayedSearchStarted = new Promise((resolve) => { delayedSearchStartedResolve = resolve; });
  const delayedSearchGate = new Promise((resolve) => { releaseDelayedSearch = resolve; });
  const pageErrors = [];
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/auth/me" && method === "GET") return fulfill({ code: 0, data: fixtureUser });
    if (url.pathname === "/api/odoo/session" && method === "GET") return fulfill({ user: { name: "Fixture Odoo Staff", allowedCompanyIds: [41] } });
    if (url.pathname === "/api/odoo/customer-groups" && method === "GET") {
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      if (query === "delayed-no-match") {
        delayedSearchStartedResolve();
        await delayedSearchGate;
      }
      return fulfill({ items: groups.filter((group) => group.name.toLowerCase().includes(query)), hasNext: false });
    }

    if (url.pathname === "/api/odoo/customer-groups" && method === "POST") {
      simulatedWrites.push({ method, path: url.pathname, role: isAdmin ? "admin" : "staff", body: request.postDataJSON() });
      if (!isAdmin) return fulfill({ message: "Forbidden" }, 403);
      const body = request.postDataJSON() ?? {};
      const group = { id: nextId++, name: body.name, color: 0, parentId: null, parentName: null, customerCount: 0 };
      groups.push(group);
      return fulfill({ id: group.id, name: group.name }, 201);
    }

    const groupMatch = url.pathname.match(/^\/api\/odoo\/customer-groups\/(\d+)$/);
    if (groupMatch && method === "PATCH") {
      simulatedWrites.push({ method, path: url.pathname, role: isAdmin ? "admin" : "staff", body: request.postDataJSON() });
      if (!isAdmin) return fulfill({ message: "Forbidden" }, 403);
      const group = groups.find((item) => item.id === Number(groupMatch[1]));
      if (group) group.name = request.postDataJSON()?.name;
      return fulfill({ message: "Updated" });
    }
    if (groupMatch && method === "DELETE") {
      simulatedWrites.push({ method, path: url.pathname, role: isAdmin ? "admin" : "staff" });
      if (!isAdmin) return fulfill({ message: "Forbidden" }, 403);
      groups = groups.filter((item) => item.id !== Number(groupMatch[1]));
      return route.fulfill({ status: 204, body: "" });
    }

    if (["GET", "HEAD", "OPTIONS"].includes(method)) return fulfill({ code: 0, data: {} });
    simulatedWrites.push({ method, path: url.pathname, role: isAdmin ? "admin" : "staff", unexpected: true });
    return fulfill({ message: "Fixture blocked unexpected write" }, 405);
  });

  return { context, page, pageErrors, delayedSearchStarted, releaseDelayedSearch };
}

try {
  for (const width of widths) {
    const { context, page, pageErrors, delayedSearchStarted, releaseDelayedSearch } = await fixturePage(width, true);
    await page.goto(`${base}/customer-groups`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByRole("heading", { name: "Groups", exact: true }).waitFor();
    await page.getByText("Wholesale", { exact: true }).first().waitFor({ state: "attached" });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    record(width, "admin", "Odoo customer groups load without horizontal overflow", "PASS");
    const groupList = page.locator("main > section[aria-busy='false']");
    if (width < 1280) {
      const listBox = await groupList.boundingBox();
      assert.ok(listBox && listBox.height < 180, `group list should fit its single result at ${width}px`);
      record(width, "admin", "short customer group lists do not expand to the viewport height", "PASS", { listHeight: listBox.height });
    }
    assert.equal(await page.locator("header").getByRole("button", { name: "Open Orithos AI assistant" }).count(), 1);
    assert.equal(await page.locator('[aria-label="Open Orithos AI assistant"]').count(), 1);
    await page.screenshot({ path: path.join(screenshotDir, `customer-groups-admin-${width}.png`), fullPage: true });

    if (width === 390) {
      const search = page.getByRole("textbox", { name: "Search customer groups", exact: true });
      await search.fill("delayed-no-match");
      assert.equal(await search.getAttribute("aria-busy"), "true");
      assert.equal(await page.getByRole("button", { name: "Edit group Wholesale" }).isDisabled(), true);
      record(width, "admin", "search immediately locks stale group actions", "PASS");
      await Promise.race([
        delayedSearchStarted,
        page.waitForTimeout(5_000).then(() => { throw new Error("DELAYED_SEARCH_DID_NOT_START"); }),
      ]);
      assert.equal(await page.getByRole("button", { name: "Delete group Wholesale" }).isDisabled(), true);
      releaseDelayedSearch();
      await page.getByText("No customer groups match this search", { exact: true }).waitFor();
      record(width, "admin", "current delayed search replaces stale results", "PASS");
      await search.fill("");
      await page.getByText("Wholesale", { exact: true }).last().waitFor({ state: "visible" });
    }

    await page.getByRole("button", { name: "New group" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel("Group name").fill("Fixture Group");
    await createDialog.getByRole("button", { name: "Create group" }).click();
    await page.getByText("Fixture Group", { exact: true }).first().waitFor({ state: "attached" });
    record(width, "admin", "create customer group is sent to Odoo fixture", "PASS");

    await page.getByRole("button", { name: "Edit group Fixture Group" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByLabel("Group name").fill("Fixture Group Updated");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Fixture Group Updated", { exact: true }).first().waitFor({ state: "attached" });
    record(width, "admin", "rename customer group is sent to Odoo fixture", "PASS");

    await page.getByRole("button", { name: "Delete group Fixture Group Updated" }).click();
    const deleteDialog = page.getByRole("alertdialog");
    await deleteDialog.getByRole("button", { name: "Delete group" }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll("td, p")].some((element) => element.textContent?.trim() === "Fixture Group Updated"));
    record(width, "admin", "delete customer group is sent to Odoo fixture", "PASS");
    assert.deepEqual(pageErrors, []);
    await context.close();
  }

  const { context, page, pageErrors } = await fixturePage(390, false);
  await page.goto(`${base}/customer-groups`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByRole("heading", { name: "Groups", exact: true }).waitFor();
  await page.getByText("Wholesale", { exact: true }).first().waitFor({ state: "attached" });
  assert.equal(await page.getByRole("button", { name: "New group" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Edit group Wholesale" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Delete group Wholesale" }).count(), 0);
  record(390, "staff", "non-admin can view groups but has no write controls", "PASS");
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceWorkingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0,
  target: base,
  environment: `local Next.js dev server; Node ${process.version}; browser API fixtures`,
  scope: "Odoo customer groups list, responsive UI, admin create/rename/delete and non-admin read-only controls; all API requests intercepted",
  status: checks.some((check) => check.status === "FAIL") ? "FAIL" : "PASS",
  passed: checks.filter((check) => check.status === "PASS").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  simulatedWriteRequests: simulatedWrites.length,
  productionBusinessWrites: 0,
  simulatedWrites,
  checks,
  screenshots: widths.map((width) => path.relative(root, path.join(screenshotDir, `customer-groups-admin-${width}.png`)).replaceAll("\\", "/")),
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, productionBusinessWrites: output.productionBusinessWrites, simulatedWriteRequests: output.simulatedWriteRequests }));
if (output.failed) process.exitCode = 1;
