"use client";

import { useEffect, useState } from "react";
import { MinusIcon, PlusIcon, DeleteIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(2).replace(/\.?0+$/, "");
}

function parseQty(input: string): number {
  const n = parseFloat(input);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.round(n * 100) / 100;
}

type QuantityKeypadModalProps = {
  open: boolean;
  initialQty: number;
  productName?: string;
  onConfirm: (qty: number) => void;
  onClose: () => void;
};

export function QuantityKeypadModal({
  open,
  initialQty,
  productName,
  onConfirm,
  onClose,
}: QuantityKeypadModalProps) {
  const [input, setInput] = useState(formatQty(initialQty));

  useEffect(() => {
    if (open) setInput(formatQty(initialQty));
  }, [open, initialQty]);

  if (!open) return null;

  function appendDigit(digit: string) {
    setInput((prev) => {
      if (digit === ".") {
        if (prev.includes(".")) return prev;
        return prev === "" || prev === "0" ? "0." : `${prev}.`;
      }
      if (prev === "0" && digit !== ".") return digit;
      return prev + digit;
    });
  }

  function backspace() {
    setInput((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
  }

  function step(delta: number) {
    const next = Math.max(0.01, parseQty(input) + delta);
    setInput(formatQty(next));
  }

  function confirm() {
    onConfirm(parseQty(input));
    onClose();
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 font-sans"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Edit quantity"
        className="w-[280px] max-w-[90vw] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {productName && (
          <p className="mb-3 truncate text-center text-[12px] font-medium text-[var(--oh-muted)]">
            {productName}
          </p>
        )}

        {/* Display row */}
        <div className="mb-3 flex items-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-2 py-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => step(-1)}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--oh-border)] bg-white text-[var(--oh-text-secondary)] transition-colors hover:border-[var(--oh-orange)] hover:text-[var(--oh-orange)]"
          >
            <MinusIcon size={16} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <span className="inline-block min-w-[3ch] rounded-md bg-[var(--oh-primary)] px-3 py-1 text-[22px] font-bold leading-none text-white">
              {input || "0"}
            </span>
          </div>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => step(1)}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--oh-border)] bg-white text-[var(--oh-text-secondary)] transition-colors hover:border-[var(--oh-orange)] hover:text-[var(--oh-orange)]"
          >
            <PlusIcon size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Keypad grid */}
        <div className="grid grid-cols-3 gap-2">
          {keys.map((key) => {
            const isSpecial = key === "." || key === "backspace";
            return (
              <button
                key={key}
                type="button"
                onClick={() => (key === "backspace" ? backspace() : appendDigit(key))}
                className={cn(
                  "flex h-12 cursor-pointer items-center justify-center rounded-[var(--oh-radius)] text-[20px] font-bold transition-colors",
                  isSpecial
                    ? "bg-[var(--oh-primary)] text-white hover:bg-[var(--oh-primary-hover)]"
                    : "border border-[var(--oh-tile-blue-border)] bg-white text-[var(--oh-tile-blue-text)] hover:bg-[var(--oh-tile-blue-bg)]",
                )}
              >
                {key === "backspace" ? (
                  <DeleteIcon size={20} strokeWidth={2} />
                ) : (
                  key
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={confirm}
          className="mt-3 w-full cursor-pointer rounded-full bg-[var(--oh-primary)] py-3 text-[16px] font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)]"
        >
          OK
        </button>
      </div>
    </div>
  );
}
