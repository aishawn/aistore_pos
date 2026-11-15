import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type StripTone = "danger" | "warning";

const toneClass: Record<StripTone, string> = {
  danger: "border-red-200 bg-red-50 text-red-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
};

export function ReportAlertStrip({
  message,
  href,
  hrefLabel = "Review",
  tone = "warning",
}: {
  message: string;
  href?: string;
  hrefLabel?: string;
  tone?: StripTone;
}) {
  const content = (
    <>
      <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm font-medium">{message}</span>
      {href ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-[var(--oh-primary)]">
          {hrefLabel}
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      ) : null}
    </>
  );

  const classes = cn(
    "flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors",
    toneClass[tone],
    href && "hover:border-[var(--oh-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]",
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return <div className={classes} role="status">{content}</div>;
}