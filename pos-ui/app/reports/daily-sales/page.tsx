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
        <div role="status" aria-label="Loading daily sales" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
          <div className="grid grid-cols-6 gap-3 bg-[var(--oh-surface)] px-4 py-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-[var(--oh-border)]" />)}</div>
          <div className="grid grid-cols-6 gap-3 px-4 py-4">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-4 animate-pulse rounded bg-[var(--oh-surface)]" />)}</div>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><span>{error}</span><button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button></div>
      ) : !data ? (
        <p className="rounded-lg border border-dashed border-[var(--oh-border-strong)] bg-white px-4 py-12 text-center text-sm text-[var(--oh-muted)]">No daily sales report is available yet.</p>
      ) : (
        <ListTable
          columns={[
            { label: "Date" },
            { label: "Total Sales", align: "right" },
            { label: "Cost", align: "right" },
            { label: "Transaction Count", align: "right" },
            { label: "Gross Profit", align: "right" },
            { label: "Gross Profit Margin", align: "right" },
          ]}
          rows={
            data
              ? [
                  [
                    data.date,
                    money(data.totalSales),
                    money(data.cost),
                    String(data.transactionCount ?? 0),
                    money(data.grossProfit),
                    percent(data.grossProfitMargin),
                  ],
                ]
              : []
          }
        />
      )}
    </AdminPageLayout>
  );
}
