"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { fetchOdooRoute } from "@/lib/odoo-api";
import { formatOdooDateTime } from "@/lib/odoo-date";

type Kind = "sales-orders" | "sales-lines" | "purchases";
type SourceRow = { id: number; order?: string; name?: string; date: string; customer?: string; cashier?: string; product?: string; quantity?: number; supplier?: string; state?: string; amount: number };
type SourcePage = { total: number; totalAmount: number; offset: number; hasNext: boolean; rows: SourceRow[] };

export function ReportSourceDetails({ kind, title, from, to, group, detailKey, expectedAmount, currency, timezone, onClose }: {
  kind: Kind;
  title: string;
  from: string;
  to: string;
  group: string;
  detailKey: string;
  expectedAmount: number;
  currency: string;
  timezone: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const endpoint = kind === "purchases" ? "/api/odoo/purchase-report" : "/api/odoo/sales-report";
  const money = new Intl.NumberFormat("en-AU", { style: "currency", currency });

  const load = useCallback(async (offset: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, group, detailKey, detailOffset: String(offset) });
      const response = await fetchOdooRoute(`${endpoint}?${params}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as SourcePage & { message?: string };
      if (!response.ok || !Array.isArray(body.rows) || !Number.isFinite(body.totalAmount)) throw new Error(body.message || "Source records are unavailable.");
      setRows((current) => append ? [...current, ...body.rows] : body.rows);
      setTotal(body.total);
      setTotalAmount(body.totalAmount);
      setHasNext(body.hasNext);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Source records are unavailable.");
    } finally {
      setLoading(false);
    }
  }, [endpoint, from, to, group, detailKey]);

  useEffect(() => { void load(0, false); }, [load]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const difference = Math.round((totalAmount - expectedAmount) * 100) / 100;
  const reportLabel = kind === "purchases" ? "purchase orders" : kind === "sales-orders" ? "POS orders" : "sale lines";

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-3 print:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="report-source-title" className="flex max-h-[min(90dvh,760px)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-[var(--oh-border)] px-4 py-3 sm:px-5">
        <div className="min-w-0"><h2 id="report-source-title" className="text-base font-semibold text-[var(--oh-text)]">{title}</h2><p className="mt-1 text-xs text-[var(--oh-muted)]">Odoo source records · {from} to {to} · {timezone}</p></div>
        <button type="button" onClick={onClose} aria-label="Close source records" title="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-[var(--oh-muted)] hover:bg-[var(--oh-surface)]"><X size={18} /></button>
      </header>
      <div className="grid gap-2 border-b border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 text-sm sm:grid-cols-3 sm:px-5">
        <p>Source {reportLabel}: <strong className="tabular-nums">{total.toLocaleString("en-AU")}</strong></p>
        <p>Source amount: <strong className="tabular-nums">{money.format(totalAmount)}</strong></p>
        <p className={Math.abs(difference) < 0.005 ? "text-emerald-800" : "text-amber-900"}>Difference vs group: <strong className="tabular-nums">{money.format(difference)}</strong></p>
      </div>
      {error && <p role="alert" className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-white text-xs uppercase text-[var(--oh-muted)] shadow-[0_1px_0_var(--oh-border)]"><tr>
            <th className="px-4 py-3">{kind === "purchases" ? "Purchase order" : "Order"}</th><th className="px-4 py-3">Date</th>
            {kind === "sales-orders" ? <><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Cashier</th></> : kind === "sales-lines" ? <><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Quantity</th></> : <><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Status</th></>}
            <th className="px-4 py-3 text-right">Amount</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--oh-border)]">
            {rows.map((row) => <tr key={row.id}>
              <th scope="row" className="px-4 py-3 font-medium">{kind === "purchases" ? row.name : row.order}</th>
              <td className="px-4 py-3 tabular-nums">{row.date ? formatOdooDateTime(row.date, timezone) : "—"}</td>
              {kind === "sales-orders" ? <><td className="px-4 py-3">{row.customer}</td><td className="px-4 py-3">{row.cashier}</td></> : kind === "sales-lines" ? <><td className="px-4 py-3">{row.product}</td><td className="px-4 py-3 text-right tabular-nums">{row.quantity?.toLocaleString("en-AU", { maximumFractionDigits: 2 })}</td></> : <><td className="px-4 py-3">{row.supplier}</td><td className="px-4 py-3">{row.state}</td></>}
              <td className="px-4 py-3 text-right tabular-nums">{money.format(row.amount)}</td>
            </tr>)}
            {!rows.length && !loading && !error && <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--oh-muted)]">No source records in this group.</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--oh-border)] px-4 py-3 text-sm sm:px-5">
        <span role="status" aria-live="polite" className="text-[var(--oh-muted)]">Loaded {rows.length.toLocaleString("en-AU")} of {total.toLocaleString("en-AU")} {reportLabel}{loading && rows.length === 0 ? " · Loading…" : ""}</span>
        {hasNext && <button type="button" onClick={() => void load(rows.length, true)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 font-semibold disabled:opacity-50">{loading ? <LoaderCircle size={15} className="animate-spin" /> : null}Load more</button>}
      </footer>
    </section>
  </div>;
}
