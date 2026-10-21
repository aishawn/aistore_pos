import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "pos-api", "src", "main", "java", "com", "orithos");
const findings = [];
const inspected = [];
const guard = fs.readFileSync(path.join(root, "pos-api", "src", "main", "java", "com", "orithos", "config", "OdooOnlyModeFilter.java"), "utf8");
const compose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");
const uatCompose = fs.readFileSync(path.join(root, "docker-compose.uat.yml"), "utf8");
const composeGuardEnabled = /APP_ODOO_ONLY_MODE:\s*\$\{ODOO_ONLY_MODE:-true\}/.test(compose);
const uatGuardEnabled = /APP_ODOO_ONLY_MODE:\s*"true"/.test(uatCompose);
if (!composeGuardEnabled || !uatGuardEnabled) findings.push({ file: "docker-compose.yml", reason: "Odoo-only guard is not enabled by default in both production and UAT Compose" });

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.isFile() && entry.name.endsWith("Controller.java")) inspect(file);
  }
}

function inspect(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!/@RequestMapping\("\/api\//.test(text)) return;
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  const mapping = text.match(/@RequestMapping\("(\/api\/[^"\r\n]+)"\)/)?.[1] || null;
  const endpoints = [...text.matchAll(/@(Get|Post|Put|Patch|Delete)Mapping\b/g)].length;
  const hasTenantGuard = /CurrentUser|TenantContext|TenantHolder|platformAccess|@PreAuthorize/.test(text);
  const directUnscopedReads = /mapper\.findAll\(\)|mapper\.findById\(/.test(text) && !/CurrentUser|TenantContext|TenantHolder|platformAccess/.test(text);
  const retiredByOdooOnlyGuard = Boolean(mapping && guard.includes(`"${mapping}"`));
  inspected.push({ file: relative, mapping, endpoints, hasTenantGuard, directUnscopedReads, retiredByOdooOnlyGuard });
  if (directUnscopedReads && !retiredByOdooOnlyGuard) findings.push({ file: relative, mapping, reason: "direct mapper read without a visible tenant guard or Odoo-only retirement guard" });
}

walk(sourceRoot);
const report = {
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.SOURCE_COMMIT || null,
  scope: "Static audit of Spring API controllers; no network or business writes",
  status: findings.length ? "BLOCKED" : "PASS",
  inspectedControllers: inspected.length,
  composeGuardEnabled,
  uatGuardEnabled,
  findings,
  note: "Classic MySQL APIs must be tenant-scoped or retired by OdooOnlyModeFilter. This static report does not prove runtime isolation; the filter must be enabled in the deployed environment.",
};
const output = process.env.TENANT_SCOPE_EVIDENCE_FILE || path.join(root, "docs", `UAT_TENANT_SCOPE_AUDIT_${Date.now()}.json`);
fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(`${report.status}: inspected ${report.inspectedControllers} controllers; ${findings.length} findings.`);
if (findings.length) process.exitCode = 1;
