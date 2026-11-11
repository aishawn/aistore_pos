// Node 24+. Read-only Orithos native-ledger dashboard audit.
import fs from "node:fs";
import path from "node:path";

for (const file of [".env", "pos-api/.env", "pos-ui/.env.local"]) {
  const envPath = path.resolve(file);
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith("--") || !value || value.startsWith("--")) {
    throw new Error("Use --store demo|skr [--date YYYY-MM-DD]");
  }
  args.set(key.slice(2), value);
}
if ([...args.keys()].some((key) => !["store", "date"].includes(key))) {
  throw new Error("Supported arguments: --store, --date");
}

const store = args.get("store") || "demo";
if (!["demo", "skr"].includes(store)) throw new Error("Store must be demo or skr");
const base = (store === "skr"
  ? process.env.ORITHOS_SKR_HOST || "https://skr.orithos.com.au"
  : process.env.ORITHOS_DEMO_HOST || "https://demo.orithos.com.au").replace(/\/+$/, "");
const username = store === "skr" ? process.env.ORITHOS_SKR_USER : process.env.ORITHOS_DEMO_USER || "admin";
const password = store === "skr" ? process.env.ORITHOS_SKR_PASS : process.env.INITIAL_ADMIN_PASSWORD;
if (!username || !password) throw new Error(`Set the Orithos ${store} login variables in the environment`);

function adelaideDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const date = args.get("date") || adelaideDate();
const parsedDate = new Date(`${date}T12:00:00Z`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
  throw new Error("Date must use YYYY-MM-DD");
}

async function request(path, { cookie, body } = {}) {
  const response = await fetch(new URL(path, `${base}/`), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      Origin: base,
      "X-Orithos-Tenant-Slug": store,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.code !== 0) {
    throw new Error(`Orithos request failed (${response.status})`);
  }
  return { data: payload.data, cookies: response.headers.getSetCookie() };
}

let stage = "login";
try {
  const login = await request("/api/auth/login", { body: { username, password, subdomain: store } });
  const accessCookie = login.cookies.find((value) => value.startsWith("orithos_access_token="))?.split(";", 1)[0];
  if (!accessCookie) throw new Error("Orithos login returned no session cookie");
  stage = "native report";
  const query = new URLSearchParams({ from: date, to: date });
  const { data: result } = await request(`/api/reports/native-overview?${query}`, { cookie: accessCookie });
  if (result?.source !== "orithos_ledger" || result?.from !== date || result?.to !== date) {
    throw new Error("Orithos returned an incomplete or unexpected report scope");
  }
  console.log(JSON.stringify({ store, date, source: result.source, readOnly: true, auditedAt: new Date().toISOString(), result }, null, 2));
} catch (error) {
  const detail = error instanceof Error ? error.message : "unknown error";
  console.error(`Read-only Orithos ${stage} audit failed for ${store}: ${detail}`);
  process.exitCode = 1;
}
