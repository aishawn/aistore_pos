"use client";

import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { ListTable } from "@/components/admin/ListTable";
import { useApi } from "@/hooks/useApi";

interface LastMonthSalesReport {
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

export default function LastMonthSalesPage() {
  const { data, loading, error } = useApi<LastMonthSalesReport>("/api/reports/last-month-sales");

  return (
    <AdminPageLayout title="Last Month Sales" subtitle="Previous calendar month's sales total">
      <AsyncState loading={loading} error={error} empty={false}>
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
