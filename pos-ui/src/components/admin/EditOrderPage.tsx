"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { AsyncState } from "@/components/admin/AsyncState";
import { FormDatePicker } from "@/components/admin/FormDatePicker";
import { ArrowLeftIcon, SelectChevronIcon } from "@/components/icons";

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
  "h-11 w-full rounded border border-[#bdbdbd] px-3 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-[#5cb3e0]";
const labelClass = "mb-1 block text-[14px] font-bold text-black";
const textareaClass =
  "min-h-0 w-full flex-1 resize-none rounded border border-[#bdbdbd] px-3 py-2.5 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-[#5cb3e0]";

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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder?: string;
}) {
  return (
    <FormField label={label}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
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

export function EditOrderPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { data: order, loading, error } = useApi<OrderDetail>(
    orderId ? `/api/orders/${orderId}` : null,
  );

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

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

  useEffect(() => {
    if (!order || initialized) return;
    setFromId(order.fromId != null ? String(order.fromId) : "");
    setToId(order.toId != null ? String(order.toId) : "");
    setOrderDate(order.orderDate ?? "");
    setOrderNumber(order.invoiceNumber ?? "");
    setDueDate(order.dueDate ?? "");
    setReference(order.reference ?? "");
    setNotes(order.notes ?? "");
    setInternalNotes(order.internalNotes ?? "");
    setInitialized(true);
  }, [order, initialized]);

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
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="shrink-0 border-b border-[var(--oh-border)] bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/orders/${orderId}/view`)}
            className="flex cursor-pointer items-center gap-1.5 text-[14px] font-medium text-[var(--oh-text-secondary)] hover:text-[var(--oh-text)]"
          >
            <ArrowLeftIcon size={16} />
            Back
          </button>
          <h1 className="text-[20px] font-semibold text-[var(--oh-text)]">Edit Order</h1>
        </div>
      </div>

      <AsyncState loading={loading} error={error} empty={!order}>
        {order && (
          <>
            <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
              <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4">
                <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormSelect
                    label="From"
                    value={fromId}
                    onChange={setFromId}
                    placeholder="All Suppliers"
                    options={supplierOptions}
                  />
                  <FormSelect
                    label="To"
                    value={toId}
                    onChange={setToId}
                    options={outletOptions}
                  />
                </div>

                <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField label="Order Date">
                    <FormDatePicker
                      value={orderDate}
                      onChange={setOrderDate}
                      placeholder="DD/MM/YYYY"
                      currentMonthOnly
                    />
                  </FormField>
                  <FormField label="Order Number">
                    <input
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      className={fieldClass}
                    />
                  </FormField>
                  <FormField label="Due Date">
                    <FormDatePicker
                      value={dueDate}
                      onChange={setDueDate}
                      placeholder="DD/MM/YYYY"
                      currentMonthOnly
                    />
                  </FormField>
                </div>

                <FormField label="Internal Reference" className="shrink-0">
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className={fieldClass}
                  />
                </FormField>

                <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Public Notes" className="min-h-[120px] h-full">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className={textareaClass}
                    />
                  </FormField>
                  <FormField label="Internal Notes" className="min-h-[120px] h-full">
                    <textarea
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      className={textareaClass}
                    />
                  </FormField>
                </div>

                {saveError && <p className="shrink-0 text-[14px] text-red-600">{saveError}</p>}
              </div>
            </div>

            <div className="flex shrink-0 justify-end border-t border-neutral-200 px-6 py-3">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="rounded bg-[#5cb3e0] px-10 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-[#4aa8d8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </AsyncState>
    </div>
  );
}
