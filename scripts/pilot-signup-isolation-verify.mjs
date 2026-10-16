/**
 * Verify shawn store isolation vs demo after signup/provision fixes.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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

const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
const APP = "https://app.orithos.com.au";
const SHAWN = "https://shawn.orithos.com.au";
const DEMO = "https://demo.orithos.com.au";

async function jar(res) {
  const set = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  return set.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}
function merge(...jars) {
  const m = new Map();
  for (const j of jars) {
    for (const p of (j || "").split("; ").filter(Boolean)) {
      const i = p.indexOf("=");
      if (i > 0) m.set(p.slice(0, i), p.slice(i + 1));
    }
  }
  return [...m].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function readJson(res) {
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return { raw: t.slice(0, 500) };
  }
}

async function login(base, username = "admin", pw = password) {
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ username, password: pw }),
  });
  const j = await readJson(r);
  return { cookies: await jar(r), token: j.data?.accessToken, j, status: r.status };
}

let bootstrapToken = null;
for (let attempt = 1; attempt <= 18; attempt++) {
  try {
    const app = await login(APP);
    if (app.j.code !== 0) {
      console.log(new Date().toISOString(), "attempt", attempt, "app login failed", app.j.message);
      await new Promise((r) => setTimeout(r, 15000));
      continue;
    }
    const detail = await readJson(
      await fetch(`${APP}/api/admin/tenants/2`, {
        headers: { Cookie: app.cookies, Origin: APP, Authorization: `Bearer ${app.token}` },
      }),
    );
    console.log(
      new Date().toISOString(),
      "attempt",
      attempt,
      "binding",
      detail.data?.odooBinding?.odooProvisionStatus,
      "company",
      detail.data?.odooBinding?.odooCompanyId,
    );

    const bootApi = await fetch(`${APP}/api/admin/tenants/2/owner/bootstrap`, {
      method: "POST",
      headers: { Cookie: app.cookies, Origin: APP, Authorization: `Bearer ${app.token}` },
    });
    const bj0 = await readJson(bootApi);
    console.log("bootstrap-api", bootApi.status, bj0.code, bj0.message || "", bj0.data?.bootstrapToken ? "HAS_TOKEN" : "");
    if (bj0.code === 0 && bj0.data?.bootstrapToken) {
      bootstrapToken = bj0.data.bootstrapToken;
      break;
    }
    // fallback: reinvite once deploy of markPendingPasswordReset lands
    const reinvite = await fetch(`${APP}/api/admin/tenants/2/owner/reinvite`, {
      method: "POST",
      headers: { Cookie: app.cookies, Origin: APP, Authorization: `Bearer ${app.token}` },
    });
    const rj = await readJson(reinvite);
    console.log("reinvite", reinvite.status, rj.code, rj.message || "", rj.data?.bootstrapToken ? "HAS_TOKEN" : "");
    if (rj.code === 0 && rj.data?.bootstrapToken) {
      bootstrapToken = rj.data.bootstrapToken;
      break;
    }
  } catch (e) {
    console.log("err", e.message);
  }
  await new Promise((r) => setTimeout(r, 20000));
}

if (!bootstrapToken) {
  console.error("TIMEOUT waiting for owner bootstrap API deploy");
  process.exit(3);
}

const boot = await fetch(`${SHAWN}/api/auth/bootstrap`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: SHAWN },
  body: JSON.stringify({ token: bootstrapToken }),
});
let cookies = await jar(boot);
const bj = await readJson(boot);
console.log("store bootstrap", boot.status, bj.code, bj.data?.user?.username);
if (bj.code !== 0) process.exit(2);

const access = bj.data?.accessToken;
let auth = { Cookie: cookies, Origin: SHAWN, Authorization: access ? `Bearer ${access}` : undefined };
const bind = await readJson(await fetch(`${SHAWN}/api/tenant/odoo-binding`, { headers: auth }));
console.log("binding", bind.data);

const sess = await fetch(`${SHAWN}/api/odoo/session`, { headers: auth });
cookies = merge(cookies, await jar(sess));
auth = { ...auth, Cookie: cookies };
const sj = await readJson(sess);
console.log("session companies", sj.user?.allowedCompanyIds);

const pb = await readJson(await fetch(`${SHAWN}/api/odoo/pos-bootstrap`, { headers: auth }));
console.log(
  "pos-bootstrap",
  (pb.configs || []).map((c) => ({ id: c.id, name: c.name, company: c.company || c.company_id })),
);

const rec = await fetch(`${SHAWN}/api/odoo/records`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "products", limit: 20 }),
});
const rr = await readJson(rec);
console.log("shawn products", rec.status, "count", (rr.items || []).length, rr.message || "");

const demo = await login(DEMO);
let demoCookies = demo.cookies;
const demoSess = await fetch(`${DEMO}/api/odoo/session`, {
  headers: { Cookie: demoCookies, Origin: DEMO, Authorization: `Bearer ${demo.token}` },
});
demoCookies = merge(demoCookies, await jar(demoSess));
const demoRec = await fetch(`${DEMO}/api/odoo/records`, {
  method: "POST",
  headers: {
    Cookie: demoCookies,
    Origin: DEMO,
    Authorization: `Bearer ${demo.token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "products", limit: 5 }),
});
const dr = await readJson(demoRec);
console.log("demo products", demoRec.status, "count", (dr.items || []).length);

const companies = sj.user?.allowedCompanyIds || [];
const pass =
  bind.data?.odooCompanyId === 2 &&
  (rr.items || []).length === 0 &&
  (dr.items || []).length > 0 &&
  companies.includes(2) &&
  !companies.includes(1);

const report = {
  generatedAt: new Date().toISOString(),
  result: pass ? "PASS" : "FAIL",
  shawn: {
    binding: bind.data,
    companies,
    productCount: (rr.items || []).length,
    productMessage: rr.message || null,
    configs: (pb.configs || []).map((c) => ({ id: c.id, name: c.name })),
  },
  demo: { productCount: (dr.items || []).length },
};
fs.writeFileSync(path.join(root, "docs", "UAT_SIGNUP_ISOLATION_LIVE_2026-10-16.json"), JSON.stringify(report, null, 2));
console.log("ISOLATION", pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 2);
