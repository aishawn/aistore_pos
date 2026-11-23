"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ReceiptBatchEditor, receiptBatchPayload, type ReceiptBatchDraft } from "@/components/ReceiptBatchEditor";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { AsyncState } from "@/components/admin/AsyncState";
import { ArrowLeftIcon, EditIcon } from "@/components/icons";
import { formatAuDate } from "@/lib/au";
import { formatPurchaseQuantity } from "@/lib/purchase-quantity";

interface OrderProduct {
  id: string;
  productId: string | number;
  supplierCode?: string;
  caseQuantity?: number;
  orderedQuantity?: number;
  receivedQuantity?: number;
  orderedCost?: number;
}

interface OrderDetail {
  id: string;
  type: string;
  status: string;
  fromId?: string | number;
  toId?: string | number;
  fromName?: string;
  toName?: string;
  orderDate?: string;
  dueDate?: string;
  invoiceNumber?: string;
  reference?: string;
  notes?: string;
  internalNotes?: string;
  expectedTotal?: number;
  totalCost?: number;
  lineCount?: number;
  products?: OrderProduct[];
  receivedBatches?: {
    receiptId: number;
    orderProductId: number;
    batchCode: string;
    expiryDate: string;
    inventoryQuantity: number;
  }[];
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: "border border-blue-200 bg-blue-50 text-blue-700",
  SENT: "border border-indigo-200 bg-indigo-50 text-indigo-700",
  RECEIVED: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  CANCELLED: "border border-[var(--oh-border)] bg-[var(--oh-surface-muted)] text-[var(--oh-muted)]",
  OUTSTANDING: "border border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] text-[var(--oh-tile-orange-text)]",
};

function money(x?: number | null) {
  if (x === null || x === undefined) return "—";
  return `$${Number(x).toFixed(2)}`;
}

function display(value?: string | number | null) {
  if (value === null || value === undefined) return "—";
  const str = String(value).trim();
  return str ? str : "—";
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--oh-muted)]">{label}</p>
      <p className="mt-1.5 break-words text-sm font-medium leading-5 text-[var(--oh-text)]">{value}</p>
    </div>
  );
}

function PurchaseReceiptPanel({ order, onReceived }: { order: OrderDetail; onReceived: () => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [batchesByLine, setBatchesByLine] = useState<Record<string, ReceiptBatchDraft[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const outstanding = (order.products ?? []).filter((line) => Number(line.orderedQuantity ?? 0) > Number(line.receivedQuantity ?? 0));
  if (order.type !== "ORDER" || !["OPEN", "SENT", "PARTIALLY_RECEIVED"].includes(order.status) || !outstanding.length) return null;

  async function receive() {
    let lines;
    try {
      lines = outstanding.map((line) => {
        const quantity = Number(quantities[line.id] ?? 0);
        return { orderProductId: Number(line.id), quantity, batches: receiptBatchPayload(batchesByLine[line.id] ?? [], quantity) };
      }).filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid batch quantities.");
      return;
    }
    if (!lines.length) {
      setError("Enter a quantity for at least one line.");
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.post<{ status: string }>(`/api/orders/${order.id}/receipts`, { lines }, {
        headers: { "Idempotency-Key": idempotencyKey.current },
      });
      idempotencyKey.current = null;
      setQuantities({});
      setBatchesByLine({});
      setSuccess(result.status === "RECEIVED" ? "Purchase order fully received." : "Partial receipt recorded.");
      onReceived();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Receipt failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="receive-stock-heading" className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
      <div className="flex items-center gap-2 border-b border-[var(--oh-border)] px-4 py-3">
        <PackageCheck size={17} className="text-[var(--oh-primary)]" />
        <h2 id="receive-stock-heading" className="text-sm font-semibold">Receive stock</h2>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-[1fr_100px] gap-3 text-xs font-semibold text-[var(--oh-muted)]"><span>Product ID · outstanding</span><span>Receive items</span></div>
        {outstanding.map((line) => {
          const remaining = Number(line.orderedQuantity ?? 0) - Number(line.receivedQuantity ?? 0);
          return <div key={line.id} className="space-y-2">
            <label className="grid grid-cols-[1fr_100px] items-center gap-3 text-sm">
            <span className="min-w-0 truncate">{display(line.productId)} · {formatPurchaseQuantity(remaining, line.caseQuantity)}</span>
            <input type="number" min="0" max={remaining} step="0.0001" inputMode="decimal" aria-label={`Receive quantity for product ${line.productId}`} value={quantities[line.id] ?? ""} onChange={(event) => {
              idempotencyKey.current = null;
              setQuantities((current) => ({ ...current, [line.id]: event.target.value }));
            }} className="h-10 w-full rounded-md border border-[var(--oh-border)] px-2 text-right tabular-nums" />
            </label>
            <ReceiptBatchEditor batches={batchesByLine[line.id] ?? []} disabled={busy} onChange={(next) => {
              idempotencyKey.current = null;
              setBatchesByLine((current) => ({ ...current, [line.id]: next }));
            }} />
          </div>;
        })}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
        <button type="button" onClick={() => void receive()} disabled={busy} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-60">
          <PackageCheck size={16} /> {busy ? "Recording…" : "Record receipt"}
        </button>
      </div>
    </section>
  );
}

export function OrderViewPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data: order, loading, error, reload } = useApi<OrderDetail>(
    orderId ? `/api/orders/${orderId}` : null,
  );

  const products = order?.products ?? [];
  const lineCount = order?.lineCount ?? products.length;
  const invoiceScanId = order?.reference?.match(/\bInvoice scan #(\d+)/i)?.[1];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/orders")}
            aria-label="Back to orders"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--oh-border)] text-[var(--oh-text-secondary)] transition-colors hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
          >
            <ArrowLeftIcon size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="oh-type-title truncate text-[var(--oh-text)]">
                {order?.invoiceNumber ? `Order ${order.invoiceNumber}` : "View Order"}
              </h1>
              {order?.status && (
                <span
                  className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[11px] font-bold tracking-wide ${STATUS_STYLES[order.status] ?? "border border-[var(--oh-border)] bg-[var(--oh-surface-muted)] text-[var(--oh-text-secondary)]"}`}
                >
                  {order.status}
                </span>
              )}
            </div>
            <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Order details and line items</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/orders/${orderId}/edit`)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--oh-primary)] px-4 text-sm font-semibold text-[var(--oh-primary)] transition-colors hover:bg-[var(--oh-primary)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        >
          <EditIcon size={16} />
          Edit order
        </button>
      </header>

      <main aria-busy={loading} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-5">
          <AsyncState loading={loading} error={error} empty={!order} onRetry={reload}>
            {order && (
              <>
                <section aria-labelledby="order-summary-heading" className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)]">
                  <div className="border-b border-[var(--oh-border)] px-4 py-3.5 sm:px-5">
                    <h2 id="order-summary-heading" className="text-sm font-semibold text-[var(--oh-text)]">Order summary</h2>
                  </div>
                  <div className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
                    <DetailField label="Type" value={display(order.type)} />
                    <DetailField label="From" value={display(order.fromName || order.fromId)} />
                    <DetailField label="To" value={display(order.toName || order.toId)} />
                    <DetailField label="Order date" value={display(formatAuDate(order.orderDate))} />
                    <DetailField label="Due date" value={display(formatAuDate(order.dueDate))} />
                    <DetailField label="Reference" value={<>{display(order.reference)}{invoiceScanId && <><span className="px-2 text-[var(--oh-muted)]">·</span><Link href={`/invoices/${invoiceScanId}`} className="font-semibold text-[var(--oh-primary)] hover:underline">Open invoice scan</Link></>}</>} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] bg-[var(--oh-surface)]/70 p-4 sm:grid-cols-3 sm:px-5">
                    <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3">
                      <p className="text-xs font-medium text-[var(--oh-muted)]">Expected total</p>
                      <p className="mt-1 text-base font-semibold tabular-nums text-[var(--oh-text)]">{money(order.expectedTotal)}</p>
                    </div>
                    <div className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3">
                      <p className="text-xs font-medium text-[var(--oh-muted)]">Total cost</p>
                      <p className="mt-1 text-base font-semibold tabular-nums text-[var(--oh-text)]">{money(order.totalCost)}</p>
                    </div>
                    <div className="col-span-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 sm:col-span-1">
                      <p className="text-xs font-medium text-[var(--oh-muted)]">Line items</p>
                      <p className="mt-1 text-base font-semibold tabular-nums text-[var(--oh-text)]">{lineCount}</p>
                    </div>
                  </div>
                  {(order.notes || order.internalNotes) && (
                    <div className="grid gap-4 border-t border-[var(--oh-border)] p-4 sm:grid-cols-2 sm:p-5">
                      {order.notes && <DetailField label="Public notes" value={order.notes} />}
                      {order.internalNotes && <DetailField label="Internal notes" value={order.internalNotes} />}
                    </div>
                  )}
                </section>

                <section aria-labelledby="line-items-heading" className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-3.5 sm:px-5">
                    <div>
                      <h2 id="line-items-heading" className="text-sm font-semibold text-[var(--oh-text)]">Line items</h2>
                      <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Products included in this order</p>
                    </div>
                    <span className="rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--oh-text-secondary)]">
                      {products.length} {products.length === 1 ? "item" : "items"}
                    </span>
                  </div>
                  {products.length === 0 ? (
                    <div className="px-4 py-10 text-center sm:py-12">
                      <p className="text-sm font-medium text-[var(--oh-text-secondary)]">No line items on this order</p>
                      <p className="mt-1 text-xs text-[var(--oh-muted)]">Product details will appear here when they are added.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                        <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-text-secondary)]">
                          <tr>
                            <th scope="col" className="px-4 py-3 sm:px-5">Product ID</th>
                            <th scope="col" className="px-4 py-3">Supplier code</th>
                            <th scope="col" className="px-4 py-3 text-right">Ordered</th>
                            <th scope="col" className="px-4 py-3 text-right">Received</th>
                            <th scope="col" className="px-4 py-3 text-right sm:px-5">Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--oh-border)]">
                          {products.map((product) => (
                            <tr key={product.id} className="transition-colors hover:bg-[var(--oh-surface)]/60">
                              <td className="px-4 py-3.5 font-medium text-[var(--oh-text)] sm:px-5">{display(product.productId)}</td>
                              <td className="px-4 py-3.5 text-[var(--oh-text-secondary)]">{display(product.supplierCode)}</td>
                              <td className="px-4 py-3.5 text-right tabular-nums text-[var(--oh-text)]">{formatPurchaseQuantity(product.orderedQuantity, product.caseQuantity)}</td>
                              <td className="px-4 py-3.5 text-right tabular-nums text-[var(--oh-text)]">{formatPurchaseQuantity(product.receivedQuantity, product.caseQuantity)}</td>
                              <td className="px-4 py-3.5 text-right font-medium tabular-nums text-[var(--oh-text)] sm:px-5">{money(product.orderedCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                {!!order.receivedBatches?.length && (
                  <section aria-labelledby="received-batches-heading" className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 sm:p-5">
                    <h2 id="received-batches-heading" className="text-sm font-semibold">Received batches</h2>
                    <ul className="mt-2 divide-y divide-[var(--oh-border)]">
                      {order.receivedBatches.map((batch) => {
                        const product = products.find((line) => String(line.id) === String(batch.orderProductId));
                        return (
                          <li key={JSON.stringify([batch.receiptId, batch.orderProductId, batch.batchCode])} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
                            <span className="break-all font-medium">{batch.batchCode}</span>
                            <span className="text-[var(--oh-text-secondary)]">
                              Product {product?.productId ?? "—"} · Receipt {batch.receiptId} · Expires {formatAuDate(batch.expiryDate)} · {formatPurchaseQuantity(batch.inventoryQuantity, 1)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                <PurchaseReceiptPanel order={order} onReceived={reload} />
              </>
            )}
          </AsyncState>
        </div>
      </main>
    </div>
  );
}
