import { cn } from "@/lib/utils";

/** Orithos-branded AI entry mark — Scheme A retail blue. */
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
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-[var(--oh-primary)]",
        className,
      )}
      style={{ width: size, height: size }}
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
        {/* Typing dots — light blue on white bubble */}
        <circle cx="26.5" cy="26.5" r="2.2" fill="#60a5fa" />
        <circle cx="32" cy="26.5" r="2.2" fill="#60a5fa" />
        <circle cx="37.5" cy="26.5" r="2.2" fill="#60a5fa" />
        {/* Spark accents */}
        <path
          d="M46 12.5l1.15 3.1 3.1 1.15-3.1 1.15L46 21l-1.15-3.1-3.1-1.15 3.1-1.15L46 12.5z"
          fill="#93c5fd"
        />
        <path
          d="M51.5 22l.7 1.85 1.85.7-1.85.7-.7 1.85-.7-1.85-1.85-.7 1.85-.7.7-1.85z"
          fill="#bfdbfe"
          opacity="0.95"
        />
      </svg>
    </span>
  );
}
