/**
 * Verifies that AI sub-capabilities are independently reflected in the POS UI.
 * The fixture keeps chat available while cloud transcription is unavailable;
 * opening the assistant must not expose an active microphone or send a request.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PILOT_BASE_URL ?? "http://demo.localhost:3035";
const browser = await chromium.launch({ headless: true });
const results = [];
let transcriptionRequests = 0;
let assistantRequests = 0;
const assistantQuestions = [];
const interceptedWrites = [];

async function runViewport(viewport, assistantAvailable) {
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
    if (url.pathname === "/api/ai/assistant") assistantRequests += 1;
    if (url.pathname.startsWith("/api/") && url.pathname !== "/api/ai/assistant"
      && !["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      interceptedWrites.push(request.method() + " " + url.pathname);
    }
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/ai/assistant") {
      const payload = request.postDataJSON();
      assistantQuestions.push(payload.question);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 0,
          message: "OK",
          data: { threadId: "local-uat", intent: "unknown", intentSummary: "", answer: "Fixture response", slots: {}, ui: null },
        }),
      });
    }
    if (request.method() !== "GET") {
      return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Local UAT blocks API writes", data: null }) });
    }
    const data = url.pathname === "/api/ai/config/client"
      ? {
        enabled: true,
        assistantAvailable,
        transcriptionAvailable: false,
        labelVisionAvailable: true,
        invoiceVisionAvailable: true,
        aiTriggerKeywords: [],
      }
      : [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data }) });
  });

  try {
    await page.goto(`${base}/overview?__uat_capability_gate=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const trigger = page.getByRole("button", { name: /Open Orithos AI/ }).first();
    await trigger.waitFor({ state: "visible", timeout: 30000 });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    for (const label of ["Today's sales", "What should I restock?", "Which prices should I review?", "Recommend a red wine under $30", "Scan this supplier invoice", "Products", "Check stock"]) {
      await dialog.getByRole("button", { name: label, exact: true }).waitFor({ state: "visible", timeout: 10000 });
    }
    const composer = dialog.getByPlaceholder(/Ask Orithos AI|AI chat is off for this store/);
    await composer.waitFor({ state: "visible", timeout: 10000 });
    const chatDisabled = await composer.isDisabled();
    const voice = dialog.getByRole("button", { name: "Voice input" });
    const voiceDisabled = await voice.isDisabled();
    const voiceTitle = await voice.getAttribute("title");
    const workflowQuestions = [
      ["Today's sales", "Today's sales"],
      ["What should I restock?", "What should I restock?"],
      ["Which prices should I review?", "Which prices should I review?"],
      ["Recommend a red wine under $30", "Recommend a red wine under $30"],
      ["Scan this supplier invoice", "Scan this supplier invoice"],
    ];
    if (assistantAvailable) {
      for (const [label, question] of workflowQuestions) {
        const assistantRequest = page.waitForRequest((request) =>
          new URL(request.url()).pathname === "/api/ai/assistant" && request.method() === "POST",
          { timeout: 10000 },
        );
        const assistantResponse = page.waitForResponse((response) =>
          new URL(response.url()).pathname === "/api/ai/assistant" && response.request().method() === "POST",
          { timeout: 10000 },
        );
        await dialog.getByRole("button", { name: label, exact: true }).click();
        const request = await assistantRequest;
        if (request.postDataJSON().question !== question) {
          throw new Error(`QUICK_ACTION_QUESTION_MISMATCH_${label}`);
        }
        await assistantResponse;
      }
    } else {
      await dialog.getByText("AI chat is off for this store. The shortcuts below still open the right page.").waitFor({ timeout: 10000 });
      const routes = [
        ["Today's sales", "/history/odoo"],
        ["What should I restock?", "/stock/replenishment"],
        ["Which prices should I review?", "/stock/capped-pricing"],
        ["Recommend a red wine under $30", "/sommelier"],
        ["Scan this supplier invoice", "/invoices/scan"],
        ["Products", "/products"],
      ];
      for (const [label, route] of routes) {
        await dialog.getByRole("button", { name: label, exact: true }).click();
        await page.waitForURL((url) => url.pathname === route, { timeout: 10000 });
        await page.getByRole("button", { name: /Open Orithos AI/ }).first().click();
        await dialog.waitFor({ state: "visible", timeout: 10000 });
      }
    }
    results.push({
      viewport: viewport.width,
      expectedChatAvailable: assistantAvailable,
      expectedVoiceTitle: assistantAvailable
        ? "Voice transcription is unavailable for this store"
        : "Voice input is disabled for this store",
      chatDisabled,
      voiceDisabled,
      voiceTitle,
      pageErrors,
    });
  } finally {
    await context.close();
  }
}

try {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const height = width < 1280 ? 844 : 900;
    await runViewport({ width, height }, true);
    await runViewport({ width, height }, false);
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) =>
  result.chatDisabled === result.expectedChatAvailable
  || !result.voiceDisabled
  || result.voiceTitle !== result.expectedVoiceTitle
  || result.pageErrors.length > 0,
);
const expectedQuestions = [
  "Today's sales",
  "What should I restock?",
  "Which prices should I review?",
  "Recommend a red wine under $30",
  "Scan this supplier invoice",
];
const expectedQuestionCount = results.filter((result) => result.expectedChatAvailable).length * expectedQuestions.length;
const questionContractPasses = assistantQuestions.length === expectedQuestionCount
  && expectedQuestions.every((question) => assistantQuestions.filter((item) => item === question).length
    === results.filter((result) => result.expectedChatAvailable).length);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  environment: "local-dev-fixtures",
  target: base,
  scope: "AI capability gate UI; chat on/off and voice unavailable at 320/390/768/1024/1440; all API writes intercepted",
  status: failures.length === 0 && transcriptionRequests === 0 && assistantRequests === expectedQuestionCount
    && questionContractPasses && interceptedWrites.length === 0 ? "PASS" : "FAIL",
  checks: results,
  assistantRequests,
  assistantQuestions,
  questionContractPasses,
  transcriptionRequests,
  interceptedWrites,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_CAPABILITY_GATES_LOCAL_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, status: output.status, checks: results, transcriptionRequests, interceptedWrites }));
if (output.status !== "PASS") process.exitCode = 1;
