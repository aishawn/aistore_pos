import fs from "node:fs";
import path from "node:path";
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
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const cases = [
  { path: "/utilities/mail-log", endpoint: "/api/mail-log", heading: "Mail Log" },
  { path: "/utilities/trashed-items", endpoint: "/api/trashed-items", heading: "Trashed Items" },
  { path: "/promotions", endpoint: "/api/promotions", heading: "Promotions" },
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const writes = [];
context.on("request", (request) => {
  if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(`${request.method()} ${request.url()}`);
});

const login = await context.request.post(`${base}/api/auth/login`, {
  data: { username: "admin", password },
  headers: { Origin: base },
});
const loginBody = await login.json().catch(() => ({}));
if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

const results = [];
for (const testCase of cases) {
  const page = await context.newPage();
  let failNext = true;
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) requests.push(`${request.method()} ${request.url()}`);
  });
  await page.route(`**${testCase.endpoint}**`, async (route) => {
    if (failNext && route.request().method() === "GET") {
      failNext = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Injected read failure" }) });
      return;
    }
    await route.continue();
  });
  await page.goto(`${base}${testCase.path}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("heading", { name: testCase.heading, exact: true }).waitFor({ timeout: 30000 });
  const retry = page.getByRole("button", { name: /^(Retry|Try again)$/ });
  await retry.waitFor({ state: "visible", timeout: 30000 }).catch(async () => {
    throw new Error(`${testCase.path} did not expose Retry; requests=${JSON.stringify(requests)} text=${JSON.stringify((await page.locator("body").innerText()).slice(0, 500))}`);
  });
  await retry.click();
  await retry.waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
  const errorVisible = await page.getByText("Injected read failure", { exact: true }).isVisible().catch(() => false);
  results.push({ path: testCase.path, retryVisible: true, recovered: !errorVisible, passed: !errorVisible });
  await page.close();
}

await browser.close();
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: "unverified-after-webhook",
  deployment: "unverified-after-webhook",
  target: base,
  scope: "read-only injected 503 recovery; no business writes",
  results,
  writes,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  status: results.every((result) => result.passed) && writes.length === 0 ? "PASS" : "FAIL",
};
const outputPath = path.join(root, "docs", "UAT_LEGACY_RETRY_2026-10-18.json");
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, passed: output.passed, failed: output.failed, writes: writes.length, status: output.status }));
if (output.status !== "PASS") process.exitCode = 1;
