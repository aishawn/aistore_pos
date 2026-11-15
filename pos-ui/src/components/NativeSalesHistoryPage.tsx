"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { FilterDateRangePicker } from "@/components/admin/FilterDateRangePicker";
import { compareIsoDateDesc } from "@/lib/natural-sort";

type HistoryDay = {
  date: string;
  salesTransactions: number;
  refundTransactions: number;
  salesAmount: number;
  refundAmount: number;
  netSales: number;
  tax: number;
};

type HistoryPayload = {
  source: "orithos_ledger";
  from: string;
  to: string;
  days: HistoryDay[];
};

function todayInStore() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

export function NativeSalesHistoryPage({
  variant = "page",
  onRequestClose,
}: {
  variant?: "page" | "panel";
  onRequestClose?: () => void;
} = {}) {
  const today = todayInStore();
  const [from, setFrom] = useState(() => shiftDay(today, -29));
  const [to, setTo] = useState(() => today);
  const [draft, setDraft] = useState(() => ({ start: shiftDay(today, -29), end: today }));
  const [rows, setRows] = useState<HistoryDay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (variant !== "page" || typeof location === "undefined") return;
    const params = new URLSearchParams(location.search);
    if (params.get("from")) setFrom(params.get("from")!);
    if (params.get("to")) setTo(params.get("to")!);
  }, [variant]);

  useEffect(() => {
    setDraft({ start: from, end: to });
  }, [from, to]);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      setRows([]);
      setError("Choose a valid date range.");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    fetch(`/api/reports/native-sales-history?${params}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { data?: HistoryPayload; message?: string } | null;
        if (!response.ok || !body?.data || body.data.source !== "orithos_ledger") {
          throw new Error(body?.message || "Orithos sales history is unavailable.");
        }
        setRows(body.data.days);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setRows([]);
          setError(cause instanceof Error ? cause.message : "Orithos sales history is unavailable.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, to, revision]);

  const sortedRows = useMemo(() => [...rows].sort((a, b) => compareIsoDateDesc(a.date, b.date)), [rows]);

  const totals = useMemo(() => rows.reduce((acc, row) => ({
    salesAmount: acc.salesAmount + Number(row.salesAmount),
    refundAmount: acc.refundAmount + Number(row.refundAmount),
    netSales: acc.netSales + Number(row.netSales),
    tax: acc.tax + Number(row.tax),
    salesTransactions: acc.salesTransactions + Number(row.salesTransactions),
    refundTransactions: acc.refundTransactions + Number(row.refundTransactions),
  }), { salesAmount: 0, refundAmount: 0, netSales: 0, tax: 0, salesTransactions: 0, refundTransactions: 0 }), [rows]);

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--oh-muted)]">Source: Orithos ledger</p>
          <h1 className="text-xl font-semibold text-[var(--oh-text)]">Sales history</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading} title="Refresh history" aria-label="Refresh history" className="grid size-9 place-items-center rounded-md border border-[var(--oh-border)] disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          {variant === "panel" && onRequestClose ? (
            <button type="button" onClick={onRequestClose} className="h-9 rounded-md border border-[var(--oh-border)] px-3 text-sm text-[var(--oh-text)]">
              Close
            </button>
          ) : null}
        </div>
      </header>
      <div className="flex flex-wrap items-end gap-2 border-b border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <FilterDateRangePicker
          label="Date range"
          start={draft.start}
          end={draft.end}
          onChange={(range) => {
            setDraft(range);
            if (range.start && range.end) {
              setFrom(range.start);
              setTo(range.end);
            }
          }}
        />
      </div>
      {error && <div role="alert" className="mx-4 mt-3 flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 md:mx-6"><AlertCircle size={16} />{error}</div>}
      <section aria-busy={loading} className="flex flex-wrap gap-x-8 gap-y-3 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <Metric label="Net sales" value={money(totals.netSales)} />
        <Metric label="Sales amount" value={money(totals.salesAmount)} />
        <Metric label="Refunds" value={money(totals.refundAmount)} />
        <Metric label="Tax" value={money(totals.tax)} />
        <Metric label="Transactions" value={(totals.salesTransactions + totals.refundTransactions).toLocaleString("en-AU")} />
      </section>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-[var(--oh-surface)] text-xs uppercase text-[var(--oh-muted)]">
            <tr>{["Business date", "Sales tx", "Refund tx", "Sales", "Refunds", "Net", "Tax"].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--oh-border)]">
            {sortedRows.map((row) => (
              <tr key={row.date}>
                <td className="px-3 py-2">{row.date}</td>
                <td className="px-3 py-2">{Number(row.salesTransactions).toLocaleString("en-AU")}</td>
                <td className="px-3 py-2">{Number(row.refundTransactions).toLocaleString("en-AU")}</td>
                <td className="px-3 py-2">{money(Number(row.salesAmount))}</td>
                <td className="px-3 py-2">{money(Number(row.refundAmount))}</td>
                <td className="px-3 py-2">{money(Number(row.netSales))}</td>
                <td className="px-3 py-2">{money(Number(row.tax))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="p-6 text-center text-sm text-[var(--oh-muted)]">No Orithos sales in this range.</p>}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-28"><p className="text-xs font-medium text-[var(--oh-muted)]">{label}</p><p className="mt-1 text-lg font-semibold text-[var(--oh-text)]">{value}</p></div>;
}
