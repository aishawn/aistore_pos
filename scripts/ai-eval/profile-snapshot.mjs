import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const inputPath = process.argv[2] || "data/ai-eval/skr-snapshot.json";
const outputPath = process.argv[3];
const raw = fs.readFileSync(inputPath);
const snapshot = JSON.parse(raw);
const products = Array.isArray(snapshot.products) ? snapshot.products : [];

function countDuplicateGroups(key) {
  const counts = new Map();
  for (const product of products) {
    const value = String(product[key] ?? "").trim().toLowerCase();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

const report = {
  schemaVersion: 1,
  inputPath,
  snapshotSha256: crypto.createHash("sha256").update(raw).digest("hex"),
  source: snapshot.source || "unknown",
  generatedAt: snapshot.generatedAt || null,
  counts: {
    products: products.length,
    customers: Array.isArray(snapshot.customers) ? snapshot.customers.length : 0,
    sales: Array.isArray(snapshot.sales) ? snapshot.sales.length : 0,
    suppliers: Array.isArray(snapshot.suppliers) ? snapshot.suppliers.length : 0,
  },
  completeness: {
    productPrice: products.length > 0 && products.every((product) => product.price !== null && product.price !== undefined),
    productStock: products.length > 0 && products.every((product) => product.stock !== null && product.stock !== undefined),
    sales: Array.isArray(snapshot.sales) && snapshot.sales.length > 0,
    suppliers: Array.isArray(snapshot.suppliers) && snapshot.suppliers.length > 0,
  },
  duplicateNameGroups: countDuplicateGroups("name"),
  duplicateBarcodeGroups: countDuplicateGroups("barcode"),
  duplicateSkuGroups: countDuplicateGroups("sku"),
  evaluationReadiness: {
    productSearch: products.length > 0 ? "READY" : "BLOCKED",
    stockQuestions: products.length > 0 ? "READY" : "BLOCKED",
    salesQuestions: Array.isArray(snapshot.sales) && snapshot.sales.length > 0 ? "READY" : "BLOCKED",
    replenishment: products.length > 0 && snapshot.sales?.length > 0 && snapshot.suppliers?.length > 0 ? "READY" : "BLOCKED",
    pricing: products.length > 0 && snapshot.sales?.length > 0 ? "PARTIAL" : "BLOCKED",
  },
};

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify(report, null, 2));
