/**
 * Fixture UAT for the assistant's per-response diagnostics.
 * The assistant response is intercepted; no model or business write is made.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const user = { id: 1, name: "Admin", username: "admin", isAdmin: true, outletId: 1, vendorId: 1 };
const writes = [];
const checks = [];
const record = (name, ok, evidence = "") => checks.push({ name, status: ok ? "PASS" : "FAIL", evidence });

const browser = await chromium.launch({ headless: true });
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript((fixtureUser) => localStorage.setItem("sf_user", JSON.stringify(fixtureUser)), user);
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET" && request.method() !== "HEAD" && request.method() !== "OPTIONS" && !url.pathname.startsWith("/api/ai/")) {
      writes.push(`${request.method()} ${url.pathname}`);
    }
    if (url.pathname === "/api/ai/config/client") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: {
        enabled: true, assistantAvailable: true, transcriptionAvailable: true, labelVisionAvailable: true, invoiceVisionAvailable: true,
      } }) });
    }
    if (url.pathname === "/api/ai/assistant") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: {
        threadId: "uat-thread", intent: "report_sales", intentSummary: "Sales report", answer: "Sales report ready.", slots: {}, ui: {}, table: null, reportId: null,
      } }) });
    }
    if (url.pathname === "/api/auth/me") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: user }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: [] }) });
  });

  page = await context.newPage();
  await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const fab = page.getByRole("button", { name: "Open Orithos AI" }).first();
  await fab.waitFor({ state: "visible", timeout: 30000 });
  await fab.click();
  const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const composer = dialog.getByPlaceholder("Ask Orithos AI");
  await composer.fill("What were today's sales?");
  await composer.press("Enter");
  await page.getByText(/AI · report_sales · \d+ms/).waitFor({ timeout: 10000 });
  const diagnostics = await page.getByText(/AI · report_sales · \d+ms/).last().innerText();
  record("assistant diagnostics visible", /^AI · report_sales · \d+ms$/.test(diagnostics), diagnostics);
  const sessionDiagnostics = page.getByLabel("AI session diagnostics");
  record("single-response session summary", /AI session · 1 response · 100% success · \d+ms avg/.test(await sessionDiagnostics.innerText()), await sessionDiagnostics.innerText());

  await composer.fill("Show sales by product.");
  await composer.press("Enter");
  await page.waitForFunction(() => document.body.innerText.match(/AI · report_sales · \d+ms/g)?.length === 2, null, { timeout: 10000 });
  const twoResponseSummary = await sessionDiagnostics.innerText();
  record("multi-response session summary", /AI session · 2 responses · 100% success · \d+ms avg/.test(twoResponseSummary), twoResponseSummary);
  record("no business writes", writes.length === 0, JSON.stringify(writes));
  await context.close();
} catch (error) {
  record("run", false, `${error instanceof Error ? error.message : "failed"} body=${typeof page !== "undefined" ? (await page.locator("body").innerText().catch(() => "")).slice(-900) : ""}`);
} finally {
  await browser.close();
}

const failed = checks.filter((check) => check.status === "FAIL").length;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "local-dev-fixtures",
  target: base,
  scope: "assistant response diagnostics UI; AI request intercepted; no business writes",
  status: failed === 0 ? "PASS" : "FAIL",
  checks,
  writes,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_DIAGNOSTICS_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, failed, writes: writes.length }));
if (failed) process.exitCode = 1;
