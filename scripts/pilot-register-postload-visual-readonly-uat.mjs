import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
  }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const expectedRuntimeCommit = process.env.PILOT_EXPECTED_RUNTIME_SHA ?? sourceCommit;
if (!/^[\da-f]{40}$/i.test(expectedRuntimeCommit)) throw new Error("INVALID_EXPECTED_RUNTIME_SHA");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const blockedWrites = [];
const checks = [];
const screenshots = [];
let runtime = {};
try {
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password }, headers: { Origin: base }, timeout: 30000,
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);
  const versionResponse = await context.request.get(`${base}/api/public/version`, { timeout: 20000 });
  runtime = await versionResponse.json().catch(() => ({}));
  if (runtime?.frontend?.commit !== expectedRuntimeCommit || runtime?.backend?.commit !== expectedRuntimeCommit) {
    throw new Error("RUNTIME_SHA_MISMATCH");
  }

  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (["GET", "HEAD", "OPTIONS"].includes(req.method())
      || req.method() === "POST" && url.origin === new URL(base).origin
        && (url.pathname === "/api/auth/refresh" || url.pathname === "/api/odoo/records")) return route.continue();
    blockedWrites.push({ method: req.method(), path: url.pathname });
    return route.fulfill({ status: 405, json: { message: "Read-only visual UAT blocked this request" } });
  });

  for (const width of [390, 1440]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/register`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.getByRole("heading", { name: "Sell", exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Beer", exact: true }).click();
    await page.waitForResponse((response) => {
      const url = new URL(response.url());
      if (url.pathname !== "/api/odoo/records" || response.request().method() !== "POST" || response.status() >= 400) return false;
      try { return response.request().postDataJSON()?.type === "products"; } catch { return false; }
    }, { timeout: 45000 });
    await page.locator('[role="listbox"][aria-label="POS product search results"] [role="option"]').first().waitFor({ timeout: 30000 });
    const imageWaitTimedOut = !await page.waitForFunction(() => [...document.images].filter((img) => {
      const r = img.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    }).every((img) => img.complete), null, { timeout: 15000 }).then(() => true).catch(() => false);

    const state = await page.evaluate(() => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const ai = [...document.querySelectorAll('button[aria-label*="AI"],button[title*="AI"]')].find(visible);
      const aiRect = ai?.getBoundingClientRect();
      const overlaps = [];
      if (aiRect) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent.trim() || node.parentElement?.closest('button,[aria-hidden="true"]')) continue;
          let hidden = false;
          for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
            const style = getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) { hidden = true; break; }
          }
          if (hidden) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width > 0 && rect.height > 0 && rect.right > aiRect.left && rect.left < aiRect.right
              && rect.bottom > aiRect.top && rect.top < aiRect.bottom) {
              overlaps.push({ text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 80), x: Math.round(rect.x), y: Math.round(rect.y) });
              break;
            }
          }
        }
      }
      const bodyText = document.body.innerText;
      return {
        title: document.querySelector("h1")?.innerText || document.querySelector("h2")?.innerText || "",
        bodyTextSample: bodyText.slice(0, 1800),
        productLikeTexts: [...document.querySelectorAll("button,[role=button],a")].filter(visible)
          .map((el) => (el.innerText || "").trim().replace(/\s+/g, " ")).filter((text) => /\$\s?\d/.test(text)).slice(0, 12),
        viewportImages: [...document.images].filter((img) => {
          const r = img.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
        }).map((img) => ({ alt: img.alt, complete: img.complete, loaded: img.naturalWidth > 0, source: new URL(img.src).pathname })),
        aiLauncher: aiRect ? { x: Math.round(aiRect.x), y: Math.round(aiRect.y), right: Math.round(aiRect.right), bottom: Math.round(aiRect.bottom) } : null,
        aiTextOverlaps: overlaps,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    state.imageWaitTimedOut = imageWaitTimedOut;
    const pass = !state.horizontalOverflow && !state.aiTextOverlaps.length && state.productLikeTexts.length > 0
      && !state.imageWaitTimedOut && state.viewportImages.every((img) => img.complete) && !errors.length
        && /Beer/i.test(state.bodyTextSample);
    checks.push({ width, status: pass ? "PASS" : "FAIL", errors, state });
    const screenshotPath = path.join(root, "docs", "screenshots", `register-postload-${expectedRuntimeCommit.slice(0, 8)}-${width}.png`);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshots.push(path.relative(root, screenshotPath).replaceAll(path.sep, "/"));
    await page.close();
  }
} finally {
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base }, timeout: 5000 }).catch(() => null);
  await browser.close();
}

const output = {
  generatedAt: new Date().toISOString(), target: base, sourceCommit, expectedRuntimeCommit,
  sourceTreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
  runtime: {
    frontendCommit: runtime?.frontend?.commit ?? null,
    backendCommit: runtime?.backend?.commit ?? null,
    matchesSourceCommit: runtime?.frontend?.commit === sourceCommit && runtime?.backend?.commit === sourceCommit,
  },
  scope: "Read-only register category/product load and visible-button overlap check at 390px and 1440px; API writes blocked",
  status: checks.every((check) => check.status === "PASS") && blockedWrites.length === 0 ? "PASS" : "FAIL",
  businessWrites: 0, blockedWrites, screenshots, checks,
};
const outputPath = path.join(root, "docs", `UAT_REGISTER_POSTLOAD_VISUAL_READONLY_2026-10-26_RUNTIME-${expectedRuntimeCommit.slice(0, 8).toUpperCase()}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, blockedWrites: blockedWrites.length, checks: checks.map(({ width, status }) => ({ width, status })) }));
if (output.status !== "PASS") process.exitCode = 1;
