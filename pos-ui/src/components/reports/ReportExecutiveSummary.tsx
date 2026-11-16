import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { reportMoney, reportNumber, reportPercent } from "@/components/reports/report-format";
import type { NativeOverview } from "@/lib/native-overview";
import type { PeriodCompareDeltas } from "@/lib/report-insights";
import { formatDataAsOfLabel } from "@/lib/report-insights";
import { cn } from "@/lib/utils";

function DeltaBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  const tone = value > 0 ? "text-[var(--oh-success)]" : value < 0 ? "text-[var(--oh-warning)]" : "text-[var(--oh-muted)]";
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums", tone)}>
      <Icon size={16} aria-hidden="true" />
      {reportPercent(value)}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const labels: Record<string, string> = {
    available: "Data complete",
    incomplete: "Data incomplete",
    no_data: "No sales",
  };
  const tones: Record<string, string> = {
    available: "bg-emerald-50 text-emerald-900 border-emerald-200",
    incomplete: "bg-amber-50 text-amber-950 border-amber-200",
    no_data: "bg-[var(--oh-surface-muted)] text-[var(--oh-muted)] border-[var(--oh-border)]",
  };
  return (
    <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", tones[status] ?? tones.incomplete)}>
      {labels[status] ?? status}
    </span>
  );
}

export function ReportExecutiveSummary({
  data,
  headline,
  deltas,
  periodLabel,
  loading = false,
}: {
  data: NativeOverview | null;
  headline: string;
  deltas: PeriodCompareDeltas;
  periodLabel: string;
  loading?: boolean;
}) {
  const primaryIsProfit = Boolean(data?.costAvailable && data.grossProfit != null);
  const primaryLabel = primaryIsProfit ? "Profit" : "Sales";
  const primaryValue = primaryIsProfit
    ? reportMoney(Number(data?.grossProfit))
    : data
      ? reportMoney(data.revenue)
      : "—";
  const primaryDelta = primaryIsProfit ? deltas.profitPct : deltas.revenuePct;
  const dataAsOf = formatDataAsOfLabel(data?.dataAsOf);

  if (loading) {
    return (
      <section className="mx-4 mt-4 rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] md:mx-6">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--oh-border)]" />
        <div className="mt-4 h-10 w-48 animate-pulse rounded bg-[var(--oh-border)]" />
        <div className="mt-3 h-3 w-full max-w-md animate-pulse rounded bg-[var(--oh-border)]" />
      </section>
    );
  }

  return (
    <section className="mx-4 mt-4 overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)] md:mx-6">
      <div className="border-l-4 border-[var(--oh-primary)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">{periodLabel}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <p className="text-sm font-medium text-[var(--oh-muted)]">{primaryLabel}</p>
              <p className="text-4xl font-semibold tracking-tight tabular-nums text-[var(--oh-text)]">{primaryValue}</p>
              <DeltaBadge value={primaryDelta} />
            </div>
            {!primaryIsProfit && data && !data.costAvailable ? (
              <p className="mt-1 text-xs font-medium text-[var(--oh-warning)]">Profit unverified — cost coverage incomplete</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data?.reportDataStatus ?? undefined} />
            {dataAsOf ? <span className="text-xs text-[var(--oh-muted)]">Updated {dataAsOf}</span> : null}
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--oh-text-secondary)]">{headline}</p>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--oh-border)] pt-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-[var(--oh-muted)]">Sales</dt>
            <dd className="text-base font-semibold tabular-nums">{data ? reportMoney(data.revenue) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--oh-muted)]">Transactions</dt>
            <dd className="text-base font-semibold tabular-nums">{data ? reportNumber(data.transactions) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--oh-muted)]">Avg sale</dt>
            <dd className="text-base font-semibold tabular-nums">
              {data?.averageSale != null ? reportMoney(data.averageSale) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[var(--oh-muted)]">Refunds</dt>
            <dd className="text-base font-semibold tabular-nums">
              {data?.refunds != null ? reportMoney(data.refunds) : "—"}
              {data?.refundTransactions ? (
                <span className="ml-1 text-xs font-normal text-[var(--oh-muted)]">({reportNumber(data.refundTransactions)} tx)</span>
              ) : null}
            </dd>
          </div>
          {data?.costAvailable && data.profitMargin != null ? (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-xs font-medium text-[var(--oh-muted)]">Gross margin</dt>
              <dd className="text-base font-semibold tabular-nums">{Number(data.profitMargin).toFixed(2)}%</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}