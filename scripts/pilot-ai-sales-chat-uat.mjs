import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const env = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const productCountMode = process.env.PILOT_AI_SCENARIO === "product-count";
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR || "temp/screenshots/ai-product-count-chat-online");
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];
const runtime = await fetch(`${base}/api/public/version`).then((response) => response.json());

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const context = await browser.newContext({ viewport });
  let text = "";
  let productCountChecks = null;
  try {
    const login = await context.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password },
      headers: { Origin: base },
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
    const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
    if (!accessCookie || !loginBody.data?.user) throw new Error("LOGIN_SESSION_MISSING");
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem("sf_token", token);
      localStorage.setItem("sf_user", JSON.stringify(user));
    }, { token: accessCookie.value, user: loginBody.data.user });

    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${base}/overview`, { waitUntil: "networkidle", timeout: 60000 });
    await page.getByRole("button", { name: /Open Orithos AI/ }).first().click();
    const assistant = page.getByRole("dialog", { name: "Orithos AI assistant" });
    await assistant.waitFor({ state: "visible", timeout: 10000 });
    const composer = assistant.getByPlaceholder("Ask Orithos AI");
    const send = assistant.getByRole("button", { name: "Send message", exact: true });
    await composer.fill(productCountMode ? "How many products do we have?" : "16 Oct 2026 sales");
    await send.click();
    if (productCountMode) {
      const answer = assistant.getByText(/This store has [\d,]+ sellable products in the catalogue\./).last();
      await answer.waitFor({ state: "visible", timeout: 120000 });
      text = (await answer.innerText()).replace(/\s+/g, " ").trim();
      const cta = assistant.getByRole("button", { name: /Open products/i }).last();
      await cta.waitFor({ state: "visible", timeout: 10000 });
      const ctaVisible = await cta.isVisible();
      const panelText = await assistant.innerText();
      const beforeClickPath = new URL(page.url()).pathname;
      const sourceLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      await fs.promises.mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, `product-count-${viewport.width}.png`) });
      if (ctaVisible) await cta.click();
      await page.waitForFunction(() => window.location.pathname === "/products/odoo", null, { timeout: 15000 }).catch(() => null);
      const destinationPath = new URL(page.url()).pathname;
      const destinationLayout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      await page.screenshot({ path: path.join(screenshotDir, `product-count-destination-${viewport.width}.png`) });
      productCountChecks = {
        hasLiveNumber: /\b[\d,]+\b/.test(text),
        ctaVisible,
        deferredUntilClick: beforeClickPath === "/overview",
        destinationPath,
        destinationCorrect: destinationPath === "/products/odoo",
        duplicateNavigationInAnswer: /Open Products to browse\./.test(panelText),
        noHorizontalOverflow: sourceLayout.document <= sourceLayout.viewport
          && destinationLayout.document <= destinationLayout.viewport,
      };
      if (!productCountChecks.hasLiveNumber || !ctaVisible || !productCountChecks.deferredUntilClick
          || !productCountChecks.destinationCorrect || productCountChecks.duplicateNavigationInAnswer
          || !productCountChecks.noHorizontalOverflow) {
        throw new Error("PRODUCT_COUNT_CHAT_ASSERTION_FAILED");
      }
    } else {
      const summary = assistant.getByText(/Sales for 2026-10-16 total AUD \d+(?:\.\d{2})? \(1 day\)\./);
      await summary.waitFor({ state: "visible", timeout: 120000 });
      text = (await summary.innerText()).replace(/\s+/g, " ").trim();
      if (/\(1 day\(s\)\)/i.test(text)) throw new Error("GENERIC_SINGULAR_PLURAL_LABEL");
    }
    if (pageErrors.length) throw new Error("PAGE_ERROR");
    results.push({ viewport: viewport.width, status: "PASS", visibleAnswer: text, ...(productCountChecks ? { productCountChecks } : {}) });
  } catch (error) {
    failures.push({ viewport: viewport.width, reason: error instanceof Error ? error.message : "UNKNOWN_FAILURE" });
    results.push({ viewport: viewport.width, status: "FAIL", ...(text ? { visibleAnswer: text } : {}), ...(productCountChecks ? { productCountChecks } : {}) });
  } finally {
    await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
    await context.close();
  }
}

await browser.close();
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  runtimeCommit: runtime.frontend?.commit === runtime.backend?.commit ? runtime.backend.commit : null,
  target: base,
  scope: productCountMode
    ? "read-only product-count chat UI, live answer, CTA navigation, and responsive layout; no business writes"
    : "read-only screenshot regression for single-day sales wording; no business writes",
  results,
  passed: results.filter((result) => result.status === "PASS").length,
  failed: failures.length,
  failures,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_SALES_CHAT_UI_ONLINE.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, failed: output.failed, runtimeCommit: output.runtimeCommit }));
if (output.failed) process.exitCode = 1;
