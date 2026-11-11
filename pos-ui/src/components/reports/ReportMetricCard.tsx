import Link from "next/link";
import { cn } from "@/lib/utils";

export type ReportMetricTone = "neutral" | "positive" | "negative" | "danger" | "warning";

const toneClass: Record<ReportMetricTone, string> = {
  neutral: "border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]",
  positive: "border-emerald-200 bg-[var(--brand-success-tint,var(--oh-surface-elevated))]",
  negative: "border-amber-200 bg-[var(--brand-warning-tint,var(--oh-surface-elevated))]",
  danger: "border-red-200 bg-[var(--brand-danger-tint,#fef2f2)]",
  warning: "border-amber-200 bg-[var(--brand-warning-tint,#fffbeb)]",
};

const valueTone: Record<ReportMetricTone, string> = {
  neutral: "text-[var(--oh-text)]",
  positive: "text-[var(--oh-success)]",
  negative: "text-[var(--oh-warning)]",
  danger: "text-[var(--oh-danger)]",
  warning: "text-[var(--oh-warning)]",
};

export function ReportMetricCard({
  label,
  value,
  detail,
  tone = "neutral",
  href,
  loading = false,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: ReportMetricTone;
  href?: string;
  loading?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-[var(--oh-border)]" aria-hidden="true" />
      ) : (
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight", valueTone[tone])}>{value}</p>
      )}
      {detail ? <p className="mt-1 text-xs leading-snug text-[var(--oh-muted)]">{detail}</p> : null}
    </>
  );

  const classes = cn(
    "rounded-lg border p-3.5 shadow-[var(--brand-shadow,none)] transition-colors",
    toneClass[tone],
    href && "hover:border-[var(--oh-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }

  return <div className={classes}>{body}</div>;
}
