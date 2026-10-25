"use client";

import { Archive, Clock3, RotateCcw } from "lucide-react";
import { money, provisionalLineUnit, type ParkedOdooSale } from "./shared";

type OdooSellParkedListProps = {
  sales: ParkedOdooSale[];
  formatDate: (value: string, timezone?: string) => string;
  onResume: (sale: ParkedOdooSale) => void;
  onDiscard: (saleId: string) => void;
};

export function OdooSellParkedList({ sales, formatDate, onResume, onDiscard }: OdooSellParkedListProps) {
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 text-xs leading-5 text-[var(--oh-text-secondary)]">
        <Clock3 size={15} className="mt-0.5 shrink-0" />
        Parked sales are saved on this terminal.
      </p>
      {sales.length ? (
        <div className="grid gap-2">
          {sales.map((sale) => {
            const parkedQty = sale.lines.reduce((sum, line) => sum + line.quantity, 0);
            const parkedTotal = sale.lines.reduce(
              (sum, line) => sum + provisionalLineUnit(line.product, line.packFactor || 1) * line.quantity,
              0,
            );
            return (
              <article key={sale.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-[var(--oh-text)]">{sale.customer?.name ?? "Walk-in customer"}</h3>
                  <p className="mt-0.5 text-xs text-[var(--oh-text-secondary)]">
                    {formatDate(sale.createdAt, sale.timezone)} · {sale.registerName}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--oh-text)]">
                    {parkedQty} {parkedQty === 1 ? "item" : "items"} · {money(parkedTotal)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onResume(sale)}
                    className="inline-flex h-11 min-w-[7.5rem] items-center justify-center gap-2 rounded-md bg-[var(--sf-cta)] px-3 text-sm font-semibold text-white hover:bg-[var(--sf-cta-hover)]"
                  >
                    <RotateCcw size={15} /> Resume
                  </button>
                  <button
                    type="button"
                    onClick={() => onDiscard(sale.id)}
                    className="h-11 px-2 text-sm font-medium text-[var(--oh-muted)] underline-offset-2 hover:text-red-700 hover:underline"
                  >
                    Discard
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid place-items-center py-10 text-center">
          <Archive size={24} className="mx-auto text-[var(--oh-border-strong)]" />
          <p className="mt-2 text-sm font-medium text-[var(--oh-text)]">No parked sales</p>
          <p className="mt-1 text-[13px] text-[var(--oh-muted)]">Park the current cart to resume it later from this list</p>
        </div>
      )}
    </div>
  );
}
