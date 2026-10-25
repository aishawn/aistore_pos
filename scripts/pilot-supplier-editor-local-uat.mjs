import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3101";
if (!new URL(base).hostname.endsWith(".localhost")) throw new Error("LOCAL_TENANT_FIXTURE_TARGET_REQUIRED");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_SUPPLIER_EDITOR_LOCAL_2026-10-23_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-23-supplier-editor-local");
fs.mkdirSync(screenshotDir, { recursive: true });

const fixtureUser = { id: 1, username: "admin", name: "Fixture Admin", isAdmin: true };
const checks = [];
const blockedWrites = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--no-proxy-server", "--host-resolver-rules=MAP demo.localhost 127.0.0.1"],
});

try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addCookies([{ name: "orithos_access_token", value: "supplier-editor-local-uat", url: base }]);
    await context.addInitScript((user) => {
      localStorage.setItem("sf_token", "supplier-editor-local-uat");
      localStorage.setItem("sf_user", JSON.stringify(user));
    }, fixtureUser);
    await context.route("**/api/**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push({ viewport: width, method: request.method(), path: pathname });
        return route.fulfill({ status: 405, json: { code: 40500, message: "Local fixture blocked writes", data: null } });
      }
      if (pathname === "/api/classifications/brand/mdb-references") {
        return route.fulfill({ json: { code: 0, message: "ok", data: [] } });
      }
      return route.fulfill({ json: { code: 0, message: "ok", data: [] } });
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const record = (name, passed, evidence = null) => checks.push({ viewport: width, name, status: passed ? "PASS" : "FAIL", evidence });
    try {
      const response = await page.goto(`${base}/suppliers/new`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const heading = page.getByRole("heading", { name: "New Supplier", exact: true });
      const save = page.getByRole("button", { name: "Save", exact: true });
      await heading.waitFor({ state: "visible" });
      await save.waitFor({ state: "visible" });
      const metrics = await page.evaluate(() => {
        const overlay = document.querySelector("div.absolute.inset-0.z-50");
        const title = document.querySelector("h1");
        const saveButton = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Save");
        const saveBox = saveButton?.getBoundingClientRect();
        return {
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          viewport: innerWidth,
          overlayBackground: overlay ? getComputedStyle(overlay).backgroundColor : null,
          headingColor: title ? getComputedStyle(title).color : null,
          saveVisible: Boolean(saveBox?.width && saveBox?.height),
          saveInViewport: Boolean(saveBox && saveBox.left >= 0 && saveBox.right <= innerWidth && saveBox.top >= 0 && saveBox.bottom <= innerHeight),
          generalSectionVisible: Boolean(document.querySelector("#section-general > button")),
          contactSectionVisible: Boolean(document.querySelector("#section-contact > button")),
          headerAiEntryVisible: Boolean(document.querySelector("header button[aria-label='Open Orithos AI assistant']")),
          aiLauncherCount: document.querySelectorAll("button[aria-label='Open Orithos AI assistant']").length,
        };
      });
      const noOverflow = metrics.documentWidth <= width && metrics.bodyWidth <= width;
      record("editor and Save action render without horizontal overflow", response?.status() === 200 && metrics.saveVisible && noOverflow, metrics);
      record("editor keeps readable scrim and title contrast", Boolean(metrics.overlayBackground?.includes("0.35")) && metrics.headingColor === "rgb(31, 41, 55)", { overlayBackground: metrics.overlayBackground, headingColor: metrics.headingColor });
      record("save action stays inside viewport", metrics.saveInViewport);
      record("AI launcher stays in the app header outside the editor form", metrics.headerAiEntryVisible && metrics.aiLauncherCount === 1);
      if (width === 1440) record("desktop editor exposes general and contact sections", metrics.generalSectionVisible && metrics.contactSectionVisible);

      await save.click();
      await page.getByRole("alert").filter({ hasText: "Name is required." }).waitFor({ state: "visible" });
      record("empty supplier name is rejected before network write", await page.getByRole("alert").filter({ hasText: "Name is required." }).isVisible() && blockedWrites.filter((item) => item.viewport === width).length === 0);
      await page.locator("#section-general input").first().fill("Fixture Editor Supplier");
      await page.screenshot({ path: path.join(screenshotDir, `supplier-editor-${width}.png`), fullPage: true });
      record("no browser page errors or unexpected API writes", pageErrors.length === 0 && blockedWrites.filter((item) => item.viewport === width).length === 0, pageErrors);
    } catch (error) {
      record("editor viewport flow completes", false, {
        error: error instanceof Error ? error.message : "Unexpected failure",
        url: page.url(),
        title: await page.title().catch(() => ""),
        pageText: (await page.locator("body").innerText().catch(() => "")).slice(0, 240),
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

const failed = checks.filter((check) => check.status === "FAIL").length;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  nodeVersion: process.version,
  target: base,
  scope: "Local read-only fixture for supplier editor visual layout and empty-name validation; no API writes permitted",
  status: failed === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL",
  passed: checks.length - failed,
  failed,
  checks,
  blockedWrites,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed, blockedWrites: blockedWrites.length }));
if (output.status !== "PASS") process.exitCode = 1;
