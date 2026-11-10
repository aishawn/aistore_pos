"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, Plus, RefreshCw, Search } from "lucide-react";
import { useApiList } from "@/hooks/useApi";

type Order = {
  id: number | string;
  status?: string;
  invoiceNumber?: string;
  reference?: string;
  fromName?: string;
  orderDate?: string;
  totalCost?: number | null;
  lineCount?: number;
};

const statuses = [["OUTSTANDING", "Outstanding"], ["", "All statuses"], ["OPEN", "Open"], ["SENT", "Sent"], ["PARTIALLY_RECEIVED", "Partially received"], ["RECEIVED", "Received"], ["CANCELLED", "Cancelled"]] as const;

function statusClass(status?: string) {
  if (status === "RECEIVED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "CANCELLED") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

export function OrithosPurchaseOrdersPage({ embedded = false }: { embedded?: boolean }) {
  const [status, setStatus] = useState("OUTSTANDING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const result = useApiList<Order>("/api/orders", {
    page,
    size: 40,
    type: "ORDER",
    status,
    invoiceNumber: search.trim() || undefined,
  });
  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-11 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 focus-within:border-[var(--oh-primary)]"><Search size={17} className="text-[var(--oh-muted)]" /><input aria-label="Search Orithos purchase orders" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search order number" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        <select aria-label="Purchase order status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm">{statuses.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}</select>
        <button type="button" onClick={result.reload} disabled={result.loading} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold disabled:opacity-60"><RefreshCw size={16} className={result.loading ? "animate-spin" : ""} /> Refresh</button>
        <Link href="/orders/new" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white"><Plus size={16} /> New purchase order</Link>
      </div>
      {result.error && <div role="alert" className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>{result.error}</span><button type="button" onClick={result.reload} className="font-semibold">Retry</button></div>}
      {!result.loading && !result.error && result.items.length === 0 && <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white p-8 text-center"><div><FileText className="mx-auto text-[var(--oh-primary)]" size={28} /><h2 className="mt-3 text-sm font-semibold">No Orithos purchase orders</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">Create a purchase order to begin receiving stock.</p></div></div>}
      {result.items.length > 0 && <section className="overflow-x-auto rounded-xl border border-[var(--oh-border)] bg-white"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase tracking-wide text-[var(--oh-muted)]"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Lines</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{result.items.map((order) => <tr key={order.id} className="hover:bg-[var(--oh-surface)]"><td className="px-4 py-3"><Link href={`/orders/${order.id}/view`} className="font-semibold text-[var(--oh-primary)] hover:underline">{order.invoiceNumber || `Order ${order.id}`}</Link>{order.reference && <p className="mt-0.5 text-xs text-[var(--oh-muted)]">{order.reference}</p>}</td><td className="px-4 py-3">{order.fromName || "—"}</td><td className="px-4 py-3 tabular-nums">{order.orderDate || "—"}</td><td className="px-4 py-3 tabular-nums">{order.lineCount ?? 0}</td><td className="px-4 py-3 text-right tabular-nums">{order.totalCost == null ? "—" : `$${Number(order.totalCost).toFixed(2)}`}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}>{order.status || "—"}</span></td></tr>)}</tbody></table></section>}
      {result.total > 40 && <nav aria-label="Purchase orders pagination" className="flex items-center justify-between text-sm text-[var(--oh-muted)]"><span>Page {page} · {result.total} orders</span><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1 || result.loading} className="min-h-10 rounded-md border px-3 disabled:opacity-40">Previous</button><button type="button" onClick={() => setPage((value) => value + 1)} disabled={page * 40 >= result.total || result.loading} className="min-h-10 rounded-md border px-3 disabled:opacity-40">Next</button></div></nav>}
    </div>
  );
  if (embedded) return body;
  return <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]"><header className="shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6"><p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock management · Orithos</p><h1 className="oh-type-title mt-1">Purchases</h1><p className="mt-1 text-sm text-[var(--oh-muted)]">Purchase orders, receipts and supplier stock.</p></header>{body}</main>;
}
