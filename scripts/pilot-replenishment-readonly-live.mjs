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
  runtimeCommit: "5d1dd324dfb2c2584ee5246e6f276f853989fde9",
  scope: "authenticated replenishment exception read; no business writes",
  stores: {},
};

for (const target of targets) {
  const base = `https://${target.host}`;
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
    dataQuality: body.dataQuality,
    supplierLeadTime: body.supplierLeadTime,
    reviewRequiredCount: body.reviewRequiredCount,
    exceptionCount: body.exceptionCount,
    writeRequests: body.writeRequests || [],
  };
}

const output = path.join(root, "docs", "UAT_REPLENISHMENT_LEAD_TIME_BASELINE_2026-11-02.json");
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ output, stores: evidence.stores }));
