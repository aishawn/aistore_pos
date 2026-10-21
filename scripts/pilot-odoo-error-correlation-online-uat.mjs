/** Authenticated read-only UAT for Odoo gateway error states on Demo. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }))
  : {};
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const outputPath = path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH ?? "docs/UAT_ODOO_ERROR_CORRELATION_ONLINE_CURRENT.json");
const screenshotDir = path.resolve(root, process.env.PILOT_SCREENSHOT_DIR ?? "docs/screenshots/2026-10-24-odoo-error-correlation-online");
const routes = [
  { path: "/stock/price-suggestions", heading: "Price suggestions", apiPath: "/api/odoo/price-suggestions" },
  { path: "/reports/dashboard", heading: "Reporting dashboard", apiPath: "/api/odoo/reporting-dashboard" },
];
const browser = await chromium.launch({ headless: true });
const checks = [];
const blockedWrites = [];
const record = (name, status, evidence = "") => checks.push({ name, status, evidence });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password, subdomain: "demo" },
    headers: { Origin: base, "X-Orithos-Tenant-Slug": "demo" },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0 || !loginBody.data?.user) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const accessCookie = (await context.cookies(base)).find((cookie) => cookie.name === "orithos_access_token");
  if (accessCookie) await context.addInitScript(({ token, user }) => {
    localStorage.setItem("sf_token", token);
    localStorage.setItem("sf_user", JSON.stringify(user));
  }, { token: accessCookie.value, user: loginBody.data.user });

  await fs.promises.mkdir(screenshotDir, { recursive: true });
  for (const spec of routes) {
    const page = await context.newPage();
    const pageErrors = [];
    const responses = [];
    const outgoingRequestIds = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === spec.apiPath) {
        outgoingRequestIds.push(request.headers()["x-correlation-id"] ?? null);
      }
    });
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === spec.apiPath) responses.push(response);
    });
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ message: "Read-only UAT blocked this request" }) });
      }
      return route.continue();
    });
    await page.goto(`${base}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.getByRole("heading", { name: spec.heading, exact: true }).waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    record(`${spec.path} page loaded`, bodyText.length > 0 && pageErrors.length === 0 ? "PASS" : "FAIL", pageErrors.join(" | "));
    record(`${spec.path} no horizontal overflow`, dimensions.content <= dimensions.viewport ? "PASS" : "FAIL", `${dimensions.content}/${dimensions.viewport}px`);

    const apiResponse = responses.at(-1) ?? null;
    if (!apiResponse) {
      record(`${spec.path} error response observed`, "BLOCKED", "No matching API response was observed in the browser.");
    } else {
      const status = apiResponse.status();
      const correlationId = apiResponse.headers()["x-correlation-id"] ?? null;
      const outgoingRequestId = outgoingRequestIds.at(-1) ?? null;
      const errorVisible = /unavailable|could not load|failed/i.test(bodyText);
      record(`${spec.path} API response`, status < 400 || errorVisible ? "PASS" : status >= 500 ? "BLOCKED" : "FAIL", `HTTP ${status}`);
      if (status < 400) {
        record(`${spec.path} error request ID`, "INFO", "Successful response; no error request ID is expected.");
      } else {
        const visibleId = correlationId ?? outgoingRequestId;
        const validOutgoingId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(outgoingRequestId ?? "");
        record(`${spec.path} sends a UUID correlation ID`, validOutgoingId ? "PASS" : "FAIL", outgoingRequestId ?? "missing");
        record(`${spec.path} request ID shown`, Boolean(visibleId && bodyText.includes(visibleId)) ? "PASS" : correlationId || validOutgoingId ? "FAIL" : "BLOCKED", `${visibleId ?? "no response or outgoing correlation ID"}${correlationId ? " · response header" : " · outgoing fallback"}`);
      }
    }
    await page.screenshot({ path: path.join(screenshotDir, `${spec.path.split("/").at(-1)}-390.png`), fullPage: true });
    await page.close();
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
} finally {
  await browser.close();
}

const hardFailures = checks.filter((check) => check.status === "FAIL").length;
const blocked = checks.filter((check) => check.status === "BLOCKED").length;
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  target: base,
  deploymentShaVerified: false,
  scope: "authenticated 390px browser read-only; non-GET API requests blocked",
  checks,
  blockedWrites,
  status: hardFailures ? "FAIL" : blocked ? "BLOCKED" : "PASS",
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, checks: checks.length, failures: hardFailures, blocked, blockedWrites: blockedWrites.length }));
if (output.status === "FAIL" || blockedWrites.length) process.exitCode = 1;
