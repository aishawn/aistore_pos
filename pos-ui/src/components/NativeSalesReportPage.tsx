"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { fetchOrithosApi } from "@/lib/orithos-api-fetch";

type Report = {
  source: "orithos_ledger";
  revenue: number;
  cost: number | null;
  tax: number | null;
  grossProfit: number | null;
  costAvailable: boolean;
  taxAvailable: boolean;
  transactions: number;
  dailyTrend: Array<{ date: string; revenue: number; transaction_count: number; cost: number | null; tax: number | null; grossProfit: number | null; costAvailable: boolean; taxAvailable: boolean }>;
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
};

function todayInStore() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

export function NativeSalesReportPage() {
  const [from, setFrom] = useState(() => todayInStore());
  const [to, setTo] = useState(() => todayInStore());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has("from")) setFrom(params.get("from") || todayInStore());
    if (params.has("to")) setTo(params.get("to") || todayInStore());
  }, []);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      setReport(null);
      setError("Choose a valid date range.");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    fetchOrithosApi(`/reports/native-overview?${params}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null) as { data?: Report; message?: string } | null;
        if (!response.ok || !body?.data || body.data.source !== "orithos_ledger") throw new Error(body?.message || "Orithos sales data is unavailable.");
        setReport(body.data);
        setError(null);
      })
      .catch(cause => { if (!controller.signal.aborted) { setReport(null); setError(cause instanceof Error ? cause.message : "Orithos sales data is unavailable."); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [from, to, revision]);

  return <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
      <div><p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Source: Orithos ledger</p><h1 className="text-xl font-semibold text-[var(--oh-text)]">Sales report</h1></div>
      <button type="button" onClick={() => setRevision(value => value + 1)} disabled={loading} title="Refresh report" aria-label="Refresh report" className="grid size-9 place-items-center rounded-md border border-[var(--oh-border)] disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
    </header>
    <div className="flex flex-wrap items-end gap-2 border-b border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
      <label className="grid gap-1 text-xs text-[var(--oh-muted)]">From<input type="date" value={from} onChange={event => setFrom(event.target.value)} className="h-9 rounded-md border border-[var(--oh-border)] px-2 text-sm text-[var(--oh-text)]" /></label>
      <label className="grid gap-1 text-xs text-[var(--oh-muted)]">To<input type="date" value={to} onChange={event => setTo(event.target.value)} className="h-9 rounded-md border border-[var(--oh-border)] px-2 text-sm text-[var(--oh-text)]" /></label>
    </div>
    {error && <div role="alert" className="mx-4 mt-3 flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 md:mx-6"><AlertCircle size={16} />{error}</div>}
    <section aria-busy={loading} className="flex flex-wrap gap-x-8 gap-y-3 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
      <Metric label="Revenue" value={report ? money(report.revenue) : "—"} /><Metric label="Cost of goods sold" value={report?.costAvailable && report.cost !== null ? money(report.cost) : "—"} /><Metric label="Gross profit (ex tax)" value={report?.grossProfit != null ? money(report.grossProfit) : "—"} /><Metric label="Tax" value={report?.taxAvailable && report.tax !== null ? money(report.tax) : "—"} /><Metric label="Transactions" value={report ? report.transactions.toLocaleString("en-AU") : "—"} />
    </section>
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[680px] border-collapse text-left text-sm"><thead className="sticky top-0 bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]"><tr>{["Business date", "Revenue", "Cost", "Gross profit", "Tax", "Transactions"].map(label => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{report?.dailyTrend.map(row => <tr key={String(row.date)}><td className="px-3 py-2">{String(row.date)}</td><td className="px-3 py-2">{money(Number(row.revenue))}</td><td className="px-3 py-2">{row.costAvailable && row.cost !== null ? money(Number(row.cost)) : "—"}</td><td className="px-3 py-2">{row.grossProfit !== null ? money(Number(row.grossProfit)) : "—"}</td><td className="px-3 py-2">{row.taxAvailable && row.tax !== null ? money(Number(row.tax)) : "—"}</td><td className="px-3 py-2">{Number(row.transaction_count).toLocaleString("en-AU")}</td></tr>)}</tbody></table>
      {!loading && report?.dailyTrend.length === 0 && <p className="p-6 text-center text-sm text-[var(--oh-muted)]">No Orithos sales in this range.</p>}
    </div>
    <p className="border-t border-[var(--oh-border)] px-4 py-2 text-xs text-[var(--oh-muted)]">Completed transactions stored in Orithos only. Tax and historical cost must be complete to show gross profit.</p>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-28"><p className="text-xs font-medium text-[var(--oh-muted)]">{label}</p><p className="mt-1 text-lg font-semibold text-[var(--oh-text)]">{value}</p></div>;
}
