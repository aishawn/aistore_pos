"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useDebouncedValue } from "@/hooks/useApi";
import { formatStoreDateTime } from "@/lib/retail-date";
import type { WorkspaceRecords, WorkspaceRecordType } from "@/lib/workspace-records";
import { fetchWorkspaceRecords } from "@/lib/workspace-records-native";

/** Paginated read-only inventory, sales-line and payment views inside workspace dialogs. */
export function WorkspaceRecordsPanel({ type, toolbarStart, embedded = false, fillHeight = embedded, refreshKey = 0 }: { type: WorkspaceRecordType; toolbarStart?: ReactNode; embedded?: boolean; fillHeight?: boolean; refreshKey?: number }) {
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query, 250);
  const [period, setPeriod] = useState("all");
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<WorkspaceRecords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(null); setData(null);
    void (async () => {
      try {
        const payload = await fetchWorkspaceRecords(type, { offset, period, query: search.trim() });
        if (!Array.isArray(payload.items) || !Array.isArray(payload.columns)) throw new Error("Could not load records.");
        if (active) setData(payload);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not load records."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [type, search, period, offset, retry, refreshKey]);
  const pending = loading || query !== search;
  function display(value: unknown, format?: string) {
    if (value === null || value === undefined || value === false) return "—";
    if (Array.isArray(value)) return String(value[1] ?? "—");
    if (format === "date") return formatStoreDateTime(String(value), data?.timezone ?? "UTC", { dateStyle: "medium", timeStyle: "short" });
    if (format === "money") return new Intl.NumberFormat("en-AU", { style: "currency", currency: data?.currency ?? "AUD" }).format(Number(value));
    return typeof value === "number" ? new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(value) : String(value);
  }
  return <div className={`flex min-h-0 flex-col gap-3 text-sm ${fillHeight ? "h-full" : ""}`}>
    {!embedded && (type === "catalogue" || type === "inventory") && <p className="shrink-0 text-[var(--oh-muted)]">{type === "catalogue" ? "All products, including items without stock records." : "Stock by internal location. View all products in Catalogue."}</p>}
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {toolbarStart}
      <input aria-label="Search records" placeholder={type === "catalogue" ? "Product, SKU or barcode" : type === "inventory" ? "Product, SKU, barcode or location" : type === "lines" ? "Receipt, product, SKU or barcode" : "Receipt or payment method"} value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} className="h-11 min-w-[180px] flex-1 rounded-lg border border-[var(--oh-border)] bg-white px-3" />
      {(type === "lines" || type === "payments") && <select aria-label="Records period" value={period} onChange={(event) => { setPeriod(event.target.value); setOffset(0); }} className="h-11 rounded-lg border bg-white px-3">
        <option value="all">All time</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
      </select>}
      {!embedded && <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={pending} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Refresh</button>}
    </div>
    {pending ? <p role="status" className="p-6">Loading records…</p> : error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4">{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="ml-3 min-h-11 underline">Retry</button></div> : data && <>
      <div className={`${fillHeight ? "min-h-0 flex-1" : "max-h-[55dvh]"} overflow-auto rounded-lg border border-[var(--oh-border)]`}>
        <table aria-label={`${type} records`} className="w-full min-w-[700px] text-left">
          <thead className="sticky top-0 bg-[var(--oh-surface)]"><tr>{data.columns.map((column) => <th scope="col" key={column.key} className="px-3 py-3">{column.label}</th>)}</tr></thead>
          <tbody className="divide-y divide-[var(--oh-border)]">{data.items.map((row) => <tr key={row.id}>{data.columns.map((column) => <td key={column.key} className="px-3 py-3 tabular-nums">{display(row[column.key], column.format)}</td>)}</tr>)}</tbody>
        </table>
        {!data.items.length && <p role="status" className="p-8 text-center">No matching records. Try another search or period.</p>}
      </div>
      <nav aria-label="Records pagination" className="flex shrink-0 flex-wrap items-center justify-end gap-3">
        <span>{data.items.length ? `${offset + 1}–${offset + data.items.length}` : "0 records"}</span>
        <button type="button" disabled={!offset} onClick={() => setOffset((value) => Math.max(0, value - 40))} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Previous</button>
        <button type="button" disabled={!data.hasNext} onClick={() => setOffset((value) => value + 40)} className="min-h-11 rounded-lg border px-3 disabled:opacity-50">Next</button>
      </nav>
    </>}
  </div>;
}
