import {
  OrithosBrandMarkDark,
  OrithosBrandMarkIcon,
  OrithosBrandMarkLight,
} from "@/components/OrithosBrandMark";
import { cn } from "@/lib/utils";

/** Orithos brand lockup: crisp SVG mark + wordmark (no raster black-box PNGs). */
export function OrithosLogo({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  const Mark = compact ? OrithosBrandMarkIcon : inverse ? OrithosBrandMarkDark : OrithosBrandMarkLight;
  return (
    <span
      className={cn(
        "oh-brand-mark",
        compact && "oh-brand-mark-compact",
        inverse && "oh-brand-mark-inverse",
      )}
      aria-label="Orithos"
    >
      <Mark
        className={cn(
          compact ? "oh-brand-mark-img-compact h-7 w-7" : "h-8 w-auto",
        )}
      />
      {!compact && <span className="oh-brand-wordmark">orithos</span>}
    </span>
  );
}

/** Kept as a small alias for existing login metadata and headings. */
export function OrithosWordmark({ className }: { className?: string }) {
  return <span className={cn("oh-brand-wordmark", className)}>orithos</span>;
}
