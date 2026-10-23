import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
const base = process.env.PILOT_BASE_URL || "http://demo.localhost:3101";
if (!new URL(base).hostname.endsWith(".localhost"))
  throw new Error("Local fixtures only");
const out = path.resolve("docs/screenshots/2026-10-23-overview-apple");
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-proxy-server"],
});
const results = [],
  errors = [],
  writes = [],
  authRequests = [];
let complete = false;
const admin = {
  id: 1,
  username: "admin",
  name: "Alex",
  isAdmin: true,
  vendorId: 41,
  permissions: [],
};
async function setup(
  width,
  height,
  {
    restricted = false,
    zero = false,
    long = false,
    failure = false,
    delay = 0,
    reduced = false,
    disconnected = false,
  } = {},
) {
  const user = restricted
    ? {
        ...admin,
        isAdmin: false,
        permissions: ["sell.checkout", "customers.view"],
      }
    : admin;
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: width < 768,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await context.addCookies([
    { name: "orithos_access_token", value: "overview-fixture", url: base },
  ]);
  await context.addInitScript((u) => {
    localStorage.setItem("sf_user", JSON.stringify(u));
    localStorage.setItem("sf_token", "fixture");
    localStorage.setItem(
      "orithos-odoo-parked-sales-v1",
      JSON.stringify([{ id: 1 }]),
    );
  }, user);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(90000);
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  let failed = failure;
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const reply = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/api/auth/refresh" && req.method() === "POST") {
      authRequests.push("POST /api/auth/refresh (mocked)");
      return reply({ code: 0 });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) {
      writes.push(req.method() + " " + url.pathname);
      return reply({}, 405);
    }
    if (url.pathname === "/api/auth/me") return reply({ code: 0, data: user });
    if (url.pathname === "/api/odoo/session" && disconnected)
      return reply({ message: "Connect your Odoo account" }, 401);
    if (url.pathname === "/api/odoo/session")
      return reply({
        user: { name: "Alex", allowedCompanyIds: [41] },
        autoRecoverConfigured: false,
      });
    if (url.pathname === "/api/odoo/reporting-dashboard") {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (failed) {
        failed = false;
        return reply({ message: "Store service temporarily unavailable" }, 503);
      }
      return reply({
        company: long
          ? "Orithos Pilot Liquor Store — Adelaide City and Regional Specialty Retail Operations (TEST)"
          : "Orithos Pilot Liquor Store",
        currency: "AUD",
        timezone: "Australia/Adelaide",
        revenue: zero ? 0 : 4238.5,
        transactions: zero ? 0 : 38,
        openRegisters: 2,
      });
    }
    return reply({ code: 0, data: { enabled: false, items: [] } });
  });
  return { context, page };
}
async function layout(page, label) {
  const report = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    overlap: [
      ...document.querySelectorAll(".ov-module,.ov-ring-node,.ov-submenu"),
    ].some((e) => {
      const r = e.getBoundingClientRect();
      return r.left < -1 || r.right > innerWidth + 1;
    }),
  }));
  assert.ok(report.scroll <= report.width, `${label}: horizontal overflow`);
  assert.equal(report.overlap, false, `${label}: clipped controls`);
  const collisions = await page.evaluate(() => {
    const panel = document.querySelector(".ov-submenu");
    if (!panel) return [];
    const p = panel.getBoundingClientRect();
    return [...document.querySelectorAll(".ov-ring-node")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.left < p.right &&
          r.right > p.left &&
          r.top < p.bottom &&
          r.bottom > p.top
        );
      })
      .map((e) => e.textContent);
  });
  assert.deepEqual(collisions, [], `${label}: submenu overlaps module`);
  results.push({ label, ...report });
}
try {
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1024, 768],
    [1440, 700],
    [390, 844],
    [320, 740],
  ]) {
    const { context, page } = await setup(width, height);
    for (const view of ["workspace", "radial"]) {
      await page.goto(
        base + (view === "workspace" ? "/overview/workspace" : "/overview"),
        { waitUntil: "domcontentloaded" },
      );
      await page
        .locator(view === "workspace" ? ".ov-module" : ".ov-ring-center")
        .first()
        .waitFor({ timeout: 60000 });
      await page.screenshot({
        path: path.join(out, `${view}-${width}x${height}.png`),
        fullPage: true,
      });
      await layout(page, `${view}-${width}x${height}`);
      if (width < 768) {
        await page
          .locator(".ov-page")
          .evaluate((e) => (e.scrollTop = e.scrollHeight));
        await page.screenshot({
          path: path.join(out, `${view}-${width}-scrolled.png`),
        });
        await page.locator(".ov-page").evaluate((e) => (e.scrollTop = 0));
        assert.equal(
          await page
            .locator('[aria-label="Open Orithos AI assistant"]')
            .count(),
          1,
        );
      }
      if (view === "workspace")
        assert.equal(await page.locator(".ov-module").count(), 7);
      else {
        for (const name of ["Stock", "Customers", "Orithos AI", "Setup"]) {
          const trigger = page
            .locator(".ov-ring-nodes")
            .getByRole("button", { name, exact: true });
          if (width < 768) await trigger.tap();
          else await trigger.click();
          await assert.doesNotReject(() =>
            page.locator(".ov-submenu,.ov-inline-children").waitFor(),
          );
          await layout(page, `${width}-${height}-${name}-expanded`);
          if (name === "Setup")
            assert.equal(
              await page.locator(".ov-submenu a,.ov-inline-children a").count(),
              8,
            );
          await page.keyboard.press("Escape");
          await assert.doesNotReject(() =>
            page
              .locator(".ov-submenu,.ov-inline-children")
              .waitFor({ state: "hidden" }),
          );
          assert.equal(
            await trigger.evaluate((e) => e === document.activeElement),
            true,
          );
        }
      }
    }
    await context.close();
  }
  for (const [label, opts] of [
    ["zero", { zero: true }],
    ["long", { long: true }],
    ["restricted", { restricted: true }],
    ["retry", { failure: true }],
    ["reduced", { reduced: true }],
  ]) {
    const { context, page } = await setup(1440, 900, opts);
    for (const view of ["workspace", "radial"]) {
      await page.goto(
        base + (view === "workspace" ? "/overview/workspace" : "/overview"),
      );
      if (label === "retry" && view === "workspace") {
        await page.locator(".ov-error[role=alert]").waitFor();
        assert.equal(await page.locator(".ov-summary").count(), 0);
        await page.getByRole("button", { name: "Retry", exact: true }).click();
      }
      await page
        .locator(view === "workspace" ? ".ov-module" : ".ov-ring-center")
        .first()
        .waitFor();
      if (label === "restricted") {
        if (view === "workspace")
          assert.equal(await page.locator(".ov-module").count(), 2);
        else
          assert.equal(
            await page.locator(".ov-ring-center").getAttribute("href"),
            null,
          );
      }
      if (view === "radial" && label !== "restricted") {
        await page
          .locator(".ov-ring-nodes")
          .getByRole("button", { name: "Setup", exact: true })
          .click();
      }
      await page.screenshot({
        path: path.join(out, `${view}-${label}.png`),
        fullPage: true,
      });
      await layout(page, `${view}-${label}`);
    }
    await context.close();
  }
  const { context, page } = await setup(1440, 900);
  await page.goto(base + "/overview/workspace");
  await page.locator(".ov-module").first().waitFor();
  await page
    .getByRole("button", { name: "Open store quick menu", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Store quick menu", exact: true })
    .waitFor();
  assert.equal(new URL(page.url()).pathname, "/overview/workspace");
  await page
    .locator('[role="dialog"] .ov-ring-nodes')
    .getByRole("button", { name: "Setup", exact: true })
    .click();
  await page.locator('[role="dialog"] .ov-submenu').waitFor();
  await page.screenshot({ path: path.join(out, "quick-menu-1440.png") });
  await page.keyboard.press("Escape");
  await page
    .locator('[role="dialog"] .ov-submenu')
    .waitFor({ state: "hidden" });
  await page.keyboard.press("Escape");
  await page
    .getByRole("dialog", { name: "Store quick menu", exact: true })
    .waitFor({ state: "hidden" });
  results.push({ label: "quick-menu-stays-on-workspace", pass: true });
  await page
    .getByRole("button", { name: "Open Orithos AI assistant", exact: true })
    .click();
  await page.getByRole("dialog", { name: /assistant/i }).waitFor();
  await page.keyboard.press("Escape");
  results.push({ label: "toolbar-ai-opens-and-closes", pass: true });
  await page.goto(base + "/overview");
  const setupTrigger = page.locator(".ov-ring-nodes").getByRole("button", { name: "Setup", exact: true });
  await setupTrigger.focus();
  await page.keyboard.press("ArrowDown");
  await page.locator(".ov-submenu a").first().waitFor();
  assert.equal(await page.locator(".ov-submenu a").first().evaluate(e => e === document.activeElement), true);
  await page.keyboard.press("End");
  assert.equal(await page.locator(".ov-submenu a").last().evaluate(e => e === document.activeElement), true);
  await page.keyboard.press("Escape");
  results.push({ label: "radial-arrow-keys-and-focus-return", pass: true });
  await setupTrigger.hover();
  await page.locator(".ov-submenu").waitFor();
  await page.mouse.move(8, 8);
  await page.locator(".ov-submenu").waitFor({ state: "hidden" });
  results.push({ label: "hover-preview-clears-without-navigation", pass: true });
  await setupTrigger.click();
  await page.mouse.move(8, 8);
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".ov-submenu").isVisible(), true);
  await page.locator(".ov-header h1").click();
  await page.locator(".ov-submenu").waitFor({ state: "hidden" });
  results.push({ label: "pinned-group-persists-and-outside-click-closes", pass: true });
  await context.close();
  for (const width of [320, 390, 1024]) {
    const { context, page } = await setup(width, 740);
    await page.goto(base + "/overview/workspace");
    await page.locator(".ov-module").first().waitFor();
    await page
      .getByRole("button", { name: "Open store quick menu", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Store quick menu",
      exact: true,
    });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Setup", exact: true }).click();
    await dialog.locator(".ov-inline-children,.ov-submenu").waitFor();
    const last = dialog.getByRole("link", {
      name: "AI Query Health",
      exact: true,
    });
    await last.scrollIntoViewIfNeeded();
    await last.focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await dialog.evaluate((e) => e.contains(document.activeElement)),
      true,
    );
    await page.screenshot({
      path: path.join(out, `quick-menu-${width}-expanded.png`),
    });
    await layout(page, `quick-menu-${width}-expanded`);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    results.push({ label: `quick-menu-${width}-scroll-and-focus`, pass: true });
    await context.close();
  }
  const loading = await setup(1440, 900, { delay: 2200 });
  await loading.page.goto(base + "/overview/workspace", {
    waitUntil: "domcontentloaded",
  });
  await loading.page
    .getByRole("status", { name: "Loading overview" })
    .waitFor();
  await loading.page.screenshot({
    path: path.join(out, "workspace-loading.png"),
  });
  await loading.page.locator(".ov-module").first().waitFor();
  results.push({ label: "loading-without-fake-zero", pass: true });
  await loading.context.close();
  const disconnected = await setup(1440, 900, { disconnected: true });
  await disconnected.page.goto(base + "/overview");
  await disconnected.page
    .getByRole("heading", { name: "Connect your store", exact: true })
    .waitFor();
  assert.equal(await disconnected.page.locator(".ov-ring-center").count(), 0);
  await disconnected.page.screenshot({
    path: path.join(out, "radial-disconnected.png"),
  });
  results.push({ label: "disconnected-state", pass: true });
  await disconnected.context.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  complete = true;
} finally {
  await browser.close();
  fs.writeFileSync(
    "docs/UAT_OVERVIEW_APPLE_LOCAL_2026-10-23.json",
    JSON.stringify(
      {
        status: complete ? "PASS" : "FAIL",
        base,
        authRequests,
        scope: "Local fixture UI only; no real Odoo acceptance",
        results,
        errors,
        writes,
      },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ checks: results.length, errors, writes }));
