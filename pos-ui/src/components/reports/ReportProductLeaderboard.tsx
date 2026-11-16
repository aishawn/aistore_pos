import { reportMoney, reportNumber } from "@/components/reports/report-format";
import type { NativeOverviewProduct } from "@/lib/native-overview";
import { cn } from "@/lib/utils";

export type LeaderboardProduct = NativeOverviewProduct & { sharePct?: number };

export function ReportProductLeaderboard({
  products,
  loading = false,
  title = "Top products",
  limit = 10,
  emptyMessage = "Product detail unavailable.",
  className,
}: {
  products: LeaderboardProduct[];
  loading?: boolean;
  title?: string;
  limit?: number;
  emptyMessage?: string;
  className?: string;
}) {
  const rows = products.slice(0, limit);
  const maxRevenue = Math.max(1, ...rows.map((row) => Number(row.revenue) || 0));

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4",
        className,
      )}
    >
      <h2 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h2>
      {loading ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          {Array.from({ length: Math.min(5, limit) }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded bg-[var(--oh-border)]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--oh-muted)]">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
          {rows.map((row, index) => {
            const revenue = Number(row.revenue) || 0;
            const width = Math.max(4, (revenue / maxRevenue) * 100);
            return (
              <li key={row.id ?? `${row.name}-${index}`} className="grid gap-1.5">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="line-clamp-2 min-w-0 font-medium text-[var(--oh-text)]" title={row.name}>
                    <span className="mr-2 text-xs text-[var(--oh-muted)]">{index + 1}.</span>
                    {row.name}
                  </span>
                  <div className="shrink-0 text-right">
                    <strong className="block tabular-nums">{reportMoney(revenue)}</strong>
                    {row.sharePct != null ? (
                      <span className="text-xs tabular-nums text-[var(--oh-muted)]">{row.sharePct.toFixed(1)}%</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--oh-surface-muted)]">
                    <div className="h-full rounded-full bg-[var(--oh-primary)]" style={{ width: `${width}%` }} />
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--oh-muted)]">
                    {reportNumber(Number(row.quantity) || 0)} units
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}