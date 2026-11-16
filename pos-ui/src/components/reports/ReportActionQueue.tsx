import Link from "next/link";
import { ChevronRight, CircleAlert, CircleDashed, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReportActionItem = {
  id: string;
  tone: "danger" | "warning" | "info";
  message: string;
  href?: string;
  hrefLabel?: string;
};

const iconFor: Record<ReportActionItem["tone"], typeof CircleAlert> = {
  danger: CircleAlert,
  warning: TriangleAlert,
  info: CircleDashed,
};

const toneClass: Record<ReportActionItem["tone"], string> = {
  danger: "border-red-200 bg-red-50/80",
  warning: "border-amber-200 bg-amber-50/80",
  info: "border-[var(--oh-border)] bg-[var(--oh-surface-elevated)]",
};

export function ReportActionQueue({ items }: { items: ReportActionItem[] }) {
  if (!items.length) return null;

  return (
    <section aria-label="Action queue" className="mx-4 mt-4 space-y-2 md:mx-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Needs attention</h2>
      <ul className="space-y-2">
        {items.map((item) => {
          const Icon = iconFor[item.tone];
          const body = (
            <>
              <Icon size={18} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm font-medium text-[var(--oh-text)]">{item.message}</span>
              {item.href ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-[var(--oh-primary)]">
                  {item.hrefLabel ?? "Review"}
                  <ChevronRight size={14} aria-hidden="true" />
                </span>
              ) : null}
            </>
          );
          const classes = cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2.5",
            toneClass[item.tone],
            item.href && "transition-colors hover:border-[var(--oh-primary)]",
          );
          return (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} className={classes}>
                  {body}
                </Link>
              ) : (
                <div className={classes}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}