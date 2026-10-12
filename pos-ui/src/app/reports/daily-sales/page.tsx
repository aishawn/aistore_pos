"use client";

import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { ListTable } from "@/components/admin/ListTable";
import { useApi } from "@/hooks/useApi";
import { formatAuDate } from "@/lib/au";

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
  const { data, loading, error } = useApi<DailySalesReport>("/api/reports/daily-sales");

  return (
    <AdminPageLayout title="Daily Sales" subtitle="Completed sales for today">
      <AsyncState loading={loading} error={error} empty={false}>
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
                    formatAuDate(data.date),
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
