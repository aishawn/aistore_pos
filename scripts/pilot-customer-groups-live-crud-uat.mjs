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
const expectedRuntimeCommit = process.env.PILOT_EXPECTED_RUNTIME_SHA ?? sourceCommit;
if (!/^[0-9a-f]{40}$/i.test(expectedRuntimeCommit)) throw new Error("INVALID_EXPECTED_RUNTIME_SHA");

const marker = `Codex UAT Group ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
const renamedMarker = `${marker} Updated`;
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_CUSTOMER_GROUPS_LIVE_CRUD_CURRENT.json");
const checks = [];
const unexpectedWrites = [];
const allowedWrites = [];
const fixtureReads = [];
let browser;
let context;
let groupId = null;
let authenticated = false;
let cleanupOk = false;
let version = {};

function record(name, status, details) {
  checks.push({ name, status, ...(details ? { details } : {}) });
}

async function searchByName(name) {
  const response = await context.request.get(`${base}/api/odoo/customer-groups?query=${encodeURIComponent(name)}&limit=100&offset=0`, {
    headers: { Origin: base },
    timeout: 30000,
  });
  if (!response.ok()) throw new Error(`GROUP_SEARCH_HTTP_${response.status()}`);
  const body = await response.json().catch(() => ({}));
  return (Array.isArray(body.items) ? body.items : []).filter((item) => item.name === name);
}

async function deleteById(id) {
  const response = await context.request.delete(`${base}/api/odoo/customer-groups/${id}`, {
    headers: { Origin: base },
    timeout: 30000,
  });
  if (!response.ok()) throw new Error(`GROUP_CLEANUP_HTTP_${response.status()}`);
}

try {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password },
    headers: { Origin: base },
    timeout: 30000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  authenticated = true;
  record("Admin authentication", "PASS");

  const versionResponse = await context.request.get(`${base}/api/public/version`, { timeout: 20000 });
  version = await versionResponse.json().catch(() => ({}));
  if (version?.frontend?.commit !== expectedRuntimeCommit || version?.backend?.commit !== expectedRuntimeCommit) {
    throw new Error("RUNTIME_SHA_MISMATCH_WRITE_TEST_BLOCKED");
  }
  const session = await context.request.get(`${base}/api/odoo/session`, { headers: { Origin: base }, timeout: 45000 });
  const sessionBody = await session.json().catch(() => ({}));
  if (!session.ok() || !sessionBody.user) throw new Error(`ODOO_SESSION_WARMUP_FAILED_${session.status()}`);
  record("Odoo session warmup", "PASS");

  if ((await searchByName(marker)).length || (await searchByName(renamedMarker)).length) {
    throw new Error("UNIQUE_TEST_MARKER_ALREADY_EXISTS");
  }

  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "GET" && url.origin === new URL(base).origin && url.pathname === "/api/sell/parked") {
      fixtureReads.push({ path: url.pathname, reason: "Avoid the legacy GET endpoint that may clean up parked sales." });
      return route.fulfill({ status: 200, json: { code: 0, data: [] } });
    }
    const groupCollection = url.origin === new URL(base).origin && url.pathname === "/api/odoo/customer-groups";
    const groupRecord = url.origin === new URL(base).origin && /^\/api\/odoo\/customer-groups\/\d+$/.test(url.pathname);
    if (method === "POST" && groupCollection || method === "PATCH" && groupRecord || method === "DELETE" && groupRecord) {
      allowedWrites.push({ method, path: url.pathname });
      return route.continue();
    }
    if (method === "POST" && url.origin === new URL(base).origin && url.pathname === "/api/odoo/records") {
      try {
        const body = request.postDataJSON();
        const keys = Object.keys(body ?? {});
        if (body?.type === "customers"
          && keys.every((key) => ["type", "query", "limit", "offset", "groupId", "pricelistId"].includes(key))) {
          return route.continue();
        }
      } catch { /* Unknown record request shapes remain blocked. */ }
    }
    if (["GET", "HEAD", "OPTIONS"].includes(method)
      || method === "POST" && url.origin === new URL(base).origin && url.pathname === "/api/auth/refresh") {
      return route.continue();
    }
    unexpectedWrites.push({ method, path: url.pathname });
    return route.fulfill({ status: 405, json: { message: "Live CRUD UAT blocked an unrelated write" } });
  });

  await page.goto(`${base}/customers?manage=groups`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const manager = page.getByRole("dialog", { name: "Manage customer groups" });
  await manager.waitFor({ timeout: 30000 });
  await manager.getByRole("heading", { name: "Groups", exact: true }).waitFor({ timeout: 30000 });
  const newGroup = manager.getByRole("button", { name: "New group", exact: true });
  await newGroup.waitFor({ timeout: 30000 });
  record("Customer group manager opens at 390px", "PASS");

  await newGroup.click();
  const createDialog = page.getByRole("dialog", { name: "New customer group" });
  await createDialog.getByLabel("Group name").fill(marker);
  const createResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST" && new URL(response.url()).pathname === "/api/odoo/customer-groups";
  }, { timeout: 30000 });
  await createDialog.getByRole("button", { name: "Create group", exact: true }).click();
  const createResponse = await createResponsePromise;
  const created = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok() || !Number.isSafeInteger(created.id)) throw new Error(`GROUP_CREATE_HTTP_${createResponse.status()}`);
  groupId = created.id;
  await manager.getByRole("button", { name: `Edit group ${marker}`, exact: true }).waitFor({ state: "visible", timeout: 30000 });
  const createdRows = await searchByName(marker);
  if (createdRows.length !== 1 || createdRows[0].id !== groupId || createdRows[0].customerCount !== 0) {
    throw new Error("CREATED_GROUP_READBACK_MISMATCH");
  }
  record("Create group and read back unassigned record", "PASS");

  await manager.getByRole("button", { name: `Edit group ${marker}`, exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit customer group" });
  await editDialog.getByLabel("Group name").fill(renamedMarker);
  const updateResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "PATCH" && new URL(response.url()).pathname === `/api/odoo/customer-groups/${groupId}`;
  }, { timeout: 30000 });
  await editDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  const updateResponse = await updateResponsePromise;
  if (!updateResponse.ok()) throw new Error(`GROUP_UPDATE_HTTP_${updateResponse.status()}`);
  await manager.getByRole("button", { name: `Edit group ${renamedMarker}`, exact: true }).waitFor({ state: "visible", timeout: 30000 });
  const updatedRows = await searchByName(renamedMarker);
  if (updatedRows.length !== 1 || updatedRows[0].id !== groupId) throw new Error("UPDATED_GROUP_READBACK_MISMATCH");
  record("Rename group and read back update", "PASS");

  await manager.getByRole("button", { name: `Delete group ${renamedMarker}`, exact: true }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete customer group?" });
  const deleteResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "DELETE" && new URL(response.url()).pathname === `/api/odoo/customer-groups/${groupId}`;
  }, { timeout: 30000 });
  await deleteDialog.getByRole("button", { name: "Delete group", exact: true }).click();
  const deleteResponse = await deleteResponsePromise;
  if (!deleteResponse.ok()) throw new Error(`GROUP_DELETE_HTTP_${deleteResponse.status()}`);
  groupId = null;
  await manager.getByRole("button", { name: `Edit group ${renamedMarker}`, exact: true }).first().waitFor({ state: "detached", timeout: 30000 });
  if ((await searchByName(marker)).length || (await searchByName(renamedMarker)).length) throw new Error("GROUP_DELETE_READBACK_STILL_PRESENT");
  cleanupOk = true;
  record("Delete group and verify both names are absent", "PASS");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error("CUSTOMER_GROUP_MANAGER_MOBILE_OVERFLOW");
  if (pageErrors.length) throw new Error("CUSTOMER_GROUP_MANAGER_PAGE_ERROR");
  if (unexpectedWrites.length) throw new Error("UNEXPECTED_BUSINESS_WRITE_BLOCKED");
  record("Mobile layout, browser errors and API write scope", "PASS");
} catch (error) {
  record("Run", "FAIL", error instanceof Error ? error.message : "Unexpected failure");
} finally {
  if (context && authenticated) {
    try {
      let ids = groupId ? [groupId] : [];
      for (const name of [marker, renamedMarker]) {
        const matches = await searchByName(name);
        ids = [...new Set([...ids, ...matches.filter((item) => item.name === name).map((item) => item.id)])];
      }
      for (const id of ids) await deleteById(id);
      cleanupOk = !(await searchByName(marker)).length && !(await searchByName(renamedMarker)).length;
      record("Finally cleanup and absence verification", cleanupOk ? "PASS" : "FAIL");
    } catch {
      cleanupOk = false;
      record("Finally cleanup and absence verification", "FAIL", "Cleanup did not complete; inspect the Demo customer-groups list for this run's unique Codex UAT Group marker.");
    }
    await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base }, timeout: 5000 }).catch(() => null);
  }
  await browser?.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  target: base,
  sourceCommit,
  runtime: {
    frontendCommit: version?.frontend?.commit ?? null,
    backendCommit: version?.backend?.commit ?? null,
    matchesSourceCommit: version?.frontend?.commit === sourceCommit && version?.backend?.commit === sourceCommit,
    expectedCommit: expectedRuntimeCommit,
  },
  viewport: 390,
  scope: "Authenticated customer-group UI create/read/rename/delete; random unassigned company-scoped fixture; parked-sales GET replaced with an empty fixture; finally cleanup and read-after-delete verification; unrelated writes blocked",
  status: checks.some((check) => check.status === "FAIL") || !cleanupOk || unexpectedWrites.length ? "FAIL" : "PASS",
  businessWrites: allowedWrites.length,
  cleanupVerified: cleanupOk,
  fixtureReads,
  unexpectedWrites,
  checks,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, failed: checks.filter((check) => check.status === "FAIL").length, businessWrites: output.businessWrites, cleanupVerified: cleanupOk, runtimeMatchesSource: output.runtime.matchesSourceCommit }));
if (output.status !== "PASS") process.exitCode = 1;
