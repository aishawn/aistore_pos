/** Authenticated, read-only browser regression for pricing and stock edit pages. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => { const index = line.indexOf("="); return [line.slice(0, index).trim(), line.slice(index + 1).trim()]; }));
const base = (process.env.PILOT_BASE_URL ?? "https://demo.orithos.com.au").replace(/\/+$/, "");
const password = process.env.INITIAL_ADMIN_PASSWORD ?? env.INITIAL_ADMIN_PASSWORD;
if (!password) throw new Error("MISSING_ADMIN_PASSWORD");

const routes = [
  { path: "/stock/list", heading: "Stock List", image: "stock-list" },
  { path: "/stock/capped-pricing", heading: "Capped Pricing", image: "capped-pricing" },
  { path: "/stock/bulk-price-edit", heading: "Bulk Price Edit", image: "bulk-price-edit" },
  { path: "/stock/price-suggestions", heading: "Price suggestions", image: "price-suggestions" },
];
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const outputDir = path.join(root, "docs", "screenshots", "2026-10-19-pricing-reliability-online");
fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
const blockedWrites = [];

try {
  const context = await browser.newContext({ viewport: viewports[0] });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { username: "admin", password, subdomain: process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
    headers: { Origin: base, "X-Orithos-Tenant-Slug": process.env.PILOT_SUBDOMAIN ?? env.PILOT_SUBDOMAIN ?? "demo" },
  });
  const loginBody = await login.json().catch(() => ({}));
  if (!login.ok() || loginBody.code !== 0) throw new Error(`LOGIN_FAILED_${login.status()}`);

  for (const viewport of viewports) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        const url = new URL(request.url());
        blockedWrites.push(`${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ code: 40500, message: "Read-only UAT blocked this request", data: null }) });
      }
      return route.continue();
    });

    for (const route of routes) {
      pageErrors.length = 0;
      const response = await page.goto(`${base}${route.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      const heading = page.getByRole("heading", { name: route.heading, exact: true }).first();
      await heading.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
      const loading = page.getByRole("status", { name: "Loading" }).first();
      await loading.waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
      const loadingComplete = !(await loading.isVisible().catch(() => false));
      const headingVisible = await heading.isVisible().catch(() => false)
        || await page.getByText(route.heading, { exact: true }).first().isVisible().catch(() => false);
      const hasDataTable = ["/stock/list", "/stock/capped-pricing"].includes(route.path);
      let mobileTableScroll = null;
      let tableColumnsDoNotOverlap = null;
      let columnsAlignWithFirstRow = null;
      let headerTextFits = null;
      if (hasDataTable) {
        const header = page.locator(".sticky").first();
        const layout = await header.evaluate((element) => {
          let scroller = element.parentElement;
          while (scroller && scroller !== document.body) {
            const overflowX = getComputedStyle(scroller).overflowX;
            if (overflowX === "auto" || overflowX === "scroll") break;
            scroller = scroller.parentElement;
          }
          const boxes = Array.from(element.children).map((child) => child.getBoundingClientRect());
          const next = element.nextElementSibling;
          const row = next?.classList.contains("flex") && next.classList.contains("border-b")
            ? next
            : null;
          const rowBoxes = row ? Array.from(row.children).slice(0, boxes.length).map((child) => child.getBoundingClientRect()) : [];
          const columnsAlignWithFirstRow = row
            ? boxes.every((box, index) => {
                const rowBox = rowBoxes[index];
                return rowBox && Math.abs(box.left - rowBox.left) <= 1 && Math.abs(box.right - rowBox.right) <= 1;
              })
            : null;
          const headerTextFits = Array.from(element.children).every((child) => {
            const range = document.createRange();
            range.selectNodeContents(child);
            const childBox = child.getBoundingClientRect();
            return Array.from(range.getClientRects()).every((rect) => rect.left >= childBox.left - 1 && rect.right <= childBox.right + 1);
          });
          return {
            mobileTableScroll: scroller ? scroller.scrollWidth > scroller.clientWidth : false,
            columnsDoNotOverlap: boxes.length > 0 && boxes.every((box, index) => index === 0 || boxes[index - 1].right <= box.left + 1),
            columnsAlignWithFirstRow,
            headerTextFits,
          };
        }).catch(() => ({ mobileTableScroll: false, columnsDoNotOverlap: false, columnsAlignWithFirstRow: false, headerTextFits: false }));
        mobileTableScroll = layout.mobileTableScroll;
        tableColumnsDoNotOverlap = layout.columnsDoNotOverlap;
        columnsAlignWithFirstRow = layout.columnsAlignWithFirstRow;
        headerTextFits = layout.headerTextFits;
      }
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      const screenshot = path.join(outputDir, `${route.image}-${viewport.width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => null);
      checks.push({
        route: route.path,
        viewport: viewport.width,
        httpStatus: response?.status() ?? 0,
        headingVisible,
        loadingComplete,
        noHorizontalOverflow: dimensions.width <= dimensions.viewport + 1,
        mobileTableScroll: viewport.width === 390 && hasDataTable ? mobileTableScroll : null,
        tableColumnsDoNotOverlap,
        columnsAlignWithFirstRow,
        headerTextFits,
        pageErrors: [...pageErrors],
        screenshot: path.relative(root, screenshot).replaceAll(path.sep, "/"),
      });
    }
    await page.close();
  }
  await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => null);
  await context.close();
} catch (error) {
  checks.push({ route: "run", viewport: null, status: "FAIL", evidence: error instanceof Error ? error.message : "failed" });
} finally {
  await browser.close();
}

const failures = checks.filter((check) => check.status === "FAIL"
  || (check.httpStatus != null && (check.httpStatus < 200 || check.httpStatus >= 400))
  || check.headingVisible === false
  || check.loadingComplete === false
  || check.noHorizontalOverflow === false
  || check.mobileTableScroll === false
  || check.tableColumnsDoNotOverlap === false
  || check.columnsAlignWithFirstRow === false
  || check.headerTextFits === false
  || (check.pageErrors?.length ?? 0) > 0);
const output = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  target: base,
  deployment: process.env.PILOT_DEPLOYMENT_VERIFIED === "true" && /^[\da-f]{40}$/i.test(process.env.PILOT_DEPLOYMENT_SHA ?? "")
    ? process.env.PILOT_DEPLOYMENT_SHA.toLowerCase()
    : "unverified-after-deploy",
  scope: "authenticated pricing and stock pages; non-GET API calls blocked; no business writes",
  status: failures.length === 0 && blockedWrites.length === 0 ? "PASS" : "FAIL",
  passed: checks.length - failures.length,
  failed: failures.length,
  checks,
  blockedWrites,
};
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_PRICING_PAGES_ONLINE_READONLY_2026-10-19.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: output.status, passed: output.passed, failed: output.failed, blockedWrites: blockedWrites.length }));
if (failures.length > 0 || blockedWrites.length > 0) process.exitCode = 1;
