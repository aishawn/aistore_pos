import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
const base = "https://demo.orithos.com.au";
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
if (!adminPassword) throw new Error("MISSING_ADMIN_PASSWORD");

const browser = await chromium.launch({ headless: true });
const results = [];

async function runViewport(viewport) {
  const context = await browser.newContext({ viewport });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password: adminPassword },
    headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${viewport.width}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  if (!accessCookie || !loginBody.data?.user) throw new Error(`LOGIN_SESSION_NOT_AVAILABLE_TO_BROWSER_${viewport.width}`);
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: loginBody.data.user });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${base}/sommelier/find`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("heading", { name: "Find a wine" }).waitFor({ timeout: 30000 });
  for (const label of ["Not sure", "No preference", "Not sure", "Full Body", "🍽 No food", "Dinner tonight"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const next = page.getByRole("button", { name: label === "Dinner tonight" ? "Recommend" : "Continue", exact: true });
    if (label !== "Dinner tonight") {
      await next.click();
      await page.waitForTimeout(300);
    }
  }
  const recommendResponse = page.waitForResponse(
    (response) => response.request().method() === "POST"
      && response.url().includes("/api/ai/sommelier/recommend"),
    { timeout: 120000 },
  );
  await page.getByRole("button", { name: "Recommend", exact: true }).click();
  const recommendHttp = await recommendResponse;
  if (!recommendHttp.ok()) throw new Error(`RECOMMEND_HTTP_${recommendHttp.status()}`);
  await page.getByRole("heading", { name: "Wine recommendations" }).waitFor({ timeout: 120000 });
  const recommendationCards = await page.locator("article").count();

  await page.goto(`${base}/sommelier/identify`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByPlaceholder("Penfolds Bin 28 or barcode").waitFor({ state: "visible", timeout: 30000 });
  const search = page.getByPlaceholder("Penfolds Bin 28 or barcode");
  // Use a catalogue term that is present in the current Odoo-backed demo
  // fixture; generic DEMO labels are not guaranteed to be wine records.
  await search.fill("Shiraz");
  const identifyResponse = page.waitForResponse(
    (response) => response.request().method() === "GET"
      && response.url().includes("/api/ai/sommelier/identify?q=Shiraz"),
    { timeout: 60000 },
  );
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const identifyHttp = await identifyResponse;
  if (!identifyHttp.ok()) throw new Error(`IDENTIFY_HTTP_${identifyHttp.status()}`);
  await page.waitForTimeout(500);
  // The application shell also contains sidebar navigation lists. Scope this
  // assertion to the identify results list instead of relying on DOM order.
  const identifyList = page.locator("ul.mt-5.space-y-2").last();
  const identifyItems = await identifyList.locator("li").count();
  if (!identifyItems) throw new Error(`IDENTIFY_EMPTY_URL_${page.url()}_results=${identifyItems}_all=${await page.locator("ul li").count()}_${(await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 500)}`);
  const firstIdentifyResult = identifyList.locator("li button").first();
  await firstIdentifyResult.scrollIntoViewIfNeeded();
  await firstIdentifyResult.click();
  await page.getByRole("heading", { name: "How to sell" }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "10s", exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Similar but cheaper", exact: true }).click();
  await page.getByText(/cheaper|No cheaper/i).first().waitFor({ timeout: 60000 });

  // Every signed-in store page, including overview, exposes the floating assistant.
  const overviewResponse = await page.goto(`${base}/overview`, { waitUntil: "networkidle", timeout: 60000 });
  const permissionsPolicy = overviewResponse?.headers()["permissions-policy"] ?? "";
  const aiConfigResponse = await context.request.get(`${base}/api/ai/config/client`);
  const aiConfigBody = await aiConfigResponse.json().catch(() => ({}));
  const storeAiEnabled = Boolean(aiConfigBody?.data?.enabled);
  const assistantAvailable = aiConfigBody?.data?.assistantAvailable ?? storeAiEnabled;
  const transcriptionAvailable = aiConfigBody?.data?.transcriptionAvailable ?? storeAiEnabled;
  const fab = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  await fab.waitFor({ state: "visible", timeout: 30000 }).catch(async () => {
    throw new Error(`AI_FAB_MISSING_${viewport.width}_${(await page.locator("body").innerText()).replace(/\\s+/g, " ").slice(0, 600)}`);
  });
  await fab.click();
  const assistant = page.getByRole("dialog", { name: "Orithos AI assistant" });
  await assistant.waitFor({ state: "visible", timeout: 10000 });
  if (await assistant.getAttribute("aria-modal") !== "true") {
    throw new Error(`AI_DIALOG_NOT_MODAL_${viewport.width}`);
  }
  if (await assistant.getAttribute("aria-labelledby") !== "orithos-ai-assistant-title") {
    throw new Error(`AI_DIALOG_UNNAMED_${viewport.width}`);
  }
  if (await assistant.locator('[aria-live="polite"]').count() !== 1) {
    throw new Error(`AI_DIALOG_LIVE_REGION_MISSING_${viewport.width}`);
  }
  const voiceButton = assistant.getByRole("button", { name: /^(Voice input|Hold to speak|Release to stop voice input)$/ });
  if (transcriptionAvailable && !(await voiceButton.isEnabled())) {
    throw new Error(`AI_VOICE_DISABLED_WHILE_TRANSCRIPTION_AVAILABLE_${viewport.width}`);
  }
  if (!transcriptionAvailable && (await voiceButton.isEnabled())) {
    throw new Error(`AI_VOICE_ENABLED_WHILE_TRANSCRIPTION_UNAVAILABLE_${viewport.width}`);
  }
  // Do not open a real microphone during the read-only online UAT. Verify the
  // idle state contract here; keyboard press/release is covered by the local
  // media fixture where getUserMedia is safely mocked.
  const voiceLabel = await voiceButton.getAttribute("aria-label");
  if (/Hold to speak|Release to stop voice input/.test(voiceLabel ?? "") && !permissionsPolicy.includes("microphone=(self)")) {
    throw new Error(`AI_VOICE_MICROPHONE_POLICY_MISSING_${viewport.width}`);
  }
  if (/Hold to speak|Release to stop voice input/.test(voiceLabel ?? "") && await voiceButton.getAttribute("aria-pressed") !== "false") {
    throw new Error(`AI_VOICE_IDLE_STATE_UNNAMED_${viewport.width}`);
  }
  const composer = assistant.getByPlaceholder(/Ask Orithos AI|AI chat is off for this store/);
  await composer.waitFor({ state: "visible", timeout: 10000 });
  const sendButton = assistant.getByRole("button", { name: "Send message", exact: true });
  await sendButton.waitFor({ state: "visible", timeout: 10000 });
  if (await composer.getAttribute("aria-label") !== "Ask Orithos AI") {
    throw new Error(`AI_COMPOSER_UNNAMED_${viewport.width}`);
  }
  if (assistantAvailable && !(await sendButton.isDisabled())) {
    throw new Error(`AI_SEND_ENABLED_WITH_EMPTY_INPUT_${viewport.width}`);
  }
  if (assistantAvailable) {
    await composer.fill("check stock");
    if (await sendButton.isDisabled()) {
      throw new Error(`AI_SEND_DISABLED_WITH_INPUT_${viewport.width}`);
    }
    await composer.fill("");
  }
  if (assistantAvailable && (await composer.isDisabled())) {
    throw new Error(`AI_COMPOSER_DISABLED_WHILE_ASSISTANT_AVAILABLE_${viewport.width}`);
  }
  if (!assistantAvailable && (await composer.isEnabled())) {
    throw new Error(`AI_COMPOSER_ENABLED_WHILE_ASSISTANT_UNAVAILABLE_${viewport.width}`);
  }
  if (!assistantAvailable) {
    await assistant.getByText("AI chat is off for this store. The shortcuts below still open the right page.").waitFor({ timeout: 10000 });
    await assistant.getByText("Shortcuts still work without AI chat").waitFor({ timeout: 10000 });
  }
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press("Tab");
    const trapped = await assistant.evaluate((element) => element.contains(document.activeElement));
    if (!trapped) {
      const focusState = await page.evaluate(() => ({
        active: document.activeElement instanceof HTMLElement
          ? { tag: document.activeElement.tagName, label: document.activeElement.getAttribute("aria-label"), text: document.activeElement.textContent?.trim().slice(0, 80) }
          : null,
        dialogs: [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')]
          .filter((dialog) => dialog.getClientRects().length > 0)
          .map((dialog) => ({ label: dialog.getAttribute("aria-label"), hidden: dialog.getAttribute("aria-hidden"), active: dialog.contains(document.activeElement), focusables: [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0).map((element) => element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 40)) })),
      }));
      throw new Error("AI_FOCUS_ESCAPED_TAB_" + (index + 1) + "_" + viewport.width + "_" + JSON.stringify(focusState));
    }
  }
  await page.keyboard.press("Escape");
  await assistant.waitFor({ state: "hidden", timeout: 10000 });
  const restoredFab = page.getByRole("button", { name: /Open Orithos AI/ }).first();
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Open Orithos AI",
    undefined,
    { timeout: 1500 },
  ).catch(async () => {
    const focusState = await page.evaluate(() => ({
      active: document.activeElement instanceof HTMLElement
        ? { tag: document.activeElement.tagName, label: document.activeElement.getAttribute("aria-label"), text: document.activeElement.textContent?.trim().slice(0, 80) }
        : null,
      launchers: Array.from(document.querySelectorAll('[aria-label="Open Orithos AI"]'))
        .map((element) => ({ focused: element === document.activeElement, visible: Boolean(element.getClientRects().length) })),
      dialogs: Array.from(document.querySelectorAll('[role="dialog"]'))
        .map((dialog) => ({ visible: Boolean(dialog.getClientRects().length), label: dialog.getAttribute("aria-label"), labelledby: dialog.getAttribute("aria-labelledby") })),
    }));
    throw new Error(`AI_FOCUS_NOT_RESTORED_${viewport.width}_${JSON.stringify(focusState)}`);
  });
  const fabRect = await restoredFab.boundingBox();
  const fabSafeBottom = viewport.width > 767 || !fabRect || fabRect.y >= 72;
  if (!fabSafeBottom) {
    throw new Error(`AI_FAB_TOO_CLOSE_TO_BOTTOM_${viewport.width}_${JSON.stringify(fabRect)}`);
  }
  await restoredFab.click();
  await assistant.waitFor({ state: "visible", timeout: 10000 });
  if (assistantAvailable && (await composer.isDisabled())) {
    throw new Error(`AI_COMPOSER_STILL_DISABLED_${viewport.width}`);
  }
  if (!assistantAvailable && (await composer.isEnabled())) {
    throw new Error(`AI_COMPOSER_STILL_ENABLED_${viewport.width}`);
  }
  results.push({ viewport: viewport.width, recommendationCards, identifyItems, assistantAvailable, transcriptionAvailable, sendButton: true, fabSafeBottom, pageErrors });
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } });
  await context.close();
}

try {
  await runViewport({ width: 390, height: 844 });
  await runViewport({ width: 1440, height: 900 });
} catch (error) {
  results.push({ failure: error instanceof Error ? error.message : "Unexpected failure" });
} finally {
  await browser.close();
}

const failures = results.filter((result) => result.failure || result.pageErrors?.length);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: process.env.PILOT_DEPLOYMENT_VERIFIED === "true" && /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  scope: "authenticated read-only AI UI regression; no sales, feedback, or configuration writes",
  checks: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  failures,
  results,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_UI_2026-10-19_AUTHFIX.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, checks: output.checks, passed: output.passed, failed: output.failed, failures }));
if (output.failed) process.exitCode = 1;
