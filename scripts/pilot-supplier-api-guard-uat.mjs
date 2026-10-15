import fs from "node:fs";

const env = Object.fromEntries(fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
  const index = line.indexOf("=");
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
}));
if (!env.INITIAL_ADMIN_PASSWORD) throw new Error("MISSING_ADMIN_PASSWORD");

const base = "https://demo.orithos.com.au";
const loginResponse = await fetch(`${base}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify({ username: "admin", password: env.INITIAL_ADMIN_PASSWORD }),
});
const login = await loginResponse.json().catch(() => ({}));
if (!loginResponse.ok || login.code !== 0) throw new Error("Supplier API guard login failed");
const cookies = loginResponse.headers.getSetCookie?.().map((cookie) => cookie.split(";", 1)[0]).join("; ");
if (!cookies) throw new Error("AUTH_COOKIES_NOT_RETURNED");

const crossOrigin = await fetch(`${base}/api/odoo/suppliers`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://attacker.invalid", Cookie: cookies }, body: "{}",
});
const crossBody = await crossOrigin.json().catch(() => ({}));
if (crossOrigin.status !== 403) throw new Error(`Cross-origin supplier write should return 403, received ${crossOrigin.status}`);

const sameOriginWithoutOdoo = await fetch(`${base}/api/odoo/suppliers`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: cookies }, body: "{}",
});
const sameBody = await sameOriginWithoutOdoo.json().catch(() => ({}));
if (sameOriginWithoutOdoo.status !== 401 || !/Odoo session expired/i.test(sameBody.message ?? "")) {
  throw new Error(`Supplier creation without an Odoo session should return 401, received ${sameOriginWithoutOdoo.status}`);
}

await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Origin: base, Cookie: cookies } }).catch(() => {});
console.log(JSON.stringify({ status: "PASS", productionWrites: 0, checks: ["authenticated cross-origin create rejected with 403", "same-origin request without Odoo session rejected with 401 before payload processing"] }));
