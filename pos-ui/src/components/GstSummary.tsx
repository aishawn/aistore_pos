"use client";

import { includedGst, roundCashToFiveCents } from "@/lib/au";

export function GstSummary({
  total,
  gst,
  pricesIncludeGst,
  onTogglePrices,
  showCash,
}: {
  total: number;
  /** When omitted, GST is estimated at 10% of the inclusive total. */
  gst?: number | null;
  pricesIncludeGst: boolean;
  onTogglePrices?: (include: boolean) => void;
  /** Show the nearest-5c cash due. Card tenders stay on the exact total. */
  showCash?: boolean;
}) {
  const gstAmount = gst != null && Number.isFinite(gst) ? gst : includedGst(total);
  const exGst = Math.round((total - gstAmount) * 100) / 100;
  const cashDue = roundCashToFiveCents(total);
  const rounding = Math.round((cashDue - total) * 100) / 100;
  const primary = pricesIncludeGst ? total : exGst;

  return (
    <div className="space-y-1 text-[13px] text-[var(--oh-text-secondary)]">
      {onTogglePrices && (
        <label className="mb-1 flex cursor-pointer items-center justify-between gap-3 text-[12px]">
          <span>Prices include GST</span>
          <input
            type="checkbox"
            checked={pricesIncludeGst}
            onChange={(e) => onTogglePrices(e.target.checked)}
            className="h-4 w-4 accent-[var(--oh-orange)]"
          />
        </label>
      )}
      <div className="flex justify-between">
        <span>Subtotal ex GST</span>
        <span>${exGst.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>GST</span>
        <span>${gstAmount.toFixed(2)}</span>
      </div>
      <div className="flex justify-between font-semibold text-[var(--oh-text)]">
        <span>{pricesIncludeGst ? "Total incl. GST" : "Total ex GST"}</span>
        <span>${primary.toFixed(2)}</span>
      </div>
      <p className="text-[12px] text-[var(--oh-muted)]">Total includes GST of ${gstAmount.toFixed(2)}</p>
      {showCash && rounding !== 0 && (
        <div className="flex justify-between">
          <span>Cash rounding</span>
          <span>
            {rounding > 0 ? "+" : ""}${rounding.toFixed(2)}
          </span>
        </div>
      )}
      {showCash && (
        <div className="flex justify-between font-semibold text-[var(--oh-text)]">
          <span>Cash due</span>
          <span>${cashDue.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
