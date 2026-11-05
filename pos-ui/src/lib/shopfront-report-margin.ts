import { shopfrontSourceMargin } from "./shopfront-source-margin.ts";
import type { AuditRecord } from "./cost-reconciliation.ts";
import type { ReportRpc } from "./report-data.ts";

export type ShopfrontReportMargin = { grossMarginPercent: number; coverage: 1 } | null;

export async function readShopfrontReportMargin(
  rpc: ReportRpc,
  sessionId: string,
  store: string | undefined,
  from: string,
  to: string,
  correlationId?: string | null,
): Promise<ShopfrontReportMargin> {
  if (!store) return null;
  const domain: unknown[] = [["store_key", "=", store], ["created_at", ">=", from], ["created_at", "<", to]];
  const count = await rpc<number>(sessionId, "shopfront.sync.sale", "search_count", [domain], {}, correlationId);
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 10000) return null;
  const rows: AuditRecord[] = [];
  let lastId = 0;
  while (rows.length < count) {
    const page = await rpc<AuditRecord[]>(sessionId, "shopfront.sync.sale", "search_read", [[...domain, ["id", ">", lastId]]], {
      fields: ["id", "external_id", "created_at", "total_price", "total_tax", "total_cost", "raw_payload"],
      order: "id asc", limit: 1000,
    }, correlationId);
    if (!Array.isArray(page) || !page.length) return null;
    for (const row of page) {
      if (!Number.isSafeInteger(row.id) || row.id <= lastId) return null;
      lastId = row.id;
      rows.push(row);
    }
  }
  if (rows.length !== count || await rpc<number>(sessionId, "shopfront.sync.sale", "search_count", [domain], {}, correlationId) !== count) return null;
  const margin = shopfrontSourceMargin(rows, from, to, true);
  return margin.complete && margin.grossMarginPercent !== null
    ? { grossMarginPercent: margin.grossMarginPercent / 100, coverage: 1 }
    : null;
}
