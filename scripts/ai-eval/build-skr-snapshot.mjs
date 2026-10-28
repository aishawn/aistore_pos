import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const inputPath = option("input");
const outputPath = option("output", "data/ai-eval/skr-snapshot.json");
if (!inputPath) throw new Error("Usage: --input <skr-export.json> [--output <snapshot.json>]");

const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const source = raw.data ?? raw;
const list = (key) => Array.isArray(source[key]) ? source[key] : [];
const stable = (value) => String(value ?? "").trim();
const numberOrNull = (value) => value === null || value === undefined || value === "" ? null : Number(value);

const products = list("products").map((p) => ({
  id: p.id ?? p.odooId ?? p.productId,
  name: stable(p.name ?? p.displayName),
  barcode: stable(p.barcode) || null,
  sku: stable(p.sku ?? p.defaultCode) || null,
  category: stable(p.category ?? p.categoryName) || null,
  brand: stable(p.brand ?? p.brandName) || null,
  price: numberOrNull(p.price ?? p.listPrice),
  gstIncluded: p.gstIncluded ?? null,
  stock: numberOrNull(p.stock ?? p.quantityOnHand),
  stockUpdatedAt: p.stockUpdatedAt ?? p.updatedAt ?? null
})).filter((p) => p.id !== undefined && p.name);

const customers = list("customers").map((c, index) => ({
  id: c.id ?? c.odooId ?? `customer-${index + 1}`,
  label: `CUSTOMER-${String(index + 1).padStart(4, "0")}`,
  group: stable(c.group ?? c.groupName) || null
}));

const snapshot = {
  schemaVersion: 1,
  source: "skr-readonly-export",
  generatedAt: new Date().toISOString(),
  outletId: source.outletId ?? null,
  currency: source.currency ?? "AUD",
  timezone: source.timezone ?? "Australia/Adelaide",
  products,
  customers,
  sales: list("sales").map((s) => ({
    date: s.date,
    outletId: s.outletId ?? source.outletId ?? null,
    revenue: numberOrNull(s.revenue ?? s.total),
    quantity: numberOrNull(s.quantity ?? s.units),
    tickets: numberOrNull(s.tickets ?? s.orders)
  })),
  suppliers: list("suppliers").map((s) => ({ id: s.id ?? s.odooId, name: stable(s.name) }))
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, products: products.length, customers: customers.length, sales: snapshot.sales.length }, null, 2));
