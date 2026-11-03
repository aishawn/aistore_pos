const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const base = process.env.COST_AUDIT_UI_URL || "http://127.0.0.1:3127";
const checks = [], errors = [], unexpectedWrites = [];
const check = (label, value) => { assert.ok(value, label); checks.push(label); };
const out = path.resolve(".local/cost-reconciliation-ui");
const user = { id: 1, name: "Fixture Admin", username: "admin", isAdmin: true, roleCode: "ADMIN", vendorId: 5, outletId: 1 };
const line = { productId: 1, name: "Fixture Water", sourceId: "water", saleLineId: 11, orderId: 21, soldAt: "2026-11-02 01:00:00", quantity: 2, currentUnitCost: 49.68,
  originalTotalCost: 99.36, costMethod: "standard", receiptId: "receipt-1", receiptLine: 1, receivedAt: "2026-10-30T01:00:00Z", supplier: "Fixture Supplier", casePrice: 49.68, caseQuantity: 20,
  candidateUnitCost: 2.484, purchaseTax: null, verifiedReceiptUnitCost: null, proposedTotalCost: 4.96, unitDifference: null, originalNet: 9, gross: 9, recordedTax: 0,
  sourceSaleId: "sale-1", sourceLineId: "line-1", sourceLineCost: 4.96, sourceTax: 0, proposedNet: 9, status: "review", issues: ["PURCHASE_TAX_UNVERIFIED"] };
const audit = { ruleVersion: "receipt-evidence-v1", batchId: "77777777-7777-4777-8777-777777777777", sourceHash: "fixture-hash", companyId: 5, store: "fixture", timezone: "Australia/Adelaide",
  from: "2026-10-03 14:30:00", to: "2026-11-02 13:30:00", capturedAt: "2026-11-03T01:00:00Z", readOnly: true,
  products: [{ id: 1, name: "Fixture Water", sold: 2, returned: 0, currentUnitCost: 49.68, costMethod: "standard", status: "review", issues: line.issues, lines: [line] }],
  summary: { matched: 0, correctable: 0, review: 1, lines: 1, originalCost: 99.36, originalNet: 9, gross: 9, recordedTax: 0, grossProfit: null } };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.COST_AUDIT_BROWSER ? { executablePath: process.env.COST_AUDIT_BROWSER } : {}) });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      await context.addCookies([{ name: "orithos_local_preview", value: "1", url: base }, { name: "orithos_access_token", value: "fixture", url: base }]);
      await context.addInitScript(user => { localStorage.setItem("sf_user", JSON.stringify(user)); }, user);
      let fail = false;
      await context.route("**/api/**", async route => {
        const req = route.request(), pathname = new URL(req.url()).pathname;
        const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (pathname === "/api/auth/me") return json({ code: 0, data: user });
        if (pathname === "/api/odoo/session") return json({ user: { name: "Fixture", allowedCompanyIds: [5] } });
        if (pathname === "/api/odoo/pos-bootstrap") return json({ configs: [] });
        if (pathname === "/api/odoo/cost-reconciliation") return fail ? json({ message: "Fixture evidence unavailable" }, 502) : json(audit);
        if (pathname === "/api/odoo/shopfront-margin") return fail ? json({ message: "Fixture source unavailable" }, 502) : json({ ...audit, sourceMargin: {
          basis: "shopfront_original_sale_cost", aggregation: "original_order_totals", accountingVerified: false, complete: true,
          completedOrders: 133, excludedOrders: 1, invalidOrders: 0, lines: 275, refundLines: 1,
          grossSales: 3577.72, tax: 307.46, netSales: 3270.26, salesCost: 2440.08, grossProfit: 830.18, grossMarginPercent: 25.385749,
          costEvidencePendingLines: 275, lineReconciliationComplete: false, ordersWithLineDifferences: 35,
          lineVsOrderGrossDifference: 0, lineVsOrderTaxDifference: -0.11, lineVsOrderCostDifference: 0.17,
          excludedSourceTotals: { complete: true, grossSales: 2.26, tax: 0.21, salesCost: 2.26 }, issues: [], lineDifferences: [],
        } });
        if (pathname === "/api/odoo/records") return json({ items: [], hasNext: false, total: 0 });
        if (!["GET", "HEAD", "OPTIONS"].includes(req.method())) unexpectedWrites.push(pathname);
        return json({ code: 0, data: [] });
      });
      const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
      await page.goto(`${base}/products`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.getByText("More", { exact: true }).click();
      await page.getByRole("button", { name: "Cost Reconciliation", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Cost Reconciliation", exact: true }); await dialog.waitFor();
      check(`${width}: deep-linked dialog`, page.url().includes("dialog=cost-reconciliation"));
      await dialog.getByRole("button", { name: "Generate audit", exact: true }).click();
      await dialog.getByRole("button", { name: /Fixture Water/ }).waitFor();
      await dialog.getByRole("button", { name: /Fixture Water/ }).click();
      check(`${width}: case division visible`, await dialog.getByText("2.484", { exact: true }).isVisible());
      check(`${width}: unverified tax visible`, await dialog.getByText("Purchase tax requires verification", { exact: true }).count() > 0);
      check(`${width}: gross profit withheld`, await dialog.getByText(/Gross profit is awaiting verification/).isVisible());
      check(`${width}: no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      check(`${width}: modal fits`, await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
      const downloaded = page.waitForEvent("download"); await dialog.getByRole("button", { name: "Export all evidence CSV" }).click();
      const file = await downloaded; await file.saveAs(path.join(out, `fixture-${width}.csv`));
      check(`${width}: exported same batch`, fs.readFileSync(path.join(out, `fixture-${width}.csv`), "utf8").includes(audit.batchId));
      await dialog.getByRole("button", { name: "Show Shopfront source margin", exact: true }).click();
      const sourceSection = dialog.getByRole("region", { name: "Shopfront source gross margin" });
      await sourceSection.waitFor();
      check(`${width}: source margin uses ex-tax denominator`, await sourceSection.getByText("25.39%", { exact: true }).isVisible());
      check(`${width}: source costs remain independently unverified`, await sourceSection.getByText(/Independent cost verification pending: 275/).isVisible());
      check(`${width}: excluded status amounts disclosed`, await sourceSection.getByText(/Excluded source amounts/).isVisible());
      check(`${width}: original line differences disclosed`, await sourceSection.getByText(/35 original source orders differ/).isVisible());
      check(`${width}: source report fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const sourceDownload = page.waitForEvent("download"); await dialog.getByRole("button", { name: "Save source margin evidence", exact: true }).click();
      await (await sourceDownload).saveAs(path.join(out, `source-margin-${width}.json`));
      await page.screenshot({ path: path.join(out, `cost-audit-${width}.png`), fullPage: true });
      fail = true; await dialog.getByRole("button", { name: "Show Shopfront source margin", exact: true }).click(); await dialog.getByRole("alert").waitFor();
      check(`${width}: stale source margin cleared on failure`, await sourceSection.count() === 0);
      fail = true; await dialog.getByRole("button", { name: "Generate audit", exact: true }).click(); await dialog.getByRole("alert").waitFor();
      check(`${width}: old evidence cleared on failure`, await dialog.getByRole("button", { name: /Fixture Water/ }).count() === 0);
      fail = false; await dialog.getByRole("button", { name: "Generate audit", exact: true }).click(); await dialog.getByRole("button", { name: /Fixture Water/ }).waitFor();
      await page.keyboard.press("Escape"); await dialog.waitFor({ state: "detached" });
      check(`${width}: Escape closes dialog`, !page.url().includes("dialog="));
      await context.close();
    }
    check("no browser errors", errors.length === 0); check("no unexpected writes", unexpectedWrites.length === 0);
    const unauthorized = await fetch(`${base}/api/odoo/cost-reconciliation`);
    check("API requires authentication", unauthorized.status === 401);
    const crossOrigin = await fetch(`${base}/api/odoo/cost-reconciliation`, { method: "POST", headers: { Origin: "https://foreign.invalid", Cookie: "orithos_local_preview=1", "Content-Type": "application/json" }, body: "{}" });
    check("cross-origin generation blocked", crossOrigin.status === 403);
    const sourceUnauthorized = await fetch(`${base}/api/odoo/shopfront-margin`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: "{}" });
    check("source API requires authentication", sourceUnauthorized.status === 401);
    const sourceCrossOrigin = await fetch(`${base}/api/odoo/shopfront-margin`, { method: "POST", headers: { Origin: "https://foreign.invalid", Cookie: "orithos_local_preview=1", "Content-Type": "application/json" }, body: "{}" });
    check("cross-origin source capture blocked", sourceCrossOrigin.status === 403);
    fs.writeFileSync(path.join(out, "result.json"), JSON.stringify({ environment: "local fixture", realBusinessWrites: 0, checks, errors }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, realBusinessWrites: 0, output: out }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
