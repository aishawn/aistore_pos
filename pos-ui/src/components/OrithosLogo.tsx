import { cn } from "@/lib/utils";

/** Orithos brand mark — Scheme A light retail blue. */
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
        src={inverse ? "/images/orithos-logo-inverse.png" : "/images/orithos-logo.png"}
        alt=""
        aria-hidden="true"
        className="oh-brand-mark-img"
        width={32}
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
