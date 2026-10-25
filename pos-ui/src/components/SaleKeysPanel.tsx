"use client";

import { SaleKeySellGrid } from "@/components/SaleKeySellGrid";
import type { SaleKeyHandler } from "@/lib/sale-key-actions";
import type { SaleKey } from "@/types/orithos";

interface SaleKeysPanelProps {
  keys: SaleKey[];
  setName: string;
  loading: boolean;
  error: string | null;
  cartEmpty: boolean;
  sell: SaleKeyHandler;
}

export function SaleKeysPanel({
  keys,
  setName,
  loading,
  error,
  cartEmpty,
  sell,
}: SaleKeysPanelProps) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
          Sale keys
        </p>
        <span className="text-[13px] text-[var(--oh-muted)]">{setName}</span>
      </div>
      <div className="overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-gradient-to-b from-[var(--oh-surface-elevated)] to-[var(--oh-surface)] p-2.5 shadow-[var(--oh-shadow-card)]">
        {loading ? (
          <div className="flex h-[160px] w-full items-center justify-center text-[13px] text-[var(--oh-muted)]">
            Loading sale keys…
          </div>
        ) : (
          <>
            {error && (
              <p className="mb-2 text-center text-[13px] text-[var(--oh-muted)]">
                Using saved or default layout
              </p>
            )}
            <SaleKeySellGrid keys={keys} cartEmpty={cartEmpty} sell={sell} />
          </>
        )}
      </div>
    </div>
  );
}
