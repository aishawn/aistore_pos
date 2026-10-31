import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "pos-ui/package.json"));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const online = process.argv.includes("--online");
const base = online ? "https://skr.orithos.com.au" : "http://localhost:3047";
const browser = await chromium.launch({ headless: true });
const checks = [];
const writes = [];
const errors = [];
const shots = path.join(root, ".local/skr-purchasing-shots");
fs.mkdirSync(shots, { recursive: true });
let runtime = null;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    if (online) {
      const env = Object.fromEntries(fs.readFileSync(process.env.PILOT_ENV_PATH || path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line.includes("=") && !line.startsWith("#")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
      const response = await context.request.post(`${base}/api/auth/login`, { headers: { Origin: base }, data: { username: env.ORITHOS_SKR_USER, password: env.ORITHOS_SKR_PASS } });
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).code, 0);
      runtime = await (await context.request.get(`${base}/api/public/version`)).json();
    } else {
      await context.addCookies([{ name: "orithos_access_token", value: "fixture-session", url: base }, { name: "orithos_local_preview", value: "1", url: base }]);
      await context.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/shopfront/purchasing") {
          if (url.searchParams.get("config") === "1") return route.fulfill({ json: { enabled: true } });
          const suppliers = url.searchParams.get("type") === "suppliers";
          const rows = Array.from({ length: suppliers ? 109 : 2355 }, (_, i) => ({ id: String(i + 1), name: suppliers ? `Supplier ${i + 1}` : `INV-${i + 1}`, status: i % 2 ? "COMPLETED" : "CANCELLED", phone: "", email: "", taxId: "", supplier: "ALM", date: "2026-10-29", total: "87.6900", syncedAt: "", lines: [{ name: "Wine", ordered: 6, received: 6, cost: 86.28 }] }));
          const q = url.searchParams.get("query")?.toLowerCase();
          const status = url.searchParams.get("status");
          const filtered = rows.filter((row) => (!q || row.name.toLowerCase().includes(q) || row.supplier.toLowerCase().includes(q)) && (status === "all" || row.status === status));
          const offset = Number(url.searchParams.get("offset"));
          return route.fulfill({ json: { enabled: true, items: filtered.slice(offset, offset + 40), sourceTotal: rows.length, total: filtered.length, hasNext: offset + 40 < filtered.length, statuses: ["COMPLETED", "CANCELLED"] } });
        }
        const data = url.pathname === "/api/auth/me" ? { id: 55, vendorId: 55, username: "fixture", name: "Fixture", isAdmin: true, roleCode: "ADMIN", permissions: [] } : [];
        return route.fulfill({ json: { code: 0, message: "ok", data } });
      });
    }
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      // The purchasing pages need only GET. Never permit a business write in UAT.
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        writes.push({ path: new URL(request.url()).pathname, method: request.method() });
        return route.fulfill({ status: 405, json: { message: "Read-only verification" } });
      }
      return route.fallback();
    });
    for (const [route, kind, count] of [["/suppliers", "suppliers", "109"], ["/purchases", "purchase orders", "2,355"]]) {
      await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.getByRole("heading", { name: new RegExp(`${kind}.*${count}`, "i") }).waitFor({ timeout: 120_000 });
      await page.getByText("SKR · Shopfront · Read-only", { exact: true }).waitFor();
      await page.locator("tbody tr").first().waitFor();
      assert.equal(await page.getByText(/Codex UAT/).count(), 0);
      assert.equal(await page.getByRole("button", { name: /Add supplier|Receive stock|Confirm order/i }).count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(shots, `${kind.replaceAll(" ", "-")}-${width}.png`), fullPage: true });
      const first = await page.locator("tbody tr").first().innerText();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await page.getByText(/41–80 of/).waitFor();
      assert.notEqual(await page.locator("tbody tr").first().innerText(), first);
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await page.getByText(/1–40 of/).waitFor();
      const search = page.getByRole("textbox", { name: `Search ${kind}` });
      await search.fill("zzzz-no-such-skr-record");
      await page.getByText(`No matching ${kind}.`, { exact: true }).waitFor();
      await search.fill("");
      await page.locator("tbody tr").first().waitFor();
      const statusFilter = page.getByRole("combobox", { name: "Filter status" });
      const availableStatus = await statusFilter.locator("option").nth(1).getAttribute("value");
      if (availableStatus) {
        await Promise.all([page.waitForResponse((response) => response.url().includes("/api/shopfront/purchasing?") && new URL(response.url()).searchParams.get("status") === availableStatus), statusFilter.selectOption(availableStatus)]);
        await page.locator("tbody tr").first().waitFor();
        const statuses = await page.locator(`tbody tr td:nth-child(${kind === "suppliers" ? 4 : 6})`).allTextContents();
        assert.ok(statuses.every((value) => value.trim() === availableStatus));
        await statusFilter.selectOption("all");
        await page.getByText(/1–40 of/).waitFor();
      }
      if (kind === "purchase orders") {
        await page.getByRole("button", { name: "View", exact: true }).first().click();
        await page.getByRole("dialog").waitFor();
        await page.getByRole("columnheader", { name: "Ordered", exact: true }).waitFor();
        await page.keyboard.press("Escape");
        assert.equal(await page.getByRole("dialog").count(), 0);
      }
      checks.push({ width, route, status: "PASS", checks: "source count, no Codex fixtures, read-only controls, pagination, search, detail, viewport" });
    }
    await context.close();
  }
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  const output = { generatedAt: new Date().toISOString(), status: "PASS", scope: online ? "online real SKR read-only" : "local browser fixture", runtime, checks, businessWrites: 0, blockedWrites: writes, errors, screenshots: shots };
  fs.writeFileSync(path.join(root, `.local/skr-purchasing-${online ? "online" : "local"}.json`), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
} finally { await browser.close(); }
