import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "")]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const isSkr = new URL(base).hostname === "skr.orithos.com.au";
const username = process.env.PILOT_USERNAME
  ?? (isSkr ? env.ORITHOS_SKR_USER ?? env.SKR_USER ?? "shawn" : "admin");
const password = process.env.PILOT_PASSWORD
  ?? (isSkr
    ? env.ORITHOS_SKR_PASS ?? env.SKR_PASS
    : process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD);
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const routes = [
  "/overview",
  "/settings/users",
  "/purchases/odoo",
  "/stock/replenishment",
  "/sommelier",
  "/sommelier/find",
  "/sommelier/identify",
  "/invoices",
  "/stock/stocktake",
];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const checks = [];
const isTransientNetworkError = (value) => /socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|TLS connection|secure TLS|ERR_CONNECTION_CLOSED|Client network socket disconnected/i.test(String(value));
const safeErrorEvidence = (error) => ({
  errorType: error instanceof Error ? error.name : "UnknownError",
  message: (error instanceof Error ? error.message : "Unexpected failure").split(/\r?\n/, 1)[0].slice(0, 200),
});

try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username, password }, headers: { Origin: base },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie?.value, user: loginBody.data.user });
  const configResponse = await context.request.get(`${base}/api/ai/config/client`);
  const configBody = await configResponse.json().catch(() => ({}));
  if (!configResponse.ok() || configBody.code !== 0 || typeof configBody.data?.enabled !== "boolean") {
    throw new Error(`AI_CONFIG_FAILED_${configResponse.status()}`);
  }
  const aiEnabled = configBody.data.enabled;
  const labelVisionAvailable = configBody.data.labelVisionAvailable ?? aiEnabled;

  for (const pathname of routes) {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
      const response = await page.goto(`${base}${pathname}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const fab = page.getByRole("button", { name: /Open Orithos AI/ }).first();
      const sendMessage = page.getByRole("button", { name: "Send message", exact: true }).first();
      await fab.or(sendMessage).first().waitFor({ state: "visible", timeout: 30000 });
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth }));
      const result = {
        pathname,
        resolvedPathname: new URL(page.url()).pathname,
        httpStatus: response?.status() ?? 0,
        aiFab: await fab.isVisible().catch(() => false),
        aiWorkspaceReady: await sendMessage.isVisible().catch(() => false),
        horizontalOverflow: layout.scrollWidth > layout.width,
        pageErrors,
      };
      if (pathname === "/sommelier/identify") {
        const camera = page.getByRole("button", { name: "Photograph label", exact: true });
        // The identify page renders the camera control before its client capability
        // request resolves. Wait for the loading status to settle before asserting
        // the final enabled/disabled state.
        await page.waitForFunction(
          () => !document.body.innerText.includes("Checking label photo availability…"),
          undefined,
          { timeout: 15000 },
        );
        if (labelVisionAvailable) {
          await camera.waitFor({ state: "visible", timeout: 15000 });
          result.labelPhotoButtonDisabled = await camera.isDisabled();
          result.disabledCopy = false;
        } else {
          await page.getByText(
            aiEnabled
              ? /Label photo recognition is unavailable for this store\./
              : "Label photos need AI turned on. Name and barcode search still work.",
          )
            .waitFor({ state: "visible", timeout: 15000 });
          result.labelPhotoButtonDisabled = await camera.isDisabled();
          result.disabledCopy = true;
        }
        result.aiEnabled = aiEnabled;
        result.labelVisionAvailable = labelVisionAvailable;
      }
      checks.push({ name: pathname, status: result.httpStatus === 200 && (result.aiFab || result.aiWorkspaceReady) && !result.horizontalOverflow && result.pageErrors.length === 0
        && (pathname !== "/sommelier/identify" || (labelVisionAvailable ? !result.labelPhotoButtonDisabled : (result.labelPhotoButtonDisabled && result.disabledCopy))) ? "PASS" : "FAIL", evidence: result });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unexpected failure";
      checks.push({ name: pathname, status: isTransientNetworkError(detail) ? "BLOCKED" : "FAIL", evidence: { ...safeErrorEvidence(error), pageErrors } });
    } finally {
      await page.close();
    }
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
} catch (error) {
  const detail = error instanceof Error ? error.message : "Unexpected failure";
  checks.push({ name: "route matrix setup", status: isTransientNetworkError(detail) ? "BLOCKED" : "FAIL", evidence: safeErrorEvidence(error) });
} finally {
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  deployment: /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "") ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase() : "unverified-after-deploy",
  target: base,
  scope: "authenticated AI entry-point and label-photo capability route matrix; no business writes",
  checks,
  passed: checks.filter((check) => check.status === "PASS").length,
  blocked: checks.filter((check) => check.status === "BLOCKED").length,
  failed: checks.filter((check) => check.status === "FAIL").length,
  status: checks.length > 0 && checks.every((check) => check.status === "PASS")
    ? "PASS"
    : checks.some((check) => check.status === "FAIL") ? "FAIL" : "BLOCKED",
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_ROUTE_MATRIX_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed }));
if (output.status !== "PASS") process.exitCode = 1;
