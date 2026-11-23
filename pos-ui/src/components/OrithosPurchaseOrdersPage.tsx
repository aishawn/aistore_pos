"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, FileText, PackageCheck, Plus, RefreshCw } from "lucide-react";
import { formatAuDate } from "@/lib/au";
import { useApi, useApiList } from "@/hooks/useApi";
import { api } from "@/lib/api";
import { Modal } from "@/components/admin/Modal";
import { CreatePurchaseOrderModal } from "@/components/admin/CreatePurchaseOrderModal";
import {
  DEFAULT_ORDER_FILTERS,
  formatOrderListReference,
  orderFiltersToQuery,
  OrdersFilterPanel,
  purchaseOrderFiltersActive,
  type OrderFilters,
} from "@/components/admin/OrdersFilterPanel";
import { useAuth } from "@/lib/auth";
import { formatPurchaseQuantity } from "@/lib/purchase-quantity";

type Order = {
  id: number | string;
  status?: string;
  invoiceNumber?: string;
  reference?: string;
  fromName?: string;
  toName?: string;
  orderDate?: string;
  dueDate?: string;
  totalCost?: number | null;
  linesTotalCost?: number | null;
  lineCount?: number;
  enteredAs?: string | null;
};

type ReceiptOrder = Order & {
  products?: Array<{
    id: number | string;
    productId: number | string;
    productName?: string;
    caseQuantity?: number;
    orderedQuantity?: number;
    receivedQuantity?: number;
  }>;
};

function statusClass(status?: string) {
  if (status === "RECEIVED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "SENT" || status === "OPEN") return "border-orange-200 bg-orange-50 text-orange-900";
  if (status === "PARTIALLY_RECEIVED") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "CANCELLED") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-sky-200 bg-sky-50 text-sky-800";
}

function headerMismatch(order: Order) {
  if ((order.enteredAs || "").toUpperCase() !== "SHOPFRONT") return false;
  if (order.totalCost == null || order.linesTotalCost == null) return false;
  return Math.abs(Number(order.totalCost) - Number(order.linesTotalCost)) > 0.05;
}

export function OrithosPurchaseOrdersPage({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canReceive = hasPermission("stock.purchases") && hasPermission("stock.receive");
  const [draftFilters, setDraftFilters] = useState<OrderFilters>(() => ({ ...DEFAULT_ORDER_FILTERS }));
  const [appliedFilters, setAppliedFilters] = useState<OrderFilters>(() => ({ ...DEFAULT_ORDER_FILTERS }));
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [receivingOrderId, setReceivingOrderId] = useState<string | number | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [batchesByLine, setBatchesByLine] = useState<Record<string, { id: string; code: string; expiryDate: string; quantity: string }[]>>({});
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const receiptKey = useRef<string | null>(null);
  const receivingOrder = useApi<ReceiptOrder>(receivingOrderId == null ? null : `/api/orders/${receivingOrderId}`);
  const receivingLines = (receivingOrder.data?.products ?? []).filter((line) => Number(line.orderedQuantity ?? 0) > Number(line.receivedQuantity ?? 0));
  const result = useApiList<Order>("/api/orders", {
    page,
    size: 40,
    type: "ORDER",
    ...orderFiltersToQuery(appliedFilters),
  });
  const filtered = purchaseOrderFiltersActive(appliedFilters);

  function applyFilters() {
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  }

  function showAllStatuses() {
    const next = { ...appliedFilters, status: "" };
    setDraftFilters((current) => ({ ...current, status: "" }));
    setAppliedFilters(next);
    setPage(1);
  }

  function clearAppliedFilters(next: OrderFilters) {
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(1);
  }

  async function receiveOrder() {
    const invalidBatch = Object.entries(batchesByLine).some(([id, batches]) => {
      if (!batches.length) return false;
      const quantity = Number(quantities[id]);
      return !Number.isFinite(quantity)
        || batches.some((batch) => !batch.code.trim() || !batch.expiryDate || !(Number(batch.quantity) > 0))
        || Math.abs(batches.reduce((total, batch) => total + Number(batch.quantity), 0) - quantity) > 1e-8;
    });
    if (invalidBatch) {
      setReceiveError("Enter each batch code and expiry date. Batch quantities must add up to the received quantity.");
      return;
    }
    const lines = (receivingOrder.data?.products ?? [])
      .map((line) => ({
        orderProductId: Number(line.id),
        quantity: Number(quantities[line.id] ?? 0),
        batches: (batchesByLine[line.id] ?? []).map(({ code, expiryDate, quantity }) => ({
          code: code.trim(), expiryDate, quantity: Number(quantity),
        })),
      }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    if (!lines.length) {
      setReceiveError("Enter a quantity for at least one line.");
      return;
    }
    const outstandingByLine = new Map(receivingLines.map((line) => [Number(line.id), Number(line.orderedQuantity ?? 0) - Number(line.receivedQuantity ?? 0)]));
    if (lines.some((line) => !outstandingByLine.has(line.orderProductId) || line.quantity > (outstandingByLine.get(line.orderProductId) ?? 0))) {
      setReceiveError("A received quantity cannot exceed the outstanding quantity.");
      return;
    }
    receiptKey.current ??= crypto.randomUUID();
    setReceiveBusy(true);
    setReceiveError(null);
    try {
      await api.post(`/api/orders/${receivingOrderId}/receipts`, { lines }, { headers: { "Idempotency-Key": receiptKey.current } });
      receiptKey.current = null;
      setReceivingOrderId(null);
      setQuantities({});
      setBatchesByLine({});
      result.reload();
    } catch (cause) {
      setReceiveError(cause instanceof Error ? cause.message : "Receipt failed.");
    } finally {
      setReceiveBusy(false);
    }
  }
  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
      <section
        aria-label="Purchase order filters"
        className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] md:p-5"
      >
        <OrdersFilterPanel
          filters={draftFilters}
          onChange={setDraftFilters}
          onFilter={applyFilters}
          hideType
          filtering={result.loading}
          appliedFilters={appliedFilters}
          onAppliedClear={clearAppliedFilters}
        />
      </section>
      {result.error && (
        <div role="alert" className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{result.error}</span>
          <button type="button" onClick={result.reload} className="font-semibold">
            Retry
          </button>
        </div>
      )}
      {!result.loading && !result.error && result.items.length === 0 && (
        <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white p-8 text-center">
          <div>
            <FileText className="mx-auto text-[var(--oh-primary)]" size={28} />
            <h2 className="mt-3 text-sm font-semibold">
              {filtered ? "No matching purchase orders" : "No Orithos purchase orders"}
            </h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">
              {filtered
                ? "Try All statuses or clear the search — Outstanding only shows open, sent, and partially received orders."
                : "Create a purchase order to begin receiving stock."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              {appliedFilters.status === "OUTSTANDING" && (
                <button
                  type="button"
                  onClick={showAllStatuses}
                  className="text-sm font-semibold text-[var(--oh-primary)] hover:underline"
                >
                  Show all statuses
                </button>
              )}
              {filtered && (
                <button
                  type="button"
                  onClick={() => clearAppliedFilters({ ...DEFAULT_ORDER_FILTERS })}
                  className="text-sm font-semibold text-[var(--oh-primary)] hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {result.items.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-3">
            <p className="text-sm text-[var(--oh-muted)]">
              <span className="font-semibold tabular-nums text-[var(--oh-text)]">{result.total}</span> purchase orders
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={result.reload}
                disabled={result.loading}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] disabled:opacity-60"
              >
                <RefreshCw size={16} className={result.loading ? "animate-spin" : ""} aria-hidden />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)]"
              >
                <Plus size={16} aria-hidden />
                New purchase order
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)] shadow-[inset_0_-1px_0_var(--oh-border)]">
              <tr>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Invoice Number</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--oh-border)]">
              {result.items.map((order) => {
                const mismatch = headerMismatch(order);
                const lineCount = order.lineCount ?? 0;
                const reference = formatOrderListReference(order.reference);
                const mismatchTitle = mismatch
                  ? `Order header total differs from ordered line total ($${Number(order.linesTotalCost).toFixed(2)}). Totals can include received items, tax, and freight.`
                  : undefined;
                return (
                  <tr key={order.id} className="hover:bg-[var(--oh-surface)]">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--oh-text)]">{order.fromName || "—"}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Supplier</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-[var(--oh-text)]">{order.toName || "—"}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Outlet</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      <p className="font-medium text-[var(--oh-text)]">{order.orderDate ? formatAuDate(order.orderDate) : "—"}</p>
                      {order.dueDate && (
                        <p className="mt-1 text-xs text-[var(--oh-muted)]">
                          Due <span className="tabular-nums text-[var(--oh-text-secondary)]">{formatAuDate(order.dueDate)}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Link
                          href={`/orders/${order.id}/view`}
                          className="font-semibold tabular-nums text-[var(--oh-primary)] hover:underline"
                        >
                          {order.invoiceNumber || `Order ${order.id}`}
                        </Link>
                        {mismatch && (
                          <span title={mismatchTitle} className="inline-flex shrink-0">
                            <AlertTriangle size={15} className="text-amber-700" aria-label={mismatchTitle} />
                          </span>
                        )}
                      </div>
                      {reference && (
                        <p className="mt-0.5 max-w-[14rem] truncate text-xs text-[var(--oh-muted)]" title={reference.full}>
                          {reference.short}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <p className="font-semibold text-[var(--oh-text)]">
                        {order.totalCost == null ? "—" : `$${Number(order.totalCost).toFixed(2)}`}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                        {lineCount} {lineCount === 1 ? "line" : "lines"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(order.status)}`}>
                        {order.status || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        <Link href={`/orders/${order.id}/view`} className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-[var(--oh-primary)] hover:underline">
                          <Eye size={15} aria-hidden />
                          View
                        </Link>
                        {canReceive && ["OPEN", "SENT", "PARTIALLY_RECEIVED"].includes(order.status ?? "") && (
                          <button
                            type="button"
                            onClick={() => {
                              receiptKey.current = null;
                              setReceivingOrderId(order.id);
                              setReceiveError(null);
                              setQuantities({});
                              setBatchesByLine({});
                            }}
                            className="inline-flex min-h-9 items-center gap-1.5 font-semibold text-emerald-700 hover:underline"
                          >
                            <PackageCheck size={15} aria-hidden />
                            Receive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </section>
      )}
      {result.total > 40 && (
        <nav aria-label="Purchase orders pagination" className="flex items-center justify-between text-sm text-[var(--oh-muted)]">
          <span>
            Page {page} · {result.total} orders
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page === 1 || result.loading}
              className="min-h-10 rounded-md border px-3 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => value + 1)}
              disabled={page * 40 >= result.total || result.loading}
              className="min-h-10 rounded-md border px-3 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </nav>
      )}
      {createOpen && <CreatePurchaseOrderModal onClose={() => setCreateOpen(false)} onCreated={(order) => router.push(`/orders/${order.id}/view`)} />}
      {receivingOrderId != null && (
        <Modal
          title={`Receive ${receivingOrder.data?.invoiceNumber || "purchase order"}`}
          onClose={receiveBusy ? () => undefined : () => setReceivingOrderId(null)}
          footer={<><button type="button" disabled={receiveBusy} onClick={() => setReceivingOrderId(null)} className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold disabled:opacity-50">Cancel</button><button type="button" disabled={receiveBusy || receivingOrder.loading || receivingLines.length === 0} onClick={() => void receiveOrder()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"><PackageCheck size={16} />{receiveBusy ? "Recording…" : "Record receipt"}</button></>}
        >
          {receivingOrder.loading && <p role="status" className="text-sm text-[var(--oh-muted)]">Loading order lines…</p>}
          {receivingOrder.error && <p role="alert" className="text-sm text-rose-700">{receivingOrder.error}</p>}
          {receivingOrder.data && <div className="space-y-3">
            {receivingLines.map((line) => {
              const outstanding = Number(line.orderedQuantity ?? 0) - Number(line.receivedQuantity ?? 0);
              const batches = batchesByLine[line.id] ?? [];
              return <div key={line.id} className="space-y-2 border-b border-[var(--oh-border)] pb-3">
                <label className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium">{line.productName || `Product ${line.productId}`}</span><span className="text-xs text-[var(--oh-muted)]">Outstanding {formatPurchaseQuantity(outstanding, line.caseQuantity)}</span></span>
                <input type="number" min="0" max={outstanding} step="0.0001" inputMode="decimal" aria-label={`Receive items for ${line.productName || line.productId}`} value={quantities[line.id] ?? ""} onChange={(event) => { receiptKey.current = null; setQuantities((current) => ({ ...current, [line.id]: event.target.value })); }} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-3 text-right tabular-nums" />
                </label>
                {batches.map((batch, index) => (
                  <fieldset key={batch.id} disabled={receiveBusy} className="grid gap-2 rounded-md bg-[var(--oh-surface)] p-2 sm:grid-cols-3">
                    <legend className="px-1 text-xs font-semibold">Batch {index + 1}</legend>
                    {(["code", "expiryDate", "quantity"] as const).map((field) => (
                      <label key={field} className="min-w-0 text-xs">
                        {{ code: "Batch code", expiryDate: "Expiry date", quantity: "Received quantity" }[field]}
                        <input
                          type={{ code: "text", expiryDate: "date", quantity: "number" }[field]}
                          maxLength={field === "code" ? 120 : undefined}
                          step={field === "quantity" ? "0.0001" : undefined}
                          className="mt-1 h-10 w-full rounded-md border border-[var(--oh-border)] px-2 text-sm"
                          value={batch[field]}
                          onChange={(event) => {
                            receiptKey.current = null;
                            const value = event.target.value;
                            setBatchesByLine((current) => ({
                              ...current,
                              [line.id]: current[line.id].map((entry) => entry.id === batch.id ? { ...entry, [field]: value } : entry),
                            }));
                          }}
                        />
                      </label>
                    ))}
                    <button type="button" onClick={() => {
                      receiptKey.current = null;
                      setBatchesByLine((current) => ({
                        ...current, [line.id]: current[line.id].filter((entry) => entry.id !== batch.id),
                      }));
                    }} className="justify-self-start px-1 py-2 text-xs font-semibold">Remove batch</button>
                  </fieldset>
                ))}
                <button type="button" disabled={receiveBusy} onClick={() => {
                  receiptKey.current = null;
                  const batch = { id: crypto.randomUUID(), code: "", expiryDate: "", quantity: "" };
                  setBatchesByLine((current) => ({ ...current, [line.id]: [...(current[line.id] ?? []), batch] }));
                }} className="px-1 py-2 text-xs font-semibold text-[var(--oh-primary)]">Add batch and expiry</button>
              </div>;
            })}
          </div>}
          {receiveError && <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{receiveError}</p>}
        </Modal>
      )}
    </div>
  );
  if (embedded) return body;
  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock management · Orithos</p>
        <h1 className="oh-type-title mt-1">Purchases</h1>
        <p className="mt-1 text-sm text-[var(--oh-muted)]">Create orders, receive stock, and track suppliers — not spend reporting.</p>
      </header>
      {body}
    </main>
  );
}
