"use client";

import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { useApi } from "@/hooks/useApi";
import { RefreshCw } from "lucide-react";

interface DailySalesReport {
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

export default function DailySalesPage() {
  const { data, loading, error, reload } = useApi<DailySalesReport>("/api/reports/daily-sales");

  return (
    <AdminPageLayout title="Daily Sales" subtitle="Completed sales for today">
      {loading ? (
        <div role="status" aria-live="polite" aria-busy="true" aria-label="Loading daily sales" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
          <div className="grid grid-cols-6 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>
          <div className="grid grid-cols-6 gap-3 px-4 py-4">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>
        </div>
      ) : error ? (
<div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><RefreshCw size={15} /> Retry</button></div>
      ) : !data ? (
        <p className="rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">No daily sales report is available yet.</p>
      ) : (
        <>
          <div className="hidden md:block"><ListTable columns={[{ label: "Date" }, { label: "Total Sales", align: "right" }, { label: "Cost", align: "right" }, { label: "Transaction Count", align: "right" }, { label: "Gross Profit", align: "right" }, { label: "Gross Profit Margin", align: "right" }]} rows={[[data.date, money(data.totalSales), money(data.cost), String(data.transactionCount ?? 0), money(data.grossProfit), percent(data.grossProfitMargin)]]} /></div>
          <article className="rounded-lg border border-[var(--oh-border)] bg-white p-4 md:hidden"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-[var(--oh-text)]">{data.date}</h2><strong className="tabular-nums text-[var(--oh-text)]">{money(data.totalSales)}</strong></div><dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-3 text-sm"><div><dt className="text-xs text-[var(--oh-muted)]">Cost</dt><dd className="mt-1 tabular-nums text-[var(--oh-text-secondary)]">{money(data.cost)}</dd></div><div><dt className="text-xs text-[var(--oh-muted)]">Transactions</dt><dd className="mt-1 tabular-nums text-[var(--oh-text-secondary)]">{data.transactionCount ?? 0}</dd></div><div><dt className="text-xs text-[var(--oh-muted)]">Gross profit</dt><dd className="mt-1 tabular-nums text-[var(--oh-text-secondary)]">{money(data.grossProfit)}</dd></div><div><dt className="text-xs text-[var(--oh-muted)]">Margin</dt><dd className="mt-1 tabular-nums text-[var(--oh-text-secondary)]">{percent(data.grossProfitMargin)}</dd></div></dl></article>
        </>
      )}
    </AdminPageLayout>
  );
}
