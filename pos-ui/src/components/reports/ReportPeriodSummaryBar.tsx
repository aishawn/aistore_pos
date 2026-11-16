import { reportMoney } from "@/components/reports/report-format";
import type { NativeOverview } from "@/lib/native-overview";
import { cn } from "@/lib/utils";

export function ReportPeriodSummaryBar({
  data,
  loading = false,
}: {
  data: NativeOverview | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <section className="mx-4 mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 md:mx-6">
        <div className="h-10 animate-pulse rounded bg-[var(--oh-border)]" />
      </section>
    );
  }

  const items = [
    { label: "Sales", value: data ? reportMoney(data.revenue) : "—" },
    {
      label: "Profit",
      value: data?.grossProfit != null ? reportMoney(data.grossProfit) : data && !data.costAvailable ? "Unverified" : "—",
      warn: data && !data.costAvailable,
    },
    {
      label: "Margin",
      value: data?.profitMargin != null ? `${Number(data.profitMargin).toFixed(2)}%` : "—",
    },
    { label: "Refunds", value: data?.refunds != null ? reportMoney(data.refunds) : "—" },
    { label: "Discount", value: data?.discount != null ? reportMoney(data.discount) : "—" },
  ];

  return (
    <section className="mx-4 mt-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 md:mx-6">
      <div className="flex gap-4 overflow-x-auto">
        {items.map((item) => (
          <div key={item.label} className="min-w-[5.5rem] shrink-0">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">{item.label}</p>
            <p
              className={cn(
                "mt-0.5 text-lg font-semibold tabular-nums",
                item.warn ? "text-[var(--oh-warning)]" : "text-[var(--oh-text)]",
              )}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}