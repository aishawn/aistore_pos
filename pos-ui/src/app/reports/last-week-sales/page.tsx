"use client";

import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { ListTable } from "@/components/admin/ListTable";
import { useApi } from "@/hooks/useApi";

interface LastWeekSalesReport {
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

export default function LastWeekSalesPage() {
  const { data, loading, error, reload } = useApi<LastWeekSalesReport>("/api/reports/last-week-sales");

  return (
    <AdminPageLayout title="Last Week Sales" subtitle="Previous week's sales total, Monday through Sunday">
      <AsyncState loading={loading} error={error} empty={false} onRetry={reload}>
        <ListTable
          columns={[
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
      </AsyncState>
    </AdminPageLayout>
  );
}
