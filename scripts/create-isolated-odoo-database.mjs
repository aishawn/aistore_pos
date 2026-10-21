import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file = path.join(root, ".env")) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }));
}

const fileEnv = loadEnv();
const value = (name) => process.env[name]?.trim() || fileEnv[name]?.trim() || "";
const baseUrl = value("ODOO_BASE_URL").replace(/\/+$/, "");
const database = value("ISOLATION_ODOO_DATABASE");
const masterPassword = value("ODOO_MASTER_PASSWORD");
// An explicit UAT account wins; otherwise seed the isolated database with the
// already configured service account. The account is created inside the new DB.
const adminLogin = value("UAT_ODOO_ADMIN_USERNAME") || value("ODOO_SERVICE_USERNAME") || value("ODOO_USER");
const adminPassword = value("UAT_ODOO_ADMIN_PASSWORD") || value("ODOO_SERVICE_PASSWORD") || value("ODOO_PASS");

function fail(message) {
  console.error(`BLOCKED: ${message}`);
  process.exitCode = 1;
}

if (!baseUrl) fail("Set ODOO_BASE_URL.");
if (!database) fail("Set ISOLATION_ODOO_DATABASE.");
if (database === "aipos") fail("Refusing to create or target the production database aipos.");
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]+$/.test(database)) fail("ISOLATION_ODOO_DATABASE contains invalid database name characters.");
if (!masterPassword) fail("Set ODOO_MASTER_PASSWORD to Odoo's database manager admin_passwd.");
if (!adminLogin || !adminPassword) fail("Set UAT_ODOO_ADMIN_USERNAME/UAT_ODOO_ADMIN_PASSWORD or an Odoo service account.");
if (process.exitCode) process.exit();

const selector = await fetch(`${baseUrl}/web/database/selector`, { redirect: "error" });
if (!selector.ok) {
  fail(`Odoo database selector returned HTTP ${selector.status}.`);
  process.exit();
}
const selectorHtml = await selector.text();
const databasePattern = /href=["']\/odoo\?db=([^"']+)["']/g;
const existing = [...selectorHtml.matchAll(databasePattern)].map((match) => match[1]);
if (existing.includes(database)) {
  console.log(`PASS: isolated database ${database} already exists; no create request sent.`);
  process.exit(0);
}

const form = new URLSearchParams({
  master_pwd: masterPassword,
  name: database,
  login: adminLogin,
  password: adminPassword,
  phone: "",
  lang: "en_AU",
  country_code: "au",
});
const response = await fetch(`${baseUrl}/web/database/create`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: form,
  redirect: "manual",
});
if (![200, 302, 303].includes(response.status)) {
  fail(`Odoo database creation returned HTTP ${response.status}.`);
  process.exit();
}

const verify = await fetch(`${baseUrl}/web/database/selector`, { redirect: "error" });
const verifyHtml = await verify.text();
if (!verify.ok || ![...verifyHtml.matchAll(databasePattern)].some((match) => match[1] === database)) {
  fail(`Creation response was accepted, but ${database} was not listed afterward.`);
  process.exit();
}
console.log(`PASS: created and verified isolated Odoo database ${database}.`);
