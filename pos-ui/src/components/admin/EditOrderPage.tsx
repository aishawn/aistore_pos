"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { AsyncState } from "@/components/admin/AsyncState";
import { FormDatePicker } from "@/components/admin/FormDatePicker";
import { SelectChevronIcon } from "@/components/icons";
import { AdminActionFooter } from "@/components/admin/AdminPageLayout";

interface Named {
  id: string;
  name: string;
}

interface OrderDetail {
  id: string;
  type: string;
  status: string;
  fromId?: string | number;
  toId?: string | number;
  orderDate?: string;
  dueDate?: string;
  invoiceNumber?: string;
  reference?: string;
  notes?: string;
  internalNotes?: string;
  enteredAs?: string;
  includeFreight?: boolean;
  totalCost?: number;
  expectedTotal?: number;
  feePercentage?: number;
}

const fieldClass =
"h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--oh-surface)] disabled:opacity-70";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--oh-text-secondary)]";
const textareaClass =
"min-h-[140px] w-full flex-1 resize-y rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2.5 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15";

function FormField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col ${className ?? ""}`}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <FormField label={label}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`${fieldClass} appearance-none pr-10`}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value || "__empty"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <SelectChevronIcon
          size={16}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500"
        />
      </div>
    </FormField>
  );
}

interface EditOrderFormProps {
  orderId: string;
  order: OrderDetail | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  suppliers: ReturnType<typeof useApiList<Named>>;
  outlets: ReturnType<typeof useApi<Named[]>>;
  supplierOptions: Array<{ label: string; value: string }>;
  outletOptions: Array<{ label: string; value: string }>;
}

export function EditOrderPage({ orderId }: { orderId: string }) {
  const { data: order, loading, error, reload } = useApi<OrderDetail>(
    orderId ? `/api/orders/${orderId}` : null,
  );
  const suppliers = useApiList<Named>("/api/suppliers", { page: 1, size: 500 });
  const outlets = useApi<Named[]>("/api/outlets");
  const supplierOptions = useMemo(
    () => (suppliers.items ?? []).map((s) => ({ label: s.name, value: String(s.id) })),
    [suppliers.items],
  );
  const outletOptions = useMemo(
    () => (outlets.data ?? []).map((o) => ({ label: o.name, value: String(o.id) })),
    [outlets.data],
  );

  return (
    <EditOrderForm
      key={order?.id ?? "loading"}
      orderId={orderId}
      order={order}
      loading={loading}
      error={error}
      reload={reload}
      suppliers={suppliers}
      outlets={outlets}
      supplierOptions={supplierOptions}
      outletOptions={outletOptions}
    />
  );
}

function EditOrderForm({
  orderId,
  order,
  loading,
  error,
  reload,
  suppliers,
  outlets,
  supplierOptions,
  outletOptions,
}: EditOrderFormProps) {
  const router = useRouter();
  const [fromId, setFromId] = useState(() => (order?.fromId != null ? String(order.fromId) : ""));
  const [toId, setToId] = useState(() => (order?.toId != null ? String(order.toId) : ""));
  const [orderDate, setOrderDate] = useState(() => order?.orderDate ?? "");
  const [orderNumber, setOrderNumber] = useState(() => order?.invoiceNumber ?? "");
  const [dueDate, setDueDate] = useState(() => order?.dueDate ?? "");
  const [reference, setReference] = useState(() => order?.reference ?? "");
  const [notes, setNotes] = useState(() => order?.notes ?? "");
  const [internalNotes, setInternalNotes] = useState(() => order?.internalNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function submit() {
    if (busy || !order) return;

    if (!toId) {
      setSaveError("Destination outlet is required.");
      return;
    }
    if (!orderDate.trim()) {
      setSaveError("Order date is required.");
      return;
    }
    if (!orderNumber.trim()) {
      setSaveError("Order number is required.");
      return;
    }

    setBusy(true);
    setSaveError(null);
    try {
      await api.put(`/api/orders/${orderId}`, {
        type: order.type,
        status: order.status,
        fromId: fromId ? Number(fromId) : null,
        toId: Number(toId),
        orderDate: orderDate.trim(),
        dueDate: dueDate.trim() || null,
        enteredAs: order.enteredAs ?? null,
        invoiceNumber: orderNumber.trim(),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        internalNotes: internalNotes.trim() || null,
        includeFreight: order.includeFreight ?? false,
        totalCost: order.totalCost ?? null,
        expectedTotal: order.expectedTotal ?? null,
        feePercentage: order.feePercentage ?? null,
      });

      router.push(`/orders/${orderId}/view`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to update order");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
<header className="flex shrink-0 items-center gap-3 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => router.push(`/orders/${orderId}/view`)}
          aria-label="Back to order details"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--oh-border)] text-[var(--oh-text-secondary)] transition-colors hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="oh-type-title text-[var(--oh-text)]">Edit order</h1>
          <p className="oh-type-meta mt-0.5 truncate text-[var(--oh-muted)]">
            {order?.invoiceNumber ? `Update order ${order.invoiceNumber}` : "Update order details"}
          </p>
        </div>
      </header>

      <main aria-busy={loading || busy} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <AsyncState loading={loading} error={error} empty={!order} onRetry={reload}>
          {order && (
<div className="mx-auto w-full max-w-4xl rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)] sm:p-6">
              <div className="space-y-6">
                <section aria-labelledby="edit-order-locations" className="space-y-3">
                  <div>
                    <h2 id="edit-order-locations" className="text-sm font-semibold text-[var(--oh-text)]">Order locations</h2>
                    <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Choose the supplier and destination outlet.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormSelect
                      label="From supplier"
                      value={fromId}
                      onChange={setFromId}
                      placeholder={suppliers.loading ? "Loading suppliers…" : suppliers.error ? "Suppliers unavailable" : "Select supplier"}
                      disabled={suppliers.loading || Boolean(suppliers.error)}
                      options={supplierOptions}
                    />
                    <FormSelect
                      label="To outlet"
                      value={toId}
                      onChange={setToId}
                      placeholder={outlets.loading ? "Loading outlets…" : outlets.error ? "Outlets unavailable" : "Select outlet"}
                      disabled={outlets.loading || Boolean(outlets.error)}
                      options={outletOptions}
                    />
                  </div>
                </section>

                {(suppliers.error || outlets.error || (!outlets.loading && !outlets.error && outletOptions.length === 0)) && (
                  <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-950">
                    {outlets.error ? "Outlets could not be loaded. Refresh and try again before saving." : !outlets.loading && outletOptions.length === 0 ? "No destination outlets are available for this account." : "Suppliers could not be loaded. Refresh to verify the supplier selection before saving."}
                  </p>
                )}

                <section aria-labelledby="edit-order-dates" className="space-y-3 border-t border-[var(--oh-border)] pt-5">
                  <div>
                    <h2 id="edit-order-dates" className="text-sm font-semibold text-[var(--oh-text)]">Dates and reference</h2>
                    <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Keep the order number and dates aligned with your supplier paperwork.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FormField label="Order date">
                      <FormDatePicker value={orderDate} onChange={setOrderDate} placeholder="DD/MM/YYYY" currentMonthOnly />
                    </FormField>
                    <FormField label="Order number">
                      <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} autoComplete="off" className={fieldClass} />
                    </FormField>
                    <FormField label="Due date">
                      <FormDatePicker value={dueDate} onChange={setDueDate} placeholder="DD/MM/YYYY" currentMonthOnly />
                    </FormField>
                  </div>
                  <FormField label="Internal reference">
                    <input value={reference} onChange={(e) => setReference(e.target.value)} className={fieldClass} />
                  </FormField>
                </section>

                <section aria-labelledby="edit-order-notes" className="space-y-3 border-t border-[var(--oh-border)] pt-5">
                  <div>
                    <h2 id="edit-order-notes" className="text-sm font-semibold text-[var(--oh-text)]">Notes</h2>
                    <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Separate notes shared externally from internal team notes.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Public notes">
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visible on supplier-facing documents" className={textareaClass} />
                    </FormField>
                    <FormField label="Internal notes">
                      <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="For your team only" className={textareaClass} />
                    </FormField>
                  </div>
                </section>

                {saveError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{saveError}</p>}
              </div>
            </div>
          )}
        </AsyncState>
      </main>

      {order && (
        <AdminActionFooter>
          <button
            type="button"
            onClick={() => router.push(`/orders/${orderId}/view`)}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text-secondary)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex min-h-11 min-w-28 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {!busy && <Save size={16} aria-hidden="true" />}
            {busy ? "Saving…" : "Save"}
          </button>
        </AdminActionFooter>
      )}
    </div>
  );
}
