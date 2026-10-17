"use client";

import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { useApi } from "@/hooks/useApi";
import { RefreshCw } from "lucide-react";

interface WeeklySalesRow {
  date: string;
  totalSales: number;
  cost: number;
  transactionCount: number;
  grossProfit: number;
  grossProfitMargin: number;
}

function money(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function percent(value: number | null | undefined) {
  return `${Number(value ?? 0).toFixed(2)}%`;
}

export default function WeeklySalesPage() {
  const { data, loading, error, reload } = useApi<WeeklySalesRow[]>("/api/reports/weekly-sales");
  const rows = data ?? [];

  return (
    <AdminPageLayout title="Weekly Sales" subtitle="This week's sales through today">
      {loading ? (
        <div role="status" aria-label="Loading weekly sales" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white"><div className="grid grid-cols-6 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>{Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-6 gap-3 border-t border-[var(--oh-border)] px-4 py-4">{Array.from({ length: 6 }, (_, cell) => <div key={cell} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>)}</div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">No sales days in the current week.</p>
      ) : (
        <>
          <div className="hidden md:block"><ListTable columns={[{ label: "Date" }, { label: "Total Sales", align: "right" }, { label: "Cost", align: "right" }, { label: "Transaction Count", align: "right" }, { label: "Gross Profit", align: "right" }, { label: "Gross Profit Margin", align: "right" }]} rows={rows.map((row) => [row.date, money(row.totalSales), money(row.cost), String(row.transactionCount ?? 0), money(row.grossProfit), percent(row.grossProfitMargin)])} /></div>
          <div className="space-y-2 md:hidden" aria-label="Weekly sales list">{rows.map((row) => <article key={row.date} className="rounded-lg border border-[var(--oh-border)] bg-white p-4"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-[var(--oh-text)]">{row.date}</h2><strong className="tabular-nums text-[var(--oh-text)]">{money(row.totalSales)}</strong></div><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-3 text-sm"><div><dt className="text-xs text-[var(--oh-muted)]">Cost</dt><dd className="mt-1 tabular-nums text-[var(--oh-text-secondary)]">{money(row.cost)}</dd></div><div><dt className="text-xs text-[var(--oh-muted)]">Transactions</dt><dd className="mt-1 tabular-nums text-[var(--oh-text-secondary)]">{row.transactionCount ?? 0}</dd></div><div><dt className="text-xs text-[var(--oh-muted)]">Gross profit</dt><dd className="mt-1 tabular-nums text-[var(--oh-text-secondary)]">{money(row.grossProfit)}</dd></div><div><dt className="text-xs text-[var(--oh-muted)]">Margin</dt><dd className="mt-1 tabular-nums text-[var(--oh-text-secondary)]">{percent(row.grossProfitMargin)}</dd></div></dl></article>)}</div>
        </>
      )}
    </AdminPageLayout>
  );
}
