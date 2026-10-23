import { ORITHOS_BRAND } from "@/components/OrithosBrandMark";
import { cn } from "@/lib/utils";

/** Orithos brand mark with a version for each background tone. */
export function OrithosLogo({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <span
      className={cn(
        "oh-brand-mark",
        compact && "oh-brand-mark-compact",
        inverse && "oh-brand-mark-inverse",
      )}
      aria-label="Orithos"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img
        src={inverse ? ORITHOS_BRAND.dark : ORITHOS_BRAND.light}
        alt=""
        aria-hidden="true"
        className={cn("oh-brand-mark-img", compact && "oh-brand-mark-img-compact")}
        width={48}
        height={32}
      />
      {!compact && <span className="oh-brand-wordmark">orithos</span>}
    </span>
  );
}

/** Kept as a small alias for existing login metadata and headings. */
export function OrithosWordmark({ className }: { className?: string }) {
  return <span className={cn("oh-brand-wordmark", className)}>orithos</span>;
}
