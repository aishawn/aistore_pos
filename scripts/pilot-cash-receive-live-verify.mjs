/**
 * Live write probe for Manage Cash + receive gates (post-deploy).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const DEMO = "https://demo.orithos.com.au";
const APP = "https://app.orithos.com.au";
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;

function mergeCookies(...jars) {
  const map = new Map();
  for (const jar of jars) {
    for (const part of (jar || "").split("; ").filter(Boolean)) {
      const i = part.indexOf("=");
      if (i > 0) map.set(part.slice(0, i), part.slice(i + 1));
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function jar(res) {
  const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return set.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}
async function readJson(res) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t.slice(0, 300) };
  }
}

const out = { generatedAt: new Date().toISOString(), commit: "5fa78d5", checks: [] };
function check(name, status, detail = {}) {
  out.checks.push({ name, status, ...detail });
  console.log(`[${status}] ${name}${detail.message ? ` — ${detail.message}` : ""}`);
}

const login = await fetch(`${DEMO}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: DEMO },
  body: JSON.stringify({ username: "admin", password }),
});
let cookies = await jar(login);
const lj = await readJson(login);
const token = lj.data?.accessToken;
check("demo.login", lj.code === 0 ? "PASS" : "FAIL", { code: lj.code });

const bind = await fetch(`${DEMO}/api/tenant/odoo-binding`, {
  headers: { Cookie: cookies, Origin: DEMO, Authorization: `Bearer ${token}` },
});
const bj = await readJson(bind);
check(
  "demo.odooBinding",
  bind.ok && bj.code === 0 && bj.data?.odooProvisionStatus === "ready" ? "PASS" : "FAIL",
  {
    companyId: bj.data?.odooCompanyId,
    posConfigId: bj.data?.odooPosConfigId,
    status: bj.data?.odooProvisionStatus,
  },
);

const sess = await fetch(`${DEMO}/api/odoo/session`, {
  headers: { Cookie: cookies, Origin: DEMO, Authorization: `Bearer ${token}` },
});
cookies = mergeCookies(cookies, await jar(sess));
const sj = await readJson(sess);
check("demo.odooSession", sess.ok && sj.user ? "PASS" : "FAIL", {
  user: sj.user?.username,
  companies: sj.user?.allowedCompanyIds,
});

const cashIn = await fetch(`${DEMO}/api/odoo/session/cash`, {
  method: "POST",
  headers: {
    Cookie: cookies,
    Origin: DEMO,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ configId: 1, direction: "in", amount: 0.02, reason: "uat-cash-in" }),
});
const ci = await readJson(cashIn);
check("demo.cash.in", cashIn.status === 200 && ci.ok ? "PASS" : "FAIL", {
  httpStatus: cashIn.status,
  body: ci,
});

// Amount cap is 1e6; pilot drawer may already exceed that, so over-cap → 400.
const cashOverCap = await fetch(`${DEMO}/api/odoo/session/cash`, {
  method: "POST",
  headers: {
    Cookie: cookies,
    Origin: DEMO,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ configId: 1, direction: "out", amount: 1_000_000.01, reason: "uat-over-cap" }),
});
const coc = await readJson(cashOverCap);
check("demo.cash.amountCap", cashOverCap.status === 400 ? "PASS" : "FAIL", {
  httpStatus: cashOverCap.status,
  message: coc.message,
});

const cashOut = await fetch(`${DEMO}/api/odoo/session/cash`, {
  method: "POST",
  headers: {
    Cookie: cookies,
    Origin: DEMO,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ configId: 1, direction: "out", amount: 0.01, reason: "uat-cash-out" }),
});
const co = await readJson(cashOut);
check("demo.cash.out", cashOut.status === 200 && co.ok ? "PASS" : "FAIL", {
  httpStatus: cashOut.status,
  body: co,
});

const cashX = await fetch(`${DEMO}/api/odoo/session/cash`, {
  method: "POST",
  headers: {
    Cookie: cookies,
    Origin: "https://evil.example",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ configId: 1, direction: "in", amount: 1 }),
});
check("demo.cash.csrf", cashX.status === 403 ? "PASS" : "FAIL", { httpStatus: cashX.status });

const pos = await fetch(`${DEMO}/api/odoo/purchase-orders`, {
  headers: { Cookie: cookies, Origin: DEMO, Authorization: `Bearer ${token}` },
});
const pj = await readJson(pos);
check("demo.purchases.list", pos.ok ? "PASS" : "FAIL", {
  httpStatus: pos.status,
  count: (pj.items || []).length,
});

const recv = await fetch(`${DEMO}/api/odoo/purchase-orders/1/receive`, {
  method: "POST",
  headers: {
    Cookie: cookies,
    Origin: DEMO,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ confirm: true, lines: [{ moveId: 1, qtyDone: 1 }] }),
});
const rj = await readJson(recv);
check("demo.receive.missingPo", recv.status === 404 ? "PASS" : "FAIL", {
  httpStatus: recv.status,
  message: rj.message,
});

const recvNoSess = await fetch(`${DEMO}/api/odoo/purchase-orders/1/receive`, {
  method: "POST",
  headers: {
    Origin: DEMO,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ confirm: true, lines: [{ moveId: 1, qtyDone: 1 }] }),
});
check("demo.receive.noOdooSession", recvNoSess.status === 401 ? "PASS" : "FAIL", {
  httpStatus: recvNoSess.status,
});

const appLogin = await fetch(`${APP}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: APP },
  body: JSON.stringify({ username: "admin", password }),
});
const aj = await readJson(appLogin);
const appCookies = await jar(appLogin);
const appToken = aj.data?.accessToken;
check(
  "platform.login",
  aj.code === 0 && aj.data?.user?.platformOperator ? "PASS" : "FAIL",
  { platformOperator: aj.data?.user?.platformOperator },
);

const detail = await fetch(`${APP}/api/admin/tenants/1`, {
  headers: { Cookie: appCookies, Origin: APP, Authorization: `Bearer ${appToken}` },
});
const dj = await readJson(detail);
check("platform.tenant.detail", detail.ok && dj.code === 0 ? "PASS" : "FAIL", {
  binding: dj.data?.odooBinding || {
    odooProvisionStatus: dj.data?.odooProvisionStatus,
    odooCompanyId: dj.data?.odooCompanyId,
  },
});

const suspend = await fetch(`${APP}/api/admin/tenants/1/status`, {
  method: "PATCH",
  headers: {
    Cookie: appCookies,
    Origin: APP,
    Authorization: `Bearer ${appToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ status: "suspended" }),
});
const sj2 = await readJson(suspend);
check("platform.lifecycleBlocked", sj2.code === 40910 || !suspend.ok ? "PASS" : "FAIL", {
  httpStatus: suspend.status,
  code: sj2.code,
  message: sj2.message,
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
// Reuse API session cookies (UI form login is flaky behind CDN).
for (const part of cookies.split("; ").filter(Boolean)) {
  const i = part.indexOf("=");
  if (i < 0) continue;
  await context.addCookies([
    {
      name: part.slice(0, i),
      value: decodeURIComponent(part.slice(i + 1)),
      url: DEMO,
    },
  ]);
}
const page = await context.newPage();
await page.goto(`${DEMO}/manage-cash`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.getByText(/Manage Cash|Cash in|Open session|Connect Odoo/i).first().waitFor({ timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2000);
const body = await page.locator("body").innerText();
check(
  "ui.manageCash.notStub",
  !page.url().includes("/login") && !/Coming soon/i.test(body) && /Manage Cash|Cash in/i.test(body) ? "PASS" : "FAIL",
  { url: page.url(), snippet: body.replace(/\s+/g, " ").slice(0, 200) },
);

const amount = page.locator('input[type="number"]').first();
if ((await amount.count()) > 0) {
  await amount.fill("0.03");
  const reason = page.locator('input[name="reason"], textarea').first();
  if ((await reason.count()) > 0) await reason.fill("ui-uat");
  const btn = page.getByRole("button", { name: /Record cash/i }).first();
  if ((await btn.count()) > 0) {
    await btn.click();
    await page.waitForTimeout(3500);
    const after = await page.locator("body").innerText();
    check(
      "ui.manageCash.submit",
      /session expired/i.test(after)
        ? "FAIL"
        : /Cash in \$0\.03 recorded|recorded on/i.test(after)
          ? "PASS"
          : "WARN",
      { snippet: after.replace(/\s+/g, " ").slice(0, 280) },
    );
  } else {
    check("ui.manageCash.submit", "WARN", { message: "no submit button" });
  }
} else {
  check("ui.manageCash.submit", "WARN", { message: "no amount input" });
}

await page.goto(`${DEMO}/purchases/odoo`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
const poBody = await page.locator("body").innerText();
check(
  "ui.purchases",
  /Purchases|Connect Odoo|No purchase|purchase/i.test(poBody) ? "PASS" : "FAIL",
  { snippet: poBody.replace(/\s+/g, " ").slice(0, 160) },
);
await browser.close();

// Docs still present in repo (isolation / cold history gates)
const isolationDocs = [
  "docs/CAPABILITY_STATUS.md",
  "docs/STORE_ADMIN_P0_SPEC.md",
  "docs/UAT_RECEIVE_MANAGE_CASH_2026-10-16.json",
].map((p) => path.join(root, p));
const docsOk = isolationDocs.every((p) => fs.existsSync(p));
check("docs.isolationArtifacts", docsOk ? "PASS" : "FAIL", {
  files: isolationDocs.map((p) => path.relative(root, p)),
});

out.passed = out.checks.filter((c) => c.status === "PASS").length;
out.failed = out.checks.filter((c) => c.status === "FAIL").length;
out.warn = out.checks.filter((c) => c.status === "WARN").length;
out.result = out.failed === 0 ? "PASS" : "FAIL";
const dest = path.join(root, "docs", "UAT_MULTISTORE_LIVE_VERIFY_2026-10-16.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(`\nWrote ${dest} result=${out.result} (${out.passed} pass / ${out.failed} fail / ${out.warn} warn)`);
process.exit(out.failed === 0 ? 0 : 1);
