"use client";

import Link from "next/link";
import { useApi } from "@/hooks/useApi";
import { formatAuDate } from "@/lib/au";
import { formatPurchaseQuantity } from "@/lib/purchase-quantity";

interface Review {
  businessDate: string;
  throughDate: string;
  truncated: boolean;
  batches: {
    orderId: number;
    receiptLineId: number;
    productId: number;
    productName: string | null;
    batchCode: string;
    expiryDate: string;
    receivedUnits: number;
  }[];
}

export function ReceiptExpiryReview() {
  const { data, loading, error, reload } = useApi<Review>("/api/orders/expiry-review");
  return (
    <section aria-labelledby="expiry-review-heading" className="m-4 rounded-xl border border-[var(--oh-border)] bg-white p-4 sm:m-6 sm:p-5">
      <h2 id="expiry-review-heading" className="text-base font-semibold">Batches to check on the shelf</h2>
      {loading && <p role="status" className="mt-2 text-sm">Loading received batches…</p>}
      {error && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <p role="alert">{error}</p>
          <button type="button" onClick={reload} className="min-h-10 font-semibold underline">Retry</button>
        </div>
      )}
      {!loading && !error && data && (
        <>
          <p className="mt-2 text-sm text-[var(--oh-muted)]">
            Shows received batches expiring through {formatAuDate(data.throughDate)}. Check remaining quantities on the shelf.
          </p>
          {!data.batches.length && <p className="mt-4 text-sm">No recorded batches in this review period.</p>}
          {data.truncated && <p className="mt-3 text-sm font-medium">Showing the 100 earliest records.</p>}
          <ul className="mt-2 divide-y divide-[var(--oh-border)]">
            {data.batches.map((batch) => (
              <li key={JSON.stringify([batch.receiptLineId, batch.batchCode])} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium">{batch.productName || `Product ${batch.productId}`}</p>
                  <p className="break-all text-[var(--oh-muted)]">Batch {batch.batchCode} · Received {formatPurchaseQuantity(batch.receivedUnits)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={batch.expiryDate < data.businessDate ? "font-semibold text-rose-800" : "font-medium"}>
                    {batch.expiryDate < data.businessDate ? "Expired" : "Expires"} {formatAuDate(batch.expiryDate)}
                  </span>
                  <Link className="inline-flex min-h-10 items-center font-semibold text-[var(--oh-primary)] underline" href={`/orders/${batch.orderId}/view`} aria-label={`View purchase order ${batch.orderId}`}>View order</Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
