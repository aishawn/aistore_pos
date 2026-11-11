import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import styles from "./AiFabIcon.module.css";

/** Orithos AI orb shared by the dashboard and assistant entry points. */
export function AiFabIcon({
  size = 56,
  className,
  title = "Orithos AI",
  state = "idle",
}: {
  size?: number;
  className?: string;
  title?: string;
  state?: "idle" | "thinking" | "success";
}) {
  return (
    <span
      className={cn(
        "pointer-events-none relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-[var(--brand-module-orange-tint)] shadow-[0_8px_24px_rgba(230,141,74,.2)]",
        styles.orb,
        className,
      )}
      style={{ width: size, height: size }}
      data-state={state}
      role="img"
      aria-label={title}
    >
      <img
        src="/images/ai-glass-orb.webp"
        alt=""
        draggable={false}
        aria-hidden="true"
        className={cn(
          "absolute inset-[-18%] h-[136%] w-[136%] max-w-none object-contain",
          styles.glass,
        )}
      />
      <span aria-hidden="true" className={styles.sheen} />
      <span aria-hidden="true" className={styles.progressArc} />
      <Sparkles
        aria-hidden="true"
        size={Math.max(16, Math.round(size * 0.34))}
        strokeWidth={1.7}
        className={cn("relative z-10 text-[var(--brand-orange)]", styles.spark)}
      />
    </span>
  );
}
