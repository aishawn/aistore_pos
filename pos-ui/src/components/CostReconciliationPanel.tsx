"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { costAuditCsv, type CostAudit, type AuditLine } from "@/lib/cost-reconciliation";
import { formatOdooDateTime } from "@/lib/odoo-date";
import { readJsonApiResponse } from "@/lib/json-api-response";
import { useShopfrontSyncRefresh } from "@/hooks/useShopfrontSyncRefresh";

const issueLabels: Record<string, string> = {
  NO_STABLE_SOURCE_ID: "Product source ID missing", NO_PRIOR_RECEIPT: "No receipt before sale",
  RECEIPT_TIME_UNKNOWN: "Receipt time missing", AMBIGUOUS_RECEIPT: "Multiple receipt lines at the same time",
  RECEIPT_SALE_ORDER_UNKNOWN: "Receipt and sale sequence unknown", MISSING_CASE_QUANTITY: "Case quantity missing",
  MISSING_CASE_PRICE: "Case price missing", COST_UNIT_OR_INVOICE_UNVERIFIED: "Case price requires invoice verification",
  PURCHASE_TAX_UNVERIFIED: "Purchase tax requires verification", VALUATION_CHAIN_REQUIRED: "FIFO / average-cost history required",
  HISTORICAL_STANDARD_COST_REQUIRED: "Standard cost at sale time required", REFUND_ORIGINAL_COST_REQUIRED: "Original refund cost required",
  SALE_UNIT_UNVERIFIED: "Sales unit requires verification", ORIGINAL_COST_UNAVAILABLE: "Original cost unavailable",
  SALES_TAX_MISMATCH: "Sales tax does not reconcile", SALES_AMOUNTS_UNAVAILABLE: "Sales amounts unavailable",
  SOURCE_LINE_TAX_MISMATCH: "Line tax differs from the original source sale",
  ZERO_QUANTITY_REQUIRES_REVIEW: "Zero-quantity financial line requires review",
};
const statusLabels = { matched: "Matched", correctable: "Correction supported", review: "Needs review" };
const number = (value: number | null, places = 4) => value === null ? "—" : new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: places }).format(value);
const button = "min-h-11 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]";
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement("a");
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ReceiptDetail({ line, timezone }: { line: AuditLine; timezone: string }) {
  return <div className="rounded-lg border border-[var(--oh-border)] p-3">
    <p className="font-semibold">Sale #{line.orderId} · line #{line.saleLineId} · {formatOdooDateTime(line.soldAt, timezone)}</p>
    <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {[["Receipt / line", line.receiptId ? `${line.receiptId} / ${line.receiptLine}` : "—"], ["Received", line.receivedAt ? formatOdooDateTime(line.receivedAt, timezone) : "—"], ["Supplier", line.supplier || "—"],
        ["Reported case price", number(line.casePrice)], ["Case quantity", line.caseQuantity ?? "—"], ["Verified purchase tax / case", number(line.purchaseTax)],
        ["Price ÷ case quantity (unverified)", number(line.candidateUnitCost)], ["Candidate difference (unverified)", number(line.candidateUnitDifference)], ["Verified receipt unit cost", number(line.verifiedReceiptUnitCost)], ["Verified cost difference", number(line.unitDifference)],
        ["Recorded sales cost", number(line.originalTotalCost, 2)], ["Recorded line cost", number(line.sourceLineCost, 2)], ["Recorded unit cost", number(line.sourceUnitCost)], ["Recorded sales tax", number(line.sourceTax, 2)], ["Supported sales cost", number(line.proposedTotalCost, 2)], ["Quantity", line.quantity]].map(([label, value]) => <div key={String(label)}><dt className="text-[var(--oh-muted)]">{label}</dt><dd className="break-words tabular-nums">{value}</dd></div>)}
    </dl>
    <p className="mt-3 text-[var(--oh-muted)]">{line.issues.map(issue => issueLabels[issue] ?? issue).join(" · ") || "Evidence agrees with the recorded sales cost."}</p>
  </div>;
}

export function CostReconciliationPanel() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<CostAudit | null>(null), [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fromDay, setFromDay] = useState(() => searchParams.get("fromDay") ?? ""), [toDay, setToDay] = useState(() => searchParams.get("toDay") ?? "");
  const [limit, setLimit] = useState("20"), [filter, setFilter] = useState("all"), [query, setQuery] = useState("");
  const [page, setPage] = useState(0), [expanded, setExpanded] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const syncRefreshPending = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("fromDay"), to = params.get("toDay");
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) setFromDay(from);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) setToDay(to);
    void generate({ fromDay: from ?? undefined, toDay: to ?? undefined });
  // URL parameters are read once on entry; generate uses the defaults only for this initial capture.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function generate(dates?: { fromDay?: string; toDay?: string }) {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setBusy(true); setError(null); setExpanded(null); setPage(0);
    try {
      const response = await fetchOdooRoute("/api/odoo/cost-reconciliation", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: Number(limit), ...((dates?.fromDay ?? fromDay) ? { fromDay: dates?.fromDay ?? fromDay } : {}), ...((dates?.toDay ?? toDay) ? { toDay: dates?.toDay ?? toDay } : {}) }), signal: request.signal });
      let body = await readJsonApiResponse<Record<string, unknown>>(response, "Cost audit request");
      if (typeof body.jobId === "string" && body.status === "running") {
        const deadline = Date.now() + 4 * 60_000;
        while (Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (request.signal.aborted) return;
          const statusResponse = await fetchOdooRoute(`/api/odoo/cost-reconciliation?job=${encodeURIComponent(body.jobId)}`, { signal: request.signal, cache: "no-store" });
          const status = await readJsonApiResponse<Record<string, unknown>>(statusResponse, "Cost audit status");
          if (!statusResponse.ok) throw new Error(typeof status.message === "string" ? status.message : "Could not read cost audit status.");
          if (status.status === "failed") throw new Error(typeof status.message === "string" ? status.message : "Could not complete the cost audit.");
          if (status.status === "completed" && status.audit && typeof status.audit === "object") {
            body = status.audit as Record<string, unknown>;
            break;
          }
        }
        if (body.status === "running") throw new Error("Audit is still processing. Retry the status check or choose a shorter date range.");
      }
      if (!response.ok || !body.batchId || !Array.isArray(body.products)) {
        throw new Error(typeof body.message === "string" ? body.message : "Could not generate cost audit.");
      }
      if (!request.signal.aborted) setData(body as CostAudit);
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not generate cost audit."); }
    finally {
      if (!request.signal.aborted) {
        setBusy(false);
        if (syncRefreshPending.current) {
          syncRefreshPending.current = false;
          queueMicrotask(() => void generate());
        }
      }
    }
  }
  useShopfrontSyncRefresh(() => {
    if (busy) syncRefreshPending.current = true;
    else void generate();
  });
  const rows = data?.products.filter(p => (filter === "all" || p.status === filter) && `${p.name} ${p.id}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  return <div className="flex flex-col gap-4 text-sm">
    <p className="leading-6 text-[var(--oh-muted)]">Compare sales with the latest receipt available before each sale. Receipt prices are evidence for review; sales costs retain their original valuation method.</p>
    <form onSubmit={event => { event.preventDefault(); void generate(); }} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">From (optional)<input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} disabled={busy} className="min-h-11 rounded-lg border bg-[var(--oh-surface-elevated)] px-3" /></label>
      <label className="flex flex-col gap-1">To, exclusive (optional)<input type="date" value={toDay} onChange={e => setToDay(e.target.value)} disabled={busy} className="min-h-11 rounded-lg border bg-[var(--oh-surface-elevated)] px-3" /></label>
      <label className="flex flex-col gap-1">Products<select value={limit} disabled={busy} onChange={e => setLimit(e.target.value)} className="min-h-11 rounded-lg border bg-[var(--oh-surface-elevated)] px-3"><option value="20">Top 20 by units sold</option><option value="0">All products sold or refunded</option></select></label>
      <button type="submit" disabled={busy} className={`${button} bg-[var(--oh-primary)] text-white`}>{busy ? "Capturing evidence…" : "Generate audit"}</button>
    </form>
    <p className="text-[var(--oh-muted)]">Blank dates use the last 30 completed business days in the store timezone. Refunds are shown separately from units sold.</p>
    {busy && <p role="status">Reading sales and receipt history. This may take a few minutes.</p>}
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-950"><span>{error}</span><button type="button" disabled={busy} onClick={() => void generate()} className={button}>Retry audit</button></div>}
    {data && <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{[["Matched", data.summary.matched], ["Correction supported", data.summary.correctable], ["Needs review", data.summary.review]].map(([label, count]) => <div key={label} className="rounded-lg border border-[var(--oh-border)] p-3"><p className="text-[var(--oh-muted)]">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{count}</p></div>)}</div>
      <p className="break-words text-[var(--oh-muted)]">{data.store.toUpperCase()} · {data.timezone} · {formatOdooDateTime(data.from, data.timezone)} – {formatOdooDateTime(data.to, data.timezone)} (exclusive)<br />Batch {data.batchId} · {data.summary.lines} sales lines · captured {formatOdooDateTime(data.capturedAt, data.timezone)}</p>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">Search products<input value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} className="min-h-11 rounded-lg border bg-[var(--oh-surface-elevated)] px-3" /></label>
        <label className="flex flex-col gap-1">Status<select value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} className="min-h-11 rounded-lg border bg-[var(--oh-surface-elevated)] px-3"><option value="all">All statuses</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-2"><button className={button} type="button" onClick={() => download(`cost-audit-${data.batchId}.csv`, costAuditCsv(data), "text/csv;charset=utf-8")}>Export all evidence CSV</button><button className={button} type="button" onClick={() => download(`cost-audit-${data.batchId}.json`, JSON.stringify(data, null, 2), "application/json")}>Save audit JSON</button></div>
      {data.sourceMargin && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["Revenue", data.sourceMargin.grossSales], ["GST", data.sourceMargin.tax], ["Cost", data.sourceMargin.salesCost], ["Profit", data.sourceMargin.grossProfit]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-[var(--oh-border)] p-3"><p className="text-[var(--oh-muted)]">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{typeof value === "number" ? number(value) : "—"}</p></div>)}</div>}
      {data.sourceMargin && !data.sourceMargin.complete && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">Shopfront revenue, GST, cost, and profit are incomplete for this range.</p>}
      {data.summary.grossProfit === null && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">Gross profit is awaiting verification. Unresolved costs and tax differences are excluded from any repair proposal.</p>}
      <div className="flex flex-col gap-2">{rows.slice(page * 20, page * 20 + 20).map(p => <section key={p.id} className="rounded-lg border border-[var(--oh-border)]">
        <button type="button" aria-expanded={expanded === p.id} onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">
          <span className="min-w-0 flex-1 font-semibold">{p.name}<span className="mt-1 block font-normal text-[var(--oh-muted)]">{p.sold} sold · {p.returned} returned · current unit cost {number(p.currentUnitCost)} · {p.costMethod}</span></span><span className="rounded-md border px-2 py-1">{statusLabels[p.status]}</span>
        </button>
        {expanded === p.id && <div className="flex flex-col gap-3 border-t border-[var(--oh-border)] p-3"><p>{p.issues.map(i => issueLabels[i] ?? i).join(" · ")}</p>{p.lines.slice(0, 20).map(l => <ReceiptDetail key={l.saleLineId} line={l} timezone={data.timezone} />)}{p.lines.length > 20 && <p className="text-[var(--oh-muted)]">Showing 20 of {p.lines.length} lines. Export CSV for the full evidence.</p>}</div>}
      </section>)}</div>
      {!rows.length && <p role="status" className="p-4">No products match this audit and filter.</p>}
      {rows.length > 20 && <div className="flex items-center justify-between gap-2"><button className={button} type="button" disabled={page === 0} onClick={() => { setPage(p => p - 1); setExpanded(null); }}>Previous</button><span>Page {page + 1} / {Math.ceil(rows.length / 20)}</span><button className={button} type="button" disabled={(page + 1) * 20 >= rows.length} onClick={() => { setPage(p => p + 1); setExpanded(null); }}>Next</button></div>}
      <p className="break-all text-xs text-[var(--oh-muted)]">Evidence SHA-256: {data.sourceHash} · {data.ruleVersion}. Downloaded evidence remains available if server snapshots expire after deployment.</p>
    </>}
  </div>;
}
