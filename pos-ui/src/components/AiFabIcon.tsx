import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

/** Orithos AI orb shared by the dashboard and assistant entry points. */
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
        "pointer-events-none relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-[var(--brand-module-orange-tint)] shadow-[0_8px_24px_rgba(230,141,74,.2)]",
        className,
      )}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title}
    >
      <img
        src="/images/ai-glass-orb.webp"
        alt=""
        draggable={false}
        aria-hidden="true"
        className="absolute inset-[-18%] h-[136%] w-[136%] max-w-none object-contain"
      />
      <Sparkles
        aria-hidden="true"
        size={Math.max(16, Math.round(size * 0.34))}
        strokeWidth={1.7}
        className="relative z-10 text-[var(--brand-orange)]"
      />
    </span>
  );
}
