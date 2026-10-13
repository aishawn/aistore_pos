"use client";

import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { AsyncState } from "@/components/admin/AsyncState";
import { ListTable } from "@/components/admin/ListTable";
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
  OPEN: "bg-[var(--oh-primary)]",
  SENT: "bg-[var(--oh-tile-blue-text)]",
  RECEIVED: "bg-[var(--oh-success)]",
  CANCELLED: "bg-neutral-400",
  OUTSTANDING: "bg-[var(--oh-orange)]",
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
    <div>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">{label}</p>
      <p className="mt-1 text-[15px] text-[var(--oh-text)]">{value}</p>
    </div>
  );
}

export function OrderViewPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data: order, loading, error } = useApi<OrderDetail>(
    orderId ? `/api/orders/${orderId}` : null,
  );

  const products = order?.products ?? [];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="shrink-0 border-b border-[var(--oh-border)] bg-white px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/orders")}
              className="flex cursor-pointer items-center gap-1.5 text-[14px] font-medium text-[var(--oh-text-secondary)] hover:text-[var(--oh-text)]"
            >
              <ArrowLeftIcon size={16} />
              Back
            </button>
            <h1 className="text-[20px] font-semibold text-[var(--oh-text)]">
              {order?.invoiceNumber ? `Order ${order.invoiceNumber}` : "View Order"}
            </h1>
            {order?.status && (
              <span
                className={`rounded px-2 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-white ${STATUS_STYLES[order.status] ?? "bg-neutral-500"}`}
              >
                {order.status}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push(`/orders/${orderId}/edit`)}
            className="flex cursor-pointer items-center gap-2 rounded border border-[var(--oh-success)] px-4 py-2 text-[14px] font-medium text-[var(--oh-success)] transition-colors hover:bg-[var(--oh-success)]/5"
          >
            <EditIcon size={16} />
            Edit
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--oh-surface)] p-6">
        <AsyncState loading={loading} error={error} empty={!order}>
          {order && (
            <div className="mx-auto max-w-5xl space-y-6">
              <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailField label="Type" value={display(order.type)} />
                  <DetailField label="From" value={display(order.fromName || order.fromId)} />
                  <DetailField label="To" value={display(order.toName || order.toId)} />
                  <DetailField label="Order Date" value={display(formatAuDate(order.orderDate))} />
                  <DetailField label="Due Date" value={display(formatAuDate(order.dueDate))} />
                  <DetailField label="Reference" value={display(order.reference)} />
                  <DetailField label="Expected Total" value={money(order.expectedTotal)} />
                  <DetailField label="Total Cost" value={money(order.totalCost)} />
                  <DetailField label="Line Count" value={String(order.lineCount ?? products.length)} />
                </div>
                {(order.notes || order.internalNotes) && (
                  <div className="mt-5 grid gap-5 border-t border-[var(--oh-border)] pt-5 sm:grid-cols-2">
                    <DetailField label="Public Notes" value={display(order.notes)} />
                    <DetailField label="Internal Notes" value={display(order.internalNotes)} />
                  </div>
                )}
              </div>

              <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
                <h2 className="mb-4 text-[15px] font-semibold text-[var(--oh-text)]">Line Items</h2>
                {products.length === 0 ? (
                  <div className="py-8 text-center text-[16px] text-neutral-500">
                    No line items on this order.
                  </div>
                ) : (
                  <ListTable
                    columns={[
                      { label: "Product ID" },
                      { label: "Supplier Code" },
                      { label: "Ordered Qty", align: "right" },
                      { label: "Received Qty", align: "right" },
                      { label: "Cost", align: "right" },
                    ]}
                    rows={products.map((p) => [
                      display(p.productId),
                      display(p.supplierCode),
                      p.orderedQuantity ?? "—",
                      p.receivedQuantity ?? "—",
                      money(p.orderedCost),
                    ])}
                  />
                )}
              </div>
            </div>
          )}
        </AsyncState>
      </div>
    </div>
  );
}
