"use client";

import { cn } from "@/lib/utils";

type OdooSellFinaliseButtonProps = {
  canFinalise: boolean;
  label: string;
  title: string;
  onClick: () => void;
  className?: string;
};

export function OdooSellFinaliseButton({
  canFinalise,
  label,
  title,
  onClick,
  className,
}: OdooSellFinaliseButtonProps) {
  return (
    <button
      type="button"
      disabled={!canFinalise}
      onClick={onClick}
      aria-disabled={!canFinalise}
      title={title}
      className={cn(
        "min-h-11 rounded-[var(--oh-radius)] px-5 text-[14px] font-semibold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-orange)]",
        canFinalise
          ? "cursor-pointer bg-[var(--oh-primary)] hover:bg-[var(--oh-primary-hover)]"
          : "cursor-not-allowed bg-[var(--oh-border-strong)] opacity-70",
        className,
      )}
    >
      {label}
    </button>
  );
}
