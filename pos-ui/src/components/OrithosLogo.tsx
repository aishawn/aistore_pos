import { cn } from "@/lib/utils";

/** Orithos brand mark shared with the public brand site. */
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
      <span className="oh-brand-symbol" aria-hidden="true"><span /></span>
      {!compact && <span className="oh-brand-wordmark">orithos</span>}
    </span>
  );
}

/** Kept as a small alias for existing login metadata and headings. */
export function OrithosWordmark({ className }: { className?: string }) {
  return <span className={cn("oh-brand-wordmark", className)}>orithos</span>;
}
