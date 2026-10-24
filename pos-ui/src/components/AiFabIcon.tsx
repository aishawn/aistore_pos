import { cn } from "@/lib/utils";

/** Brand action — shares login CTA (`--oh-primary`). */
const BRAND_BLUE = "var(--brand-action)";
const BRAND_BLUE_DOT = "var(--brand-tint-strong)";
const BRAND_BLUE_SPARK = "var(--brand-tint)";

/** Orithos-branded AI entry mark — shared brand palette. */
export function AiFabIcon({
  size = 56,
  className,
  title = "Orithos AI",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-white",
        className,
      )}
      style={{ width: size, height: size, backgroundColor: BRAND_BLUE }}
      role="img"
      aria-label={title}
    >
      <svg
        viewBox="0 0 64 64"
        width={size * 0.72}
        height={size * 0.72}
        fill="none"
        aria-hidden
      >
        {/* Chat bubble */}
        <path
          d="M18 20.5c0-3.59 2.91-6.5 6.5-6.5h15c3.59 0 6.5 2.91 6.5 6.5v11c0 3.59-2.91 6.5-6.5 6.5H31.2L24 46.5v-8.5h-.5c-3.59 0-6.5-2.91-6.5-6.5v-11z"
          fill="#ffffff"
        />
        {/* Typing dots */}
        <circle cx="26.5" cy="26.5" r="2.2" fill={BRAND_BLUE_DOT} />
        <circle cx="32" cy="26.5" r="2.2" fill={BRAND_BLUE_DOT} />
        <circle cx="37.5" cy="26.5" r="2.2" fill={BRAND_BLUE_DOT} />
        {/* Spark accents */}
        <path
          d="M46 12.5l1.15 3.1 3.1 1.15-3.1 1.15L46 21l-1.15-3.1-3.1-1.15 3.1-1.15L46 12.5z"
          fill={BRAND_BLUE_SPARK}
        />
        <path
          d="M51.5 22l.7 1.85 1.85.7-1.85.7-.7 1.85-.7-1.85-1.85-.7 1.85-.7.7-1.85z"
          fill={BRAND_BLUE_SPARK}
          opacity="0.95"
        />
      </svg>
    </span>
  );
}
