import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-21-ai-focus-full-matrix");
fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let assistantRequests = 0;
let transcriptionRequests = 0;
const writes = [];

async function runViewport(viewport) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: "orithos_access_token", value: "local-uat-session", url: base }]);
  await context.addInitScript(() => {
    localStorage.setItem("sf_token", "local-uat-session");
    localStorage.setItem("sf_user", JSON.stringify({ id: "uat-admin", name: "UAT Admin", username: "admin", isAdmin: true }));
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/ai/transcribe") transcriptionRequests += 1;
    if (url.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      writes.push(request.method() + " " + url.pathname);
    }
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "POST" && url.pathname === "/api/ai/assistant") {
      assistantRequests += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: 50301, message: "AI assistant is not enabled for this store.", data: null }),
      });
    }
    if (route.request().method() !== "GET") {
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Local UAT blocks API writes", data: null }) });
    }
    const data = url.pathname === "/api/ai/config/client"
      ? { enabled: false, aiTriggerKeywords: [] }
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data }) });
  });

  try {
    await page.goto(base + "/overview?__uat_probe=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
    const trigger = page.getByRole("button", { name: /Open Orithos AI/ }).first();
    await trigger.waitFor({ state: "visible", timeout: 30000 });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    const dialogIsModal = await dialog.getAttribute("aria-modal") === "true";
    if (!dialogIsModal) throw new Error("AI assistant dialog must be announced as modal");
    const composer = dialog.getByPlaceholder("AI chat is off for this store");
    await composer.waitFor({ state: "visible", timeout: 10000 });
    const composerInsideDialog = await dialog.locator("input[placeholder='AI chat is off for this store']").count() === 1;
    const composerDisabled = await composer.isDisabled();
    if (!composerDisabled) throw new Error("Composer must stay disabled when AI is disabled");
    const voiceButton = dialog.getByRole("button", { name: "Voice input" });
    const voiceInputDisabled = await voiceButton.isDisabled();
    if (!voiceInputDisabled) throw new Error("Voice input must stay disabled when AI is disabled");
    await dialog.getByText("AI chat is off for this store. The shortcuts below still open the right page.").waitFor({ timeout: 10000 });
    const headerSubtitle = dialog.locator("p.truncate").filter({ hasText: "AI chat is off" });
    await headerSubtitle.waitFor({ state: "visible", timeout: 10000 });
    const headerSubtitleFits = await headerSubtitle.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
    if (!headerSubtitleFits) throw new Error("AI status subtitle is truncated in the dialog header");

    let focusStayedInside = true;
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press("Tab");
      if (!(await dialog.evaluate((element) => element.contains(document.activeElement)))) {
        focusStayedInside = false;
        break;
      }
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    await page.waitForFunction(
      () => ["Open Orithos AI assistant", "Open Orithos AI"].includes(document.activeElement?.getAttribute("aria-label") ?? ""),
      undefined,
      { timeout: 3000 },
    );

    await trigger.click();
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    if (await dialog.getByPlaceholder("AI chat is off for this store").isEnabled()) {
      throw new Error("Composer must stay disabled after reopening");
    }
    if (!(await dialog.getByRole("button", { name: "Today's sales", exact: true }).isEnabled())) {
      throw new Error("AI quick questions must stay available while chat is off");
    }
    const screenshot = path.join(screenshotDir, `ai-assistant-focus-${viewport.width}.png`);
    await page.screenshot({ path: screenshot });

    results.push({
      viewport: viewport.width,
      dialogIsModal,
      composerInsideDialog,
      composerDisabled,
      voiceInputDisabled,
      focusStayedInside,
      escapeRestoredFocus: true,
      disabledAssistantCopy: true,
      headerSubtitleFits,
      screenshot: path.relative(root, screenshot).replaceAll(path.sep, "/"),
      pageErrors,
    });
  } finally {
    await context.close();
  }
}

try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await runViewport({ width, height: width < 1280 ? 844 : 900 });
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) =>
  !result.dialogIsModal
  ||   !result.composerInsideDialog
  || !result.composerDisabled
  || !result.voiceInputDisabled
  || !result.focusStayedInside
  || !result.escapeRestoredFocus
  || !result.disabledAssistantCopy
  || !result.headerSubtitleFits
  || result.pageErrors.length > 0);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "local-dev-fixtures",
  target: base,
  scope: "AI assistant dialog accessibility and disabled-state UI; all APIs intercepted locally; no model or business writes",
  status: failures.length === 0 && assistantRequests === 0 && writes.length === 0 ? "PASS" : "FAIL",
  checks: results,
  assistantRequests,
  transcriptionRequests,
  interceptedAiRequests: writes,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_FOCUS_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, status: output.status, checks: results, assistantRequests, transcriptionRequests, interceptedAiRequests: writes }));
if (output.status !== "PASS" || transcriptionRequests !== 0) process.exitCode = 1;
