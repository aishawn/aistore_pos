import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";

const base = process.env.PILOT_BASE_URL || "http://demo.lvh.me:3102";
const target = new URL(base);
if (!["localhost", "127.0.0.1", "demo.lvh.me"].includes(target.hostname)) {
  throw new Error("Local auth regression only");
}
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-proxy-server", "--host-resolver-rules=MAP demo.lvh.me 127.0.0.1"],
});
const checks = [];
const fixtureUser = { id: "1", name: "Auth Fixture", username: "fixture", isAdmin: true };

async function scenario(name, run) {
  const context = await browser.newContext();
  try {
    await run(context);
    checks.push({ name, status: "PASS" });
  } catch (error) {
    checks.push({ name, status: "FAIL", message: error.message });
  } finally {
    await context.close();
  }
}

try {
  await scenario("Preview remains on workspace after backend 401, including reload", async (context) => {
    let refreshes = 0;
    let failures = 0;
    await context.route("**/api/**", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/auth/refresh") refreshes++;
      failures++;
      await route.fulfill({ status: 401, json: { code: 40100, message: "Fixture expired session", data: null } });
    });
    const page = await context.newPage();
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    refreshes = 0;
    await page.getByRole("button", { name: "Preview Dashboard locally" }).click();
    await page.waitForURL(/\/dashboard(?:\/workspace)?$/);
    await page.waitForTimeout(1500);
    // Exercise the exact URL reported by the owner, then full page reload.
    await page.goto(`${base}/dashboard/workspace`, { waitUntil: "networkidle" });
    for (let i = 0; i < 2; i++) {
      if (i) await page.reload({ waitUntil: "networkidle" });
      const navigations = [];
      const record = (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); };
      page.on("framenavigated", record);
      await page.waitForTimeout(5000);
      assert.equal(new URL(page.url()).pathname, "/dashboard/workspace");
      assert.equal(navigations.length, 0, JSON.stringify(navigations));
      assert.match(await page.locator("body").innerText(), /Local Preview/);
      page.off("framenavigated", record);
    }
    assert.ok(failures > 0, "Must exercise unauthorized backend responses");
    assert.equal(refreshes, 0, `Unexpected preview refresh attempts: ${refreshes}`);
  });

  await scenario("Expired normal session clears cached user and stays on login", async (context) => {
    await context.addCookies([{ name: "orithos_access_token", value: "expired-fixture", url: base }]);
    await context.addInitScript((user) => {
      if (!sessionStorage.getItem("auth-fixture-initialized")) {
        localStorage.setItem("sf_user", JSON.stringify(user));
        sessionStorage.setItem("auth-fixture-initialized", "1");
      }
    }, fixtureUser);
    await context.route("**/api/**", (route) => route.fulfill({
      status: 401, json: { code: 40100, message: "Fixture expired session", data: null },
    }));
    const page = await context.newPage();
    await page.goto(`${base}/dashboard/workspace`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    assert.equal(new URL(page.url()).pathname, "/login");
    assert.equal(await page.evaluate(() => localStorage.getItem("sf_user")), null);
    await page.getByRole("button", { name: "Login", exact: true }).waitFor();
  });

  await scenario("Verified normal session redirects login to workspace", async (context) => {
    await context.addCookies([{ name: "orithos_access_token", value: "valid-fixture", url: base }]);
    await context.route("**/api/**", (route) => {
      const me = new URL(route.request().url()).pathname === "/api/auth/me";
      return route.fulfill({ status: me ? 200 : 503, json: me
        ? { code: 0, data: fixtureUser }
        : { code: 50300, message: "Fixture service unavailable", data: null } });
    });
    const page = await context.newPage();
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(`${base}/dashboard/workspace`);
    await page.waitForTimeout(4000);
    assert.equal(new URL(page.url()).pathname, "/dashboard/workspace");
    assert.match(await page.locator("body").innerText(), /Auth Fixture/);
  });
} finally {
  await browser.close();
}
const report = { generatedAt: new Date().toISOString(), target: base,
  scope: "Local browser auth regression; all backend APIs intercepted; zero real business writes", checks };
fs.writeFileSync(new URL("../docs/UAT_LOCAL_PREVIEW_AUTH_2026-10-24.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (checks.some((check) => check.status !== "PASS")) process.exitCode = 1;
