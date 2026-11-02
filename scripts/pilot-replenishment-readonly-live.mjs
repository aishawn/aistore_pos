import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let envDirectory = root;
while (!fs.existsSync(path.join(envDirectory, ".env")) && path.dirname(envDirectory) !== envDirectory) {
  envDirectory = path.dirname(envDirectory);
}
const env = Object.fromEntries(fs.readFileSync(path.join(envDirectory, ".env"), "utf8")
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "")];
  }));

const targets = [
  { host: "demo.orithos.com.au", username: "admin", password: env.INITIAL_ADMIN_PASSWORD },
  { host: "skr.orithos.com.au", username: env.ORITHOS_SKR_USER, password: env.ORITHOS_SKR_PASS },
];

function cookieHeader(response) {
  return (response.headers.getSetCookie?.() || [])
    .map((value) => value.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return {}; }
}

const evidence = {
  generatedAt: new Date().toISOString(),
  scope: "authenticated replenishment exception read; no business writes",
  stores: {},
};

try {
  const version = await fetch("https://demo.orithos.com.au/api/public/version").then((response) => response.json());
  evidence.runtimeCommit = version.frontend?.commit === version.backend?.commit
    ? version.frontend.commit
    : { frontend: version.frontend?.commit ?? null, backend: version.backend?.commit ?? null };
} catch {
  evidence.runtimeCommit = "UNAVAILABLE";
}

for (const target of targets) {
  const base = `https://${target.host}`;
  const versionResponse = await fetch(`${base}/api/public/version`, { headers: { Accept: "application/json" } });
  const version = await readJson(versionResponse);
  let response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ username: target.username, password: target.password }),
  });
  const login = await readJson(response);
  let cookies = cookieHeader(response);
  if (!response.ok || login.code !== 0 || !cookies) {
    evidence.stores[target.host] = { result: "FAIL", step: "login", httpStatus: response.status };
    continue;
  }
  response = await fetch(`${base}/api/odoo/session`, { headers: { Origin: base, Cookie: cookies } });
  cookies = [cookies, cookieHeader(response)].filter(Boolean).join("; ");
  await response.arrayBuffer();
  response = await fetch(`${base}/api/odoo/replenishment?coverageDays=21&mode=exceptions&refresh=true`, {
    headers: { Origin: base, Cookie: cookies },
  });
  const body = await readJson(response);
  evidence.stores[target.host] = {
    result: response.ok ? "PASS" : "FAIL",
    httpStatus: response.status,
    runtimeCommit: version.frontend?.commit ?? version.backend?.commit ?? null,
    dataQuality: body.dataQuality,
      inventoryHistory: body.inventoryHistory,
    supplierLeadTime: body.supplierLeadTime,
    inventoryHistory: body.inventoryHistory,
    reviewRequiredCount: body.reviewRequiredCount,
    exceptionCount: body.exceptionCount,
    writeRequests: body.writeRequests || [],
  };
}

const output = path.join(root, "docs", "UAT_REPLENISHMENT_LEAD_TIME_BASELINE_2026-11-02.json");
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ output, stores: evidence.stores }));
