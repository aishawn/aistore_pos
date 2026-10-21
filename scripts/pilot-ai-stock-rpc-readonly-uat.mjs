import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
const env = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    }))
  : {};
const base = (process.env.PILOT_BASE_URL || "https://demo.orithos.com.au").replace(/\/+$/, "");
const result = {
  generatedAt: new Date().toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  worktreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()),
  deploymentShaVerified: false,
  runtimeCommit: null,
  target: base,
  scope: "read-only AI stock RPC diagnostic; no business writes",
  checks: [],
  writeBusinessData: false,
};
const check = (name, status, evidence) => result.checks.push({ name, status, evidence });
const password = process.env.INITIAL_ADMIN_PASSWORD || env.INITIAL_ADMIN_PASSWORD;
const odooBase = env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
const database = env.ODOO_DATABASE?.trim();
const serviceUsername = env.ODOO_SERVICE_USERNAME?.trim();
const servicePassword = env.ODOO_SERVICE_PASSWORD;

if (!password || !odooBase || !database || !serviceUsername || !servicePassword) {
  check("diagnostic prerequisites", "BLOCKED", "Required local credentials/configuration are missing.");
} else {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const login = await context.request.post(`${base}/api/auth/login`, {
      data: { username: "admin", password },
      headers: { Origin: base },
    });
    const loginBody = await login.json().catch(() => ({}));
    if (!login.ok() || loginBody.code !== 0) throw new Error("DEMO_LOGIN_UNAVAILABLE");
    const page = await context.newPage();
    await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const sessionResponse = await context.request.get(`${base}/api/odoo/session`);
    const sessionBody = await sessionResponse.json().catch(() => ({}));
    const odooUser = sessionBody.data?.user ?? sessionBody.user;
    const companies = Array.isArray(odooUser?.allowedCompanyIds) ? odooUser.allowedCompanyIds : [];
    if (!sessionResponse.ok() || !odooUser || companies.length !== 1) {
      check("store Odoo company scope is available", "BLOCKED", {
        httpStatus: sessionResponse.status(),
        accessibleCompanyCount: companies.length,
      });
    } else {
      let boundWarehouseId = null;
      const bindingResponse = await context.request.get(`${base}/api/tenant/odoo-binding`);
      const bindingPayload = await bindingResponse.json().catch(() => ({}));
      const binding = bindingPayload.data ?? null;
      const sessionCompanyId = Number(companies[0]);
      const rawBoundCompanyId = Number(binding?.odooCompanyId);
      const boundCompanyId = Number.isSafeInteger(rawBoundCompanyId) && rawBoundCompanyId > 0
        ? rawBoundCompanyId : null;
      boundWarehouseId = Number.isSafeInteger(Number(binding?.odooWarehouseId))
        && Number(binding.odooWarehouseId) > 0 ? Number(binding.odooWarehouseId) : null;
      const companyId = boundCompanyId ?? sessionCompanyId;
      const bindingIsReady = bindingResponse.ok() && bindingPayload.code === 0
        && binding?.odooProvisionStatus === "ready";
      check("tenant company binding alignment",
        !bindingIsReady ? "BLOCKED" : boundCompanyId === null ? "INFO"
          : boundCompanyId === sessionCompanyId ? "PASS" : "FAIL", {
          bindingReady: bindingIsReady,
          tenantCompanyConfigured: Boolean(boundCompanyId),
          tenantCompanyMatchesOdooSession: boundCompanyId === null ? null : boundCompanyId === sessionCompanyId,
          companyIdentityOmitted: true,
          detail: boundCompanyId === null
            ? "Binding response did not expose odooCompanyId; using the single Odoo session company as a fallback."
            : undefined,
        });
      check("store warehouse binding state",
        !bindingIsReady ? "BLOCKED" : boundWarehouseId ? "PASS" : "INFO", {
          httpStatus: bindingResponse.status(),
          warehouseConfigured: Boolean(boundWarehouseId),
          bindingStatus: typeof binding?.odooProvisionStatus === "string" ? binding.odooProvisionStatus : "unavailable",
          detail: !boundWarehouseId && bindingIsReady
            ? "No explicit warehouse id; application omits the warehouse context. Direct queries test both company and warehouse contexts."
            : undefined,
        });
      const authResponse = await fetch(`${odooBase}/web/session/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: { db: database, login: serviceUsername, password: servicePassword },
          id: Date.now(),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const authPayload = await authResponse.json().catch(() => ({}));
      const sessionCookie = authResponse.headers.getSetCookie().find((value) => /(?:^|;\s*)session_id=/.test(value));
      const odooSessionId = sessionCookie?.match(/(?:^|;\s*)session_id=([^;]+)/)?.[1];
      if (!authResponse.ok || !authPayload.result?.uid || !odooSessionId) {
        check("AI service account can authenticate to Odoo", "BLOCKED", { httpStatus: authResponse.status });
      } else {
        const contextValue = { allowed_company_ids: [companyId], force_company: companyId, tz: "Australia/Adelaide" };
        const companyResponse = await fetch(`${odooBase}/web/dataset/call_kw`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `session_id=${odooSessionId}` },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "call",
            params: {
              model: "res.company",
              method: "search_read",
              args: [[["id", "=", companyId]]],
              kwargs: { fields: ["id"], limit: 1, order: "id asc", context: contextValue },
            },
            id: Date.now(),
          }),
          signal: AbortSignal.timeout(20000),
        });
        const companyPayload = await companyResponse.json().catch(() => ({}));
        const companiesFound = Array.isArray(companyPayload.result) ? companyPayload.result.length : 0;
        const companyErrorName = String(companyPayload.error?.data?.name ?? companyPayload.error?.name ?? "");
        check("AI service account can read tenant-bound company", companyResponse.ok && !companyPayload.error
          && companiesFound === 1 ? "PASS" : "BLOCKED", {
          httpStatus: companyResponse.status,
          matchingRows: companiesFound,
          rpcErrorType: companyErrorName.split(".").at(-1).replace(/[^A-Za-z0-9_]/g, "").slice(0, 64) || null,
          companyIdentityOmitted: true,
        });
        const catalogueDomain = [
          ["available_in_pos", "=", true], ["company_id", "in", [companyId]],
          "|", "|", ["name", "ilike", "VB Cans"], ["barcode", "ilike", "VB Cans"],
          ["default_code", "ilike", "VB Cans"],
        ];
        const aiDomain = [
          ["active", "=", true], ["available_in_pos", "=", true], "|",
          ["company_id", "=", false], ["company_id", "=", companyId], ["name", "ilike", "VB Cans"],
        ];
        const rpcCases = [
          { name: "minimal product read", domain: [], fields: ["id"], context: {} },
          { name: "company-scoped product read", domain: [["company_id", "in", [companyId]]], fields: ["id"], context: contextValue },
          { name: "store catalogue filter read", domain: catalogueDomain, fields: ["id", "name", "display_name", "qty_available", "free_qty"], context: contextValue },
          { name: "AI product domain without stock fields", domain: aiDomain, fields: ["id", "display_name"], context: contextValue },
          { name: "AI product domain with stock fields", domain: aiDomain, fields: ["id", "display_name", "free_qty", "qty_available"], context: contextValue },
          ...(boundWarehouseId ? [{
            name: "AI product domain with bound warehouse context",
            domain: aiDomain,
            fields: ["id", "display_name", "free_qty", "qty_available"],
            context: { ...contextValue, warehouse: boundWarehouseId },
          }] : []),
        ];
        for (const testCase of rpcCases) {
          const rpcResponse = await fetch(`${odooBase}/web/dataset/call_kw`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: `session_id=${odooSessionId}` },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "call",
              params: {
                model: "product.product",
                method: "search_read",
                args: [testCase.domain],
                kwargs: {
                  fields: testCase.fields,
                  limit: 51,
                  order: "id asc",
                  context: testCase.context,
                },
              },
            id: Date.now(),
          }),
          signal: AbortSignal.timeout(20000),
        });
        const rpcPayload = await rpcResponse.json().catch(() => ({}));
        const items = Array.isArray(rpcPayload.result) ? rpcPayload.result : [];
        const rawErrorName = String(rpcPayload.error?.data?.name ?? rpcPayload.error?.name ?? "");
        const rpcErrorType = rawErrorName.split(".").at(-1).replace(/[^A-Za-z0-9_]/g, "").slice(0, 64) || null;
        const hasRequestedFields = items.length > 0 && testCase.fields.every((field) =>
          field === "id" || Object.hasOwn(items[0], field));
        const stockValuesNumeric = !testCase.fields.some((field) => ["free_qty", "qty_available"].includes(field))
          || items.length > 0 && items.every((item) =>
            typeof item.free_qty === "number" && Number.isFinite(item.free_qty)
              && typeof item.qty_available === "number" && Number.isFinite(item.qty_available));
        check(`Odoo RPC: ${testCase.name}`,
          rpcResponse.ok && !rpcPayload.error && items.length > 0 && hasRequestedFields && stockValuesNumeric ? "PASS"
            : rpcPayload.error || !rpcResponse.ok || items.length === 0 ? "BLOCKED" : "FAIL",
          {
            httpStatus: rpcResponse.status,
            matchingRows: items.length,
            requestedFieldsPresent: hasRequestedFields,
            stockValuesNumeric,
            rpcErrorType,
            rowValuesOmitted: true,
          });
        }
        const warehouseResponse = await fetch(`${odooBase}/web/dataset/call_kw`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `session_id=${odooSessionId}` },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "call",
            params: {
              model: "stock.warehouse",
              method: "search_read",
              args: [[["company_id", "=", companyId]]],
              kwargs: { fields: ["id"], limit: 20, order: "id asc", context: contextValue },
            },
            id: Date.now(),
          }),
          signal: AbortSignal.timeout(20000),
        });
        const warehousePayload = await warehouseResponse.json().catch(() => ({}));
        const warehouses = Array.isArray(warehousePayload.result) ? warehousePayload.result : [];
        if (!warehouseResponse.ok || warehousePayload.error || warehouses.length === 0) {
          const rawErrorName = String(warehousePayload.error?.data?.name ?? warehousePayload.error?.name ?? "");
          check("company warehouses can be read for context comparison", "BLOCKED", {
            httpStatus: warehouseResponse.status,
            warehouseCount: warehouses.length,
            rpcErrorType: rawErrorName.split(".").at(-1).replace(/[^A-Za-z0-9_]/g, "").slice(0, 64) || null,
          });
        } else {
          check("company warehouses can be read for context comparison", "PASS", {
            warehouseCount: warehouses.length,
            warehouseNamesAndIdsOmitted: true,
          });
          for (let index = 0; index < warehouses.length; index++) {
            const warehouseId = Number(warehouses[index]?.id);
            if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0) continue;
            const response = await fetch(`${odooBase}/web/dataset/call_kw`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Cookie: `session_id=${odooSessionId}` },
              body: JSON.stringify({
                jsonrpc: "2.0",
                method: "call",
                params: {
                  model: "product.product",
                  method: "search_read",
                  args: [aiDomain],
                  kwargs: {
                    fields: ["id", "display_name", "free_qty", "qty_available"],
                    limit: 51,
                    order: "id asc",
                    context: { ...contextValue, warehouse: warehouseId },
                  },
                },
                id: Date.now(),
              }),
              signal: AbortSignal.timeout(20000),
            });
            const payload = await response.json().catch(() => ({}));
            const rows = Array.isArray(payload.result) ? payload.result : [];
            const stockValuesNumeric = rows.length > 0 && rows.every((item) =>
              typeof item.free_qty === "number" && Number.isFinite(item.free_qty)
                && typeof item.qty_available === "number" && Number.isFinite(item.qty_available));
            const rawErrorName = String(payload.error?.data?.name ?? payload.error?.name ?? "");
            const errorType = rawErrorName.split(".").at(-1).replace(/[^A-Za-z0-9_]/g, "").slice(0, 64) || null;
            check(`AI stock RPC with company warehouse ${index + 1}`, response.ok && !payload.error && stockValuesNumeric
              ? "PASS" : "BLOCKED", {
              httpStatus: response.status,
              matchingRows: rows.length,
              stockValuesNumeric,
              rpcErrorType: errorType,
              warehouseIdentityOmitted: true,
            });
          }
        }
      }
    }
  } catch (error) {
    check("read-only stock RPC diagnostic", "BLOCKED",
      error instanceof Error ? error.message : "READ_ONLY_DIAGNOSTIC_UNAVAILABLE");
  } finally {
    await context.request.post(`${base}/api/auth/logout`, { headers: { Origin: base } }).catch(() => {});
    await context.close();
    await browser.close();
  }
}

result.passed = result.checks.filter((item) => item.status === "PASS").length;
result.blocked = result.checks.filter((item) => item.status === "BLOCKED").length;
result.failed = result.checks.filter((item) => item.status === "FAIL").length;
result.info = result.checks.filter((item) => item.status === "INFO").length;
result.status = result.failed ? "FAIL" : result.blocked ? "BLOCKED" : "PASS";
const outputPath = process.env.PILOT_UAT_OUTPUT_PATH
  ? path.resolve(root, process.env.PILOT_UAT_OUTPUT_PATH)
  : path.join(root, "docs", "UAT_AI_STOCK_RPC_READONLY_ONLINE.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, status: result.status, passed: result.passed, blocked: result.blocked, failed: result.failed, info: result.info }));
if (result.failed) process.exitCode = 1;
else if (result.blocked) process.exitCode = 2;
