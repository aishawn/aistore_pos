import { DatabaseSync } from "node:sqlite";
import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, backendUrl, isSameOrigin } from "@/lib/server-auth";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = process.env.R2_ARCHIVE_DATA_DIR?.trim() || "/var/lib/orithos/shopfront";
const MAX_RECEIPTS = 16;

type UserResponse = { code?: number; data?: { isAdmin?: boolean } };
type SnapshotMeta = { manifestSha256?: string; databaseIntegrity?: string; files?: Array<{ key?: string; sha256?: string }> };
type RawReceipt = Record<string, unknown>;

function amount(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function isoDate(date: string, time: string): string | null {
  const match = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T${time || "00:00:00"}`;
}

async function requireAdmin(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return false;
  const response = await fetch(`${backendUrl().replace(/\/+$/, "")}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return false;
  const payload = await response.json() as UserResponse;
  return payload.code === 0 && payload.data?.isAdmin === true;
}

function currentDatabase() {
  const snapshotId = fs.readFileSync(path.join(DATA_DIR, "CURRENT"), "utf8").trim();
  if (!/^\d{8}T\d{6}Z$/.test(snapshotId)) throw new Error("R2 snapshot pointer is invalid");
  const root = path.resolve(DATA_DIR, "snapshots", snapshotId);
  const metadataPath = path.join(root, "snapshot.json");
  // The worker strips the configured `shopfront/` prefix when materializing
  // object keys, so shopfront/shopfront.sqlite3 is stored at the snapshot root.
  const databasePath = path.join(root, "shopfront.sqlite3");
  if (!fs.existsSync(metadataPath)) throw new Error("R2 snapshot metadata is missing from the mounted archive");
  if (!fs.existsSync(databasePath)) throw new Error("R2 SQLite database is missing from the mounted archive");
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as SnapshotMeta;
  if (metadata.databaseIntegrity !== "ok" || !/^[a-f0-9]{64}$/i.test(metadata.manifestSha256 ?? "")) {
    throw new Error("R2 snapshot integrity is not verified");
  }
  const databaseSha256 = metadata.files?.find((file) => file.key === "shopfront/shopfront.sqlite3")?.sha256;
  if (!/^[a-f0-9]{64}$/i.test(databaseSha256 ?? "")) throw new Error("R2 database digest is unavailable");
  return { databasePath, manifestSha256: metadata.manifestSha256, databaseSha256 };
}

function latestReceipts(databasePath: string) {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(databasePath, { readOnly: true });
  } catch (error) {
    const file = fs.statSync(databasePath);
    console.error("R2 SQLite open diagnostics", JSON.stringify({
      mode: file.mode & 0o777,
      fileUid: file.uid,
      fileGid: file.gid,
      processUid: process.getuid?.(),
      processGid: process.getgid?.(),
      processGroups: process.getgroups?.(),
      openError: error instanceof Error ? error.message : "unknown error",
    }));
    throw error;
  }
  let stage = "schema query";
  try {
    const schemas = db.prepare("SELECT headers_json FROM records WHERE dataset = 'sales_receipts' GROUP BY headers_json").all() as Array<{ headers_json: string }>;
    const candidates: RawReceipt[] = [];
    for (const schema of schemas) {
      stage = "receipt query";
      const headers = parseJson<string[]>(schema.headers_json, []);
      const index = (name: string) => headers.indexOf(name);
      const fields = ["invoice_number", "status", "base_price", "savings", "discount", "tax", "items_json", "payments_json", "sale_date", "sale_time", "sale_id"];
      const indices = Object.fromEntries(fields.map((name) => [name, index(name)]));
      if (indices.invoice_number < 0 || indices.sale_date < 0 || indices.items_json < 0 || indices.payments_json < 0) continue;
      const expression = (name: string) => indices[name] >= 0 ? `json_extract(values_json, '$[${indices[name]}]')` : "NULL";
      const orderDate = expression("sale_date");
      const orderTime = expression("sale_time");
      const query = db.prepare(`SELECT ${fields.map((name) => `${expression(name)} AS ${name}`).join(", ")}
        FROM records WHERE dataset = 'sales_receipts' AND headers_json = ? AND ${orderDate} IS NOT NULL
        ORDER BY substr(${orderDate}, 7, 4) DESC, substr(${orderDate}, 4, 2) DESC,
          substr(${orderDate}, 1, 2) DESC, ${orderTime} DESC LIMIT ${MAX_RECEIPTS}`);
      candidates.push(...query.all(schema.headers_json) as RawReceipt[]);
    }

    stage = "receipt normalization";
    const unique = new Map<string, RawReceipt>();
    for (const row of candidates) {
      const key = String(row.sale_id || row.invoice_number || "");
      if (key && !unique.has(key)) unique.set(key, row);
    }
    return [...unique.values()]
      .map((row) => {
        const items = parseJson<Array<Record<string, unknown>>>(row.items_json, []).map((item, index) => ({
          id: `${row.sale_id || row.invoice_number}-line-${index + 1}`,
          name: String(item.name ?? "Product"),
          quantity: amount(item.quantity),
          amount: amount(item.amount),
        }));
        const payments = parseJson<Array<Record<string, unknown>>>(row.payments_json, []).map((payment, index) => ({
          id: `${row.sale_id || row.invoice_number}-payment-${index + 1}`,
          method: String(payment.method ?? payment.type ?? "Payment"),
          amount: amount(payment.amount),
          status: String(payment.status ?? ""),
        }));
        const date = String(row.sale_date ?? "");
        const time = String(row.sale_time ?? "");
        return {
          id: String(row.sale_id || row.invoice_number),
          invoiceNumber: String(row.invoice_number ?? ""),
          date,
          time,
          dateTime: isoDate(date, time) ?? "",
          status: String(row.status ?? ""),
          total: amount(row.base_price),
          tax: amount(row.tax),
          savings: amount(row.savings),
          discount: amount(row.discount),
          items,
          payments,
        };
      })
      .filter((receipt) => receipt.invoiceNumber && receipt.dateTime)
      .sort((left, right) => right.dateTime.localeCompare(left.dateTime))
      .slice(0, MAX_RECEIPTS);
  } catch (error) {
    console.error("R2 SQLite query diagnostics", JSON.stringify({
      stage,
      error: error instanceof Error ? error.message : "unknown error",
      code: error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
    }));
    throw error;
  } finally {
    db.close();
  }
}

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ message: "Admin access required" }, { status: 403 });
    const snapshot = currentDatabase();
    const items = latestReceipts(snapshot.databasePath);
    return NextResponse.json({ source: "R2 Shopfront archive · read only", manifestSha256: snapshot.manifestSha256, databaseSha256: snapshot.databaseSha256, items }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("R2 archive sales lookup failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ message: "R2 test archive is unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
