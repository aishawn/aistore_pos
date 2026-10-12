"use client";

import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { ListTable } from "@/components/admin/ListTable";
import { useApi } from "@/hooks/useApi";
import { formatAuDate } from "@/lib/au";

interface ThisMonthSalesRow {
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

export default function ThisMonthSalesPage() {
  const { data, loading, error } = useApi<ThisMonthSalesRow[]>("/api/reports/this-month-sales");
  const rows = data ?? [];

  return (
    <AdminPageLayout title="This Month Sales" subtitle="This month's sales from the 1st through today">
      <AsyncState
        loading={loading}
        error={error}
        empty={!loading && !error && rows.length === 0}
        emptyText="No sales days in the current month."
      >
        <ListTable
          columns={[
            { label: "Date" },
            { label: "Total Sales", align: "right" },
            { label: "Cost", align: "right" },
            { label: "Transaction Count", align: "right" },
            { label: "Gross Profit", align: "right" },
            { label: "Gross Profit Margin", align: "right" },
          ]}
          rows={rows.map((row) => [
            formatAuDate(row.date),
            money(row.totalSales),
            money(row.cost),
            String(row.transactionCount ?? 0),
            money(row.grossProfit),
            percent(row.grossProfitMargin),
          ])}
        />
      </AsyncState>
    </AdminPageLayout>
  );
}
