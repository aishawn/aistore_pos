"use client";

import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { AsyncState } from "@/components/admin/AsyncState";
import { ArrowLeftIcon, EditIcon } from "@/components/icons";
import { formatAuDate } from "@/lib/au";

interface OrderProduct {
  id: string;
  productId: string | number;
  supplierCode?: string;
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

export function OrderViewPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data: order, loading, error, reload } = useApi<OrderDetail>(
    orderId ? `/api/orders/${orderId}` : null,
  );

  const products = order?.products ?? [];
  const lineCount = order?.lineCount ?? products.length;

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
                    <DetailField label="Reference" value={display(order.reference)} />
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
                              <td className="px-4 py-3.5 text-right tabular-nums text-[var(--oh-text)]">{product.orderedQuantity ?? "—"}</td>
                              <td className="px-4 py-3.5 text-right tabular-nums text-[var(--oh-text)]">{product.receivedQuantity ?? "—"}</td>
                              <td className="px-4 py-3.5 text-right font-medium tabular-nums text-[var(--oh-text)] sm:px-5">{money(product.orderedCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}
          </AsyncState>
        </div>
      </main>
    </div>
  );
}
