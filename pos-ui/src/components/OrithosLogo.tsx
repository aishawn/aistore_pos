import Image from "next/image";
import { cn } from "@/lib/utils";

const wordmarkClass =
  "font-bold italic uppercase tracking-tighter [-webkit-text-stroke:1px_#000] [paint-order:stroke_fill]";

/** Styled "ORITHOS" wordmark — ORIT orange, HOS white, bold italic with outline. */
export function OrithosWordmark({ className }: { className?: string }) {
  return (
    <span className={cn(wordmarkClass, className)}>
      <span className="text-[var(--oh-orange)]">ORIT</span>
      <span className="text-white">HOS</span>
    </span>
  );
}

/** Orithos brand mark — logo image + wordmark matching reference UI. */
export function OrithosLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", compact && "gap-2")}>
      <Image
        src="/images/logo-new.png"
        alt="Orithos"
        width={83}
        height={56}
        className={cn("w-auto shrink-0", compact ? "h-7" : "h-9")}
        priority
      />
      {!compact && <OrithosWordmark className="text-[17px]" />}
    </div>
  );
}
