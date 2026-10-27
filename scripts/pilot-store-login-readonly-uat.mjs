import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:"));
const env = Object.fromEntries(fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; }));
const stores = [["demo", "https://demo.orithos.com.au", "admin", env.INITIAL_ADMIN_PASSWORD], ["skr", "https://skr.orithos.com.au", "shawn", "au12345678"]];
const evidence = { generatedAt: new Date().toISOString(), runtime: process.env.PILOT_DEPLOYMENT_SHA || null, checks: [] };
const json = async (response) => { const text = await response.text(); try { return JSON.parse(text); } catch { return {}; } };
const cookies = (response) => (response.headers.getSetCookie?.() || []).map((value) => value.split(";")[0]).join("; ");

for (const [name, base, username, password] of stores) {
  let login; let loginBody; let cookie = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ username, password }) });
    loginBody = await json(login); cookie = cookies(login);
    if (login.status === 200 && loginBody.code === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  const token = loginBody?.data?.accessToken;
  const auth = () => ({ Origin: base, Cookie: cookie, Authorization: `Bearer ${token}` });
  const binding = await fetch(`${base}/api/tenant/odoo-binding`, { headers: auth() });
  const bindingBody = await json(binding);
  const session = await fetch(`${base}/api/odoo/session`, { headers: auth() });
  cookie = [cookie, cookies(session)].filter(Boolean).join("; ");
  const products = await fetch(`${base}/api/odoo/records`, { method: "POST", headers: { ...auth(), Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ type: "products", limit: 5 }) });
  const productsBody = await json(products);
  const passed = login.status === 200 && loginBody?.code === 0 && binding.status === 200 && session.status === 200 && products.status === 200;
  evidence.checks.push({ store: name, status: passed ? "PASS" : "FAIL", loginHttp: login.status, sessionHttp: session.status, bindingHttp: binding.status, productsHttp: products.status, companyId: bindingBody.data?.odooCompanyId ?? null, provision: bindingBody.data?.odooProvisionStatus ?? null, productCount: (productsBody.items || []).length });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${name}`, evidence.checks.at(-1));
}
evidence.status = evidence.checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL";
const output = process.env.PILOT_UAT_OUTPUT_PATH ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH) : path.join(root, `docs/UAT_STORE_LOGIN_READONLY_${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ output, status: evidence.status }));
if (evidence.status !== "PASS") process.exitCode = 1;
