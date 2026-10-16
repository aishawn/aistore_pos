import fs from "fs";
import path from "path";
import { createSecretKey, randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { SignJWT } from "jose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
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
const key = createSecretKey(Buffer.from(env.JWT_SECRET, "utf8"));
const SHAWN = "https://shawn.orithos.com.au";
const DEMO = "https://demo.orithos.com.au";
const password = env.INITIAL_ADMIN_PASSWORD;

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
    return { raw: t.slice(0, 400) };
  }
}

async function fetchRetry(url, init = {}, tries = 5) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
    } catch (e) {
      lastErr = e;
      console.log("fetch retry", i, url.replace("https://", "").split("/")[0], e.cause?.code || e.message);
      await new Promise((r) => setTimeout(r, 3000 * i));
    }
  }
  throw lastErr;
}

let token = null;
let usedIssuer = null;
for (const issuer of ["shopfront", "orithos"]) {
  const candidate = await new SignJWT({
    username: "shawn",
    type: "access",
    admin: true,
    authorities: ["ROLE_ADMIN"],
    outletId: 2,
    vendorId: 2,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("2")
    .setIssuer(issuer)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(key);
  const bind = await fetchRetry(`${SHAWN}/api/tenant/odoo-binding`, {
    headers: {
      Origin: SHAWN,
      Authorization: `Bearer ${candidate}`,
      Cookie: `orithos_access_token=${candidate}`,
    },
  });
  const bj = await readJson(bind);
  console.log("issuer", issuer, "bind", bind.status, bj.code, bj.data?.odooCompanyId ?? bj.message);
  if (bj.code === 0) {
    token = candidate;
    usedIssuer = issuer;
    break;
  }
}
if (!token) {
  console.error("JWT mint rejected — local JWT_SECRET may not match production");
  process.exit(3);
}

let cookies = `orithos_access_token=${token}`;
const sess = await fetch(`${SHAWN}/api/odoo/session`, {
  headers: { Origin: SHAWN, Authorization: `Bearer ${token}`, Cookie: cookies },
  signal: AbortSignal.timeout(30000),
});
cookies = merge(cookies, await jar(sess));
const sj = await readJson(sess);
console.log("session", sess.status, "companies", sj.user?.allowedCompanyIds, "user", sj.user?.username);

const bind = await readJson(
  await fetch(`${SHAWN}/api/tenant/odoo-binding`, {
    headers: { Origin: SHAWN, Authorization: `Bearer ${token}`, Cookie: cookies },
  }),
);
console.log("binding", bind.data);

const pb = await readJson(
  await fetch(`${SHAWN}/api/odoo/pos-bootstrap`, {
    headers: { Origin: SHAWN, Authorization: `Bearer ${token}`, Cookie: cookies },
    signal: AbortSignal.timeout(30000),
  }),
);
console.log(
  "pos-bootstrap",
  (pb.configs || []).map((c) => ({ id: c.id, name: c.name, company: c.company || c.company_id })),
  pb.message || "",
);

const rec = await fetch(`${SHAWN}/api/odoo/records`, {
  method: "POST",
  headers: {
    Origin: SHAWN,
    Authorization: `Bearer ${token}`,
    Cookie: cookies,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "products", limit: 20 }),
  signal: AbortSignal.timeout(30000),
});
const rr = await readJson(rec);
console.log("shawn products", rec.status, "count", (rr.items || []).length, rr.message || "");

const demoLogin = await fetchRetry(`${DEMO}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: DEMO },
  body: JSON.stringify({ username: "admin", password }),
});
let demoCookies = await jar(demoLogin);
const demoToken = (await readJson(demoLogin)).data?.accessToken;
const demoSess = await fetchRetry(`${DEMO}/api/odoo/session`, {
  headers: { Cookie: demoCookies, Origin: DEMO, Authorization: `Bearer ${demoToken}` },
});
demoCookies = merge(demoCookies, await jar(demoSess));
const demoRec = await fetchRetry(`${DEMO}/api/odoo/records`, {
  method: "POST",
  headers: {
    Cookie: demoCookies,
    Origin: DEMO,
    Authorization: `Bearer ${demoToken}`,
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
  issuer: usedIssuer,
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
