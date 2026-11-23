"use client";

import Link from "next/link";
import { useState } from "react";
import { receiptDateTypeLabel, type ReceiptDateType } from "@/components/ReceiptBatchEditor";
import { useApi } from "@/hooks/useApi";
import { formatAuDate } from "@/lib/au";
import { formatPurchaseQuantity } from "@/lib/purchase-quantity";

interface Review {
  businessDate: string;
  throughDate: string;
  truncated: boolean;
  page: number;
  coverage?: { receivedLines: number; linesWithoutBatches: number };
  batches: {
    orderId: number;
    receiptLineId: number;
    productId: number;
    productName: string | null;
    batchCode: string;
    expiryDate: string;
    dateType?: ReceiptDateType | null;
    receivedUnits: number;
  }[];
}

export function ReceiptExpiryReview({ initialStatus }: { initialStatus: "all" | "upcoming" | "expired" }) {
  const [status, setStatus] = useState<string>(initialStatus);
  const [page, setPage] = useState(1);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcode, setBarcode] = useState("");
  const { data, loading, error, reload } = useApi<Review>("/api/orders/expiry-review", { status, page, barcode: barcode || undefined });
  return (
    <section aria-labelledby="expiry-review-heading" className="m-4 rounded-xl border border-[var(--oh-border)] bg-white p-4 sm:m-6 sm:p-5">
      <h2 id="expiry-review-heading" className="text-base font-semibold">Batches to check on the shelf</h2>
      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        Expiry status
        <select
          className="min-h-10 rounded-md border border-[var(--oh-border)] bg-white px-2"
          value={status}
          disabled={loading}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All batches in review</option>
          <option value="upcoming">Due within 14 days</option>
          <option value="expired">Past label date</option>
        </select>
      </label>
      <form className="mt-3 flex flex-wrap items-end gap-2 text-sm" onSubmit={(event) => {
        event.preventDefault();
        setBarcode(barcodeInput.trim());
        setPage(1);
      }}>
        <label className="grid gap-1">
          Product barcode
          <input
            type="search"
            autoComplete="off"
            maxLength={128}
            placeholder="Scan or enter barcode"
            value={barcodeInput}
            onChange={(event) => setBarcodeInput(event.target.value)}
            className="min-h-10 rounded-md border border-[var(--oh-border)] bg-white px-2"
          />
        </label>
        <button type="submit" className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 font-semibold">Find batches</button>
        {barcode && (
          <button type="button" className="min-h-10 underline" onClick={() => {
            setBarcodeInput("");
            setBarcode("");
            setPage(1);
          }}>Clear barcode</button>
        )}
      </form>
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
            {status === "expired"
              ? <>Shows received batches dated before {formatAuDate(data.businessDate)}.</>
              : <>Shows received batches expiring through {formatAuDate(data.throughDate)}.</>}{" "}
            Check remaining quantities on the shelf.
          </p>
          {barcode && <p className="mt-2 break-all text-sm">Showing batches for barcode {barcode}.</p>}
          {!data.batches.length && (
            <p className="mt-4 text-sm">
              {data.coverage?.receivedLines === 0
                ? "No Orithos receipts with stock lines have been recorded for this store."
                : "No recorded batches match this filter."}
            </p>
          )}
          {data.coverage && data.coverage.linesWithoutBatches > 0 && (
            <p className="mt-3 text-sm">
              {data.coverage.linesWithoutBatches} of {data.coverage.receivedLines} receipt lines have no batch details.
              Check the labels on the shelf and record batch details on future receipts where applicable.
            </p>
          )}
          <ul className="mt-2 divide-y divide-[var(--oh-border)]">
            {data.batches.map((batch) => (
              <li key={JSON.stringify([batch.receiptLineId, batch.batchCode])} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium">{batch.productName || `Product ${batch.productId}`}</p>
                  <p className="break-all text-[var(--oh-muted)]">Batch {batch.batchCode} · Received {formatPurchaseQuantity(batch.receivedUnits)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={batch.expiryDate < data.businessDate ? "font-semibold text-rose-800" : "font-medium"}>
                    {receiptDateTypeLabel(batch.dateType)} · {formatAuDate(batch.expiryDate)}
                    {batch.expiryDate < data.businessDate ? " · Past date" : ""}
                  </span>
                  <Link className="inline-flex min-h-10 items-center font-semibold text-[var(--oh-primary)] underline" href={`/orders/${batch.orderId}/view`} aria-label={`View purchase order ${batch.orderId}`}>View order</Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {(page > 1 || data?.truncated) && (
        <nav aria-label="Expiry review pages" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <button type="button" className="min-h-10 underline disabled:no-underline disabled:opacity-50"
            disabled={page === 1 || loading} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page}</span>
          <button type="button" className="min-h-10 underline disabled:no-underline disabled:opacity-50"
            disabled={loading || Boolean(error) || data?.page !== page || !data.truncated}
            onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}
    </section>
  );
}
