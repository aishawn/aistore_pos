/**
 * Post-deploy verification for multi-store capability plan (read-mostly).
 * Avoids destructive lifecycle writes on the platform-operator (demo) store.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
}

const env = loadEnv();
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
const appBase = (process.env.PILOT_APP_URL || "https://app.orithos.com.au").replace(/\/+$/, "");
const demoBase = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const sha = process.env.PILOT_DEPLOYMENT_SHA || null;

if (!password) {
  console.error("INITIAL_ADMIN_PASSWORD required");
  process.exit(1);
}

const checks = [];
function record(name, status, detail = {}) {
  checks.push({ name, status, ...detail });
  const mark = status === "PASS" ? "PASS" : status;
  console.log(`[${mark}] ${name}${detail.message ? ` — ${detail.message}` : ""}`);
}

async function loginApi(request, base, subdomain = null) {
  const body = { username: "admin", password };
  if (subdomain) body.subdomain = subdomain;
  const res = await request.post(`${base}/api/auth/login`, {
    data: body,
    headers: { Origin: base },
    timeout: 60000,
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const request = context.request;

  try {
    // --- Platform console ---
    const appLogin = await loginApi(request, appBase);
    if (!appLogin.res.ok() || appLogin.json?.code !== 0) {
      record("platform.login", "FAIL", {
        httpStatus: appLogin.res.status(),
        message: appLogin.json?.message || "login failed",
      });
    } else {
      record("platform.login", "PASS", {
        platformOperator: Boolean(appLogin.json?.data?.user?.platformOperator),
      });
      const token = appLogin.json.data.accessToken;
      const auth = { Authorization: `Bearer ${token}`, Origin: appBase };

      const list = await request.get(`${appBase}/api/admin/tenants?page=1&size=20`, { headers: auth });
      const listJson = await list.json().catch(() => null);
      const items = listJson?.data?.items || [];
      record("platform.tenants.list", list.ok() && listJson?.code === 0 ? "PASS" : "FAIL", {
        httpStatus: list.status(),
        count: items.length,
      });

      const demo = items.find((v) => v.subdomain === "demo") || items[0];
      if (!demo) {
        record("platform.tenants.detail", "FAIL", { message: "no tenants returned" });
      } else {
        const detail = await request.get(`${appBase}/api/admin/tenants/${demo.id}`, { headers: auth });
        const detailJson = await detail.json().catch(() => null);
        const data = detailJson?.data;
        const hasOwner = data?.owner && typeof data.owner.username === "string";
        const hasBinding = data?.odooBinding && typeof data.odooBinding.odooProvisionStatus === "string";
        record("platform.tenants.detail", detail.ok() && detailJson?.code === 0 && hasOwner ? "PASS" : "FAIL", {
          httpStatus: detail.status(),
          storeId: demo.id,
          subdomain: demo.subdomain,
          hasOwner,
          hasBinding,
          odooProvisionStatus: data?.odooBinding?.odooProvisionStatus ?? data?.odooProvisionStatus,
          odooCompanyId: data?.odooBinding?.odooCompanyId ?? data?.odooCompanyId,
        });

        // Operator lifecycle must be rejected
        const suspend = await request.fetch(`${appBase}/api/admin/tenants/${demo.id}/status`, {
          method: "PATCH",
          headers: { ...auth, "Content-Type": "application/json" },
          data: { status: "suspended" },
        });
        const suspendJson = await suspend.json().catch(() => null);
        record("platform.operator.lifecycleBlocked", !suspend.ok() || suspendJson?.code !== 0 ? "PASS" : "FAIL", {
          httpStatus: suspend.status(),
          code: suspendJson?.code,
          message: suspendJson?.message,
        });
      }

      // Use API session cookies already on this context (Next sets HttpOnly auth cookies).
      const page = await context.newPage();
      await page.goto(`${appBase}/platform/stores`, { waitUntil: "networkidle", timeout: 60000 });
      await page.getByText(/Create store|Orithos Demo|Platform admin/i).first().waitFor({ timeout: 20000 }).catch(() => {});
      const storesText = await page.locator("body").innerText();
      const hasStoresHeading = /Create store/i.test(storesText) || (/Stores/i.test(storesText) && /Orithos Demo|SUBDOMAIN|All statuses/i.test(storesText));
      record("platform.stores.page", hasStoresHeading && !page.url().includes("/login") ? "PASS" : "FAIL", {
        url: page.url(),
        snippet: storesText.replace(/\s+/g, " ").slice(0, 220),
      });

      if (demo) {
        await page.goto(`${appBase}/platform/stores/${demo.id}`, { waitUntil: "networkidle", timeout: 60000 });
        await page.getByText(/Identity|Owner|Odoo binding|Platform lifecycle/i).first().waitFor({ timeout: 15000 }).catch(() => {});
        const detailText = await page.locator("body").innerText();
        record("platform.stores.detailPage", /Identity|OWNER|Odoo/i.test(detailText) && !page.url().includes("/login") ? "PASS" : "FAIL", {
          url: page.url(),
          snippet: detailText.replace(/\s+/g, " ").slice(0, 220),
        });
        const sellNav = await page.locator('a[href="/"], a[href="/sell"]').count();
        record("platform.noSellChrome", sellNav === 0 ? "PASS" : "FAIL", { sellNav });

        await page.goto(`${appBase}/platform/stores`, { waitUntil: "networkidle", timeout: 60000 });
        const detailHref = await page.locator(`a[href="/platform/stores/${demo.id}"]`).count();
        record("platform.stores.listLink", detailHref > 0 ? "PASS" : "FAIL", { detailHref });
      }
      await page.close();
    }

    // --- Demo store tenant binding + APIs ---
    const demoLogin = await loginApi(request, demoBase);
    if (!demoLogin.res.ok() || demoLogin.json?.code !== 0) {
      record("demo.login", "FAIL", {
        httpStatus: demoLogin.res.status(),
        message: demoLogin.json?.message || "login failed",
      });
    } else {
      record("demo.login", "PASS");
      const token = demoLogin.json.data.accessToken;
      const auth = { Authorization: `Bearer ${token}`, Origin: demoBase };

      const binding = await request.get(`${demoBase}/api/tenant/odoo-binding`, { headers: auth });
      const bindingJson = await binding.json().catch(() => null);
      const b = bindingJson?.data;
      record("demo.odooBinding", binding.ok() && bindingJson?.code === 0 ? "PASS" : "FAIL", {
        httpStatus: binding.status(),
        odooProvisionStatus: b?.odooProvisionStatus,
        companyId: b?.odooCompanyId,
        r2Prefix: b?.r2Prefix,
      });

      // Receive/cash without Odoo session → expect 401
      const receive = await request.post(`${demoBase}/api/odoo/purchase-orders/1/receive`, {
        headers: { ...auth, "Content-Type": "application/json", Origin: demoBase },
        data: { confirm: true, lines: [{ moveId: 1, qtyDone: 1 }] },
      });
      record("demo.receive.noOdooSession", receive.status() === 401 ? "PASS" : "FAIL", {
        httpStatus: receive.status(),
        body: (await receive.text()).slice(0, 160),
      });

      const cash = await request.post(`${demoBase}/api/odoo/session/cash`, {
        headers: { ...auth, "Content-Type": "application/json", Origin: demoBase },
        data: { configId: 1, direction: "in", amount: 1 },
      });
      record("demo.cash.noOdooSession", cash.status() === 401 ? "PASS" : "FAIL", {
        httpStatus: cash.status(),
        body: (await cash.text()).slice(0, 160),
      });

      // Same-origin guard
      const cashX = await request.post(`${demoBase}/api/odoo/session/cash`, {
        headers: { ...auth, "Content-Type": "application/json", Origin: "https://evil.example" },
        data: { configId: 1, direction: "in", amount: 1 },
      });
      record("demo.cash.csrfOrigin", cashX.status() === 403 ? "PASS" : "FAIL", {
        httpStatus: cashX.status(),
      });

      const page = await context.newPage();
      await page.goto(`${demoBase}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.getByPlaceholder("Username").fill("admin");
      await page.getByPlaceholder("Password").fill(password);
      await page.getByRole("button", { name: "Login" }).click();
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 }).catch(() => {});

      await page.goto(`${demoBase}/manage-cash`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
      const cashText = await page.locator("body").innerText();
      record("demo.manageCash.page", /Coming soon/i.test(cashText) ? "FAIL" : /Manage Cash|Cash in|Open session|Connect Odoo|Register/i.test(cashText) ? "PASS" : "FAIL", {
        snippet: cashText.replace(/\s+/g, " ").slice(0, 220),
      });

      await page.goto(`${demoBase}/purchases/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2500);
      const poText = await page.locator("body").innerText();
      record("demo.purchases.page", /Purchases|Connect Odoo|purchase/i.test(poText) ? "PASS" : "FAIL", {
        snippet: poText.replace(/\s+/g, " ").slice(0, 180),
      });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const passed = checks.filter((c) => c.status === "PASS").length;
  const failed = checks.filter((c) => c.status !== "PASS").length;
  const report = {
    generatedAt: new Date().toISOString(),
    sourceCommit: "80a049e",
    deploymentSha: sha,
    appBase,
    demoBase,
    passed,
    failed,
    result: failed === 0 ? "PASS" : "FAIL",
    checks,
  };
  const out = path.join(root, "docs", `UAT_MULTISTORE_DEPLOY_${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${out} result=${report.result} (${passed} pass / ${failed} fail)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
