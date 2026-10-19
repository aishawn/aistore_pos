/**
 * Gate check for Phase 2/3 AI enablement.
 * - Always verifies price-suggestions route shape when session available.
 * - If AI_ENABLED is still false, records BLOCKED (expected until Dokploy flip).
 * - If true, runs a minimal NLQ + Find smoke (read-only).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(
      fs.readFileSync(envPath, "utf8")
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
        }),
    )
  : {};

const base = process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au";
const checks = [];
const record = (name, status, evidence = "") => checks.push({ name, status, evidence });
const hasPassword = Boolean(env.INITIAL_ADMIN_PASSWORD);
const hasDashScopeKey = Boolean(env.AI_DASHSCOPE_API_KEY);
const localAiEnabled = String(env.AI_ENABLED ?? "false").toLowerCase() === "true";

record("local env AI_ENABLED", localAiEnabled ? "INFO" : "INFO", localAiEnabled ? "true" : "false");
record("local env DashScope key present", hasDashScopeKey ? "PASS" : "BLOCKED", hasDashScopeKey ? "set" : "missing — do not enable production AI");
record("checklist doc", fs.existsSync(path.join(root, "docs", "AI_PRODUCTION_ENABLEMENT.md")) ? "PASS" : "FAIL", "docs/AI_PRODUCTION_ENABLEMENT.md");

const browser = await chromium.launch({ headless: true });
try {
  if (!hasPassword) {
    record("authenticated smoke", "BLOCKED", "INITIAL_ADMIN_PASSWORD missing");
  } else {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const login = await context.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
      headers: { Origin: base },
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok() || loginBody.code !== 0) {
      record("login", "FAIL", `status=${login.status()} code=${loginBody.code}`);
    } else {
      const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
      if (!accessCookie || !loginBody.data?.user) {
        record("login", "FAIL", "session cookie not available to browser context");
      } else {
        await context.addInitScript(({ token, user }) => {
          localStorage.setItem("sf_token", token);
          localStorage.setItem("sf_user", JSON.stringify(user));
        }, { token: accessCookie.value, user: loginBody.data.user });

        const configResponse = await context.request.get(`${base}/api/ai/config/client`);
        const configBody = await configResponse.json().catch(() => ({}));
        const enabled = Boolean(configBody?.data?.enabled);
        record(
          "remote AI enabled flag",
          "INFO",
          `enabled=${enabled} http=${configResponse.status()}`,
        );

        const page = await context.newPage();
        const writes = [];
        page.on("request", (request) => {
          const url = new URL(request.url());
          if (url.pathname.includes("list_price") || (request.method() === "POST" && url.pathname.includes("/api/odoo/products"))) {
            writes.push(`${request.method()} ${url.pathname}`);
          }
        });

        await page.goto(`${base}/stock/price-suggestions`, { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => null);
        const heading = page.getByRole("heading", { name: "Price suggestions", exact: true });
        try {
          await heading.waitFor({ timeout: 30000 });
          record("price suggestions reachable", "PASS", page.url());
          const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
          record(
            "price suggestions read-only copy",
            body.includes("never writes") || body.includes("Suggestions only") || body.includes("you apply")
              ? "PASS"
              : "FAIL",
            body.slice(0, 220),
          );
        } catch {
          record(
            "price suggestions reachable",
            "FAIL",
            `page not on this deployment or auth redirected: ${page.url()}`,
          );
        }

        const assistantAvailable = configBody?.data?.assistantAvailable;
        record(
          "assistantAvailable flag",
          "INFO",
          assistantAvailable === undefined ? "omitted (older backend)" : String(assistantAvailable),
        );

        if (enabled) {
          const assistant = await context.request.post(`${base}/api/ai/assistant`, {
            data: { question: "look up products" },
            headers: { Origin: base },
          });
          const assistantBody = await assistant.json().catch(() => ({}));
          if (assistantBody.code === 0 && assistantBody.data?.threadId) {
            record("enabled NLQ API", "PASS", `intent=${assistantBody.data.intent ?? "n/a"}`);
          } else if (assistantBody.code === 50301) {
            record(
              "enabled NLQ API",
              "FAIL",
              "AI_ENABLED=true but graph assistant unavailable (50301) — check DashScope key and PosAssistantGraphService registration",
            );
          } else {
            const message = String(assistantBody.message || "");
            record("enabled NLQ API", "FAIL", `status=${assistant.status()} code=${assistantBody.code} ${message}`);
            record(
              "assistant provider error is sanitized",
              /invalidparameter|url error|request_id|dashscope/i.test(message) ? "FAIL" : "PASS",
              message || "No provider detail exposed",
            );
          }

          await page.goto(`${base}/overview`, { waitUntil: "networkidle", timeout: 90000 });
          await page.getByRole("button", { name: /Open Orithos AI/ }).first().click();
          const dialog = page.getByRole("dialog", { name: "Orithos AI assistant" });
          await dialog.waitFor({ state: "visible", timeout: 15000 });
          const composer = dialog.getByPlaceholder(/Ask Orithos AI|AI chat is off/);
          await composer.waitFor({ state: "visible", timeout: 15000 });
          const chatShouldWork = assistantAvailable !== false && assistantBody.code === 0;
          if (chatShouldWork && (await composer.isDisabled())) {
            record("enabled chat composer", "FAIL", "composer disabled while assistant API works");
          } else if (!chatShouldWork) {
            record("enabled chat composer", "INFO", `composer disabled=${await composer.isDisabled()} (assistant not ready)`);
          } else {
            record("enabled chat composer", "PASS", "composer ready");
          }
          await page.goto(`${base}/sommelier/find`, { waitUntil: "domcontentloaded", timeout: 60000 });
          await page.getByRole("heading", { name: "Find a wine" }).waitFor({ timeout: 30000 });
          record("find wine with AI on", "PASS", "page loaded");
        } else {
          record("enabled model smoke", "BLOCKED", "remote AI_ENABLED=false — complete AI_PRODUCTION_ENABLEMENT.md before Phase 3");
        }

        record("no product price writes observed", writes.length === 0 ? "PASS" : "FAIL", JSON.stringify(writes));
        await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
      }
    }
    await context.close();
  }
} catch (error) {
  record("run", "FAIL", error instanceof Error ? error.message : "failed");
} finally {
  await browser.close();
}

const hardFails = checks.filter((check) => check.status === "FAIL").length;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  target: base,
  scope: "AI enablement gate + price suggestions surface; production AI flip still requires Dokploy secrets",
  status: hardFails === 0 ? "PASS" : "FAIL",
  checks,
  nextStep: hasDashScopeKey
    ? "Run isolation model UAT with AI_ENABLED=true on a non-production stack, then Dokploy flip per AI_PRODUCTION_ENABLEMENT.md"
    : "Set AI_DASHSCOPE_API_KEY in Dokploy/.env (never commit), then re-run this gate",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_ENABLED_GATE_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, status: output.status, hardFails, nextStep: output.nextStep }));
if (hardFails) process.exitCode = 1;
