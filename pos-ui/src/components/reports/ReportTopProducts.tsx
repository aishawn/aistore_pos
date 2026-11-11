import { reportMoney, reportNumber } from "@/components/reports/report-format";

export type ReportTopProduct = {
  id?: number | string;
  name: string;
  revenue: number;
  quantity: number;
};

export function ReportTopProducts({
  products,
  loading = false,
  emptyMessage = "Product detail unavailable.",
  title = "Top products",
}: {
  products: ReportTopProduct[];
  loading?: boolean;
  emptyMessage?: string;
  title?: string;
}) {
  const maxRevenue = Math.max(1, ...products.map((row) => Number(row.revenue) || 0));

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4">
      <h2 className="text-sm font-semibold text-[var(--oh-text)]">{title}</h2>
      {loading ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-[var(--oh-border)]" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--oh-muted)]">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto">
          {products.map((row, index) => {
            const revenue = Number(row.revenue) || 0;
            const width = Math.max(4, (revenue / maxRevenue) * 100);
            return (
              <li key={row.id ?? `${row.name}-${index}`} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-[var(--oh-text)]" title={row.name}>
                    <span className="mr-2 text-xs text-[var(--oh-muted)]">{index + 1}.</span>
                    {row.name}
                  </span>
                  <strong className="shrink-0 tabular-nums">{reportMoney(revenue)}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--oh-surface-muted)]">
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
