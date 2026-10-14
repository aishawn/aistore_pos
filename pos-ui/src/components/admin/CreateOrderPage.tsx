"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { FormDatePicker } from "@/components/admin/FormDatePicker";
import { SelectChevronIcon } from "@/components/icons";
import { AdminActionFooter } from "@/components/admin/AdminPageLayout";

interface Named {
  id: string;
  name: string;
}

const fieldClass =
  "h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--oh-surface)] disabled:opacity-70";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--oh-text-secondary)]";
const textareaClass =
  "min-h-[140px] w-full flex-1 resize-y rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2.5 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15";

const GENERATE_STOCK_OPTIONS = [
  { label: "None", value: "" },
  { label: "Reorder Level", value: "REORDER_LEVEL" },
  { label: "Minimum Stock", value: "MINIMUM_STOCK" },
  { label: "Buying Period", value: "BUYING_PERIOD" },
];

function formatToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateOrderNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

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

export function CreateOrderPage() {
  const router = useRouter();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [orderDate, setOrderDate] = useState(formatToday);
  const [orderNumber, setOrderNumber] = useState(generateOrderNumber);
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [generateStockFrom, setGenerateStockFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!toId && outletOptions.length > 0) {
      setToId(outletOptions[0].value);
    }
  }, [outletOptions, toId]);

  async function submit() {
    if (busy) return;

    if (!toId) {
      setError("Destination outlet is required.");
      return;
    }
    if (!orderDate.trim()) {
      setError("Order date is required.");
      return;
    }
    if (!orderNumber.trim()) {
      setError("Order number is required.");
      return;
    }

    const parsedOrderDate = orderDate.trim();
    const parsedDueDate = dueDate.trim() || null;

    setBusy(true);
    setError(null);
    try {
      await api.post("/api/orders", {
        fromId: fromId ? Number(fromId) : null,
        toId: Number(toId),
        orderDate: parsedOrderDate,
        dueDate: parsedDueDate,
        invoiceNumber: orderNumber.trim(),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        internalNotes: internalNotes.trim() || null,
        generateStockFrom: generateStockFrom || null,
      });

      router.push("/orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create order");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--oh-border)] bg-white px-4 py-3 sm:px-6">
        <div>
          <h1 className="oh-type-title text-[var(--oh-text)]">Create Order</h1>
          <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Enter order details and delivery notes</p>
        </div>
        <button type="button" onClick={() => router.push("/orders")} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
          <ArrowLeft size={16} aria-hidden="true" /> <span className="hidden sm:inline">Back to orders</span><span className="sm:hidden">Back</span>
        </button>
      </header>

      <main aria-busy={busy} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-6">
          <section aria-label="Order locations" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormSelect
              label="From"
              value={fromId}
              onChange={setFromId}
              placeholder={suppliers.loading ? "Loading suppliers…" : suppliers.error ? "Suppliers unavailable" : "All Suppliers"}
              disabled={suppliers.loading || Boolean(suppliers.error)}
              options={supplierOptions}
            />
            <FormSelect
              label="To"
              value={toId}
              onChange={setToId}
              placeholder={outlets.loading ? "Loading outlets…" : outlets.error ? "Outlets unavailable" : "Select an outlet"}
              disabled={outlets.loading || Boolean(outlets.error)}
              options={outletOptions}
            />
          </section>
          {(suppliers.error || outlets.error || (!outlets.loading && !outlets.error && outletOptions.length === 0)) && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-950">
              {outlets.error ? "Outlets could not be loaded. Refresh and try again before creating an order." : !outlets.loading && outletOptions.length === 0 ? "No destination outlets are available for this account." : "Suppliers could not be loaded. You can still choose a destination outlet."}
            </p>
          )}

          <section aria-label="Order dates and number" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          </section>

          <FormField label="Internal Reference" className="shrink-0">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={fieldClass}
            />
          </FormField>

          <section aria-label="Order notes" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Public Notes" className="min-h-[180px]">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={textareaClass}
              />
            </FormField>
            <FormField label="Internal Notes" className="min-h-[180px]">
              <textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                className={textareaClass}
              />
            </FormField>
          </section>

          <section aria-label="Stock generation" className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-4">
            <div className="flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--oh-text-secondary)]">
              <Settings2 size={18} aria-hidden="true" />
              Generate stock
            </div>
            <FormSelect
              label="Generate Stock From"
              value={generateStockFrom}
              onChange={setGenerateStockFrom}
              options={GENERATE_STOCK_OPTIONS}
            />
          </section>

          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800">{error}</p>}
        </div>
      </main>

      <AdminActionFooter>
          <button type="button" onClick={() => router.push("/orders")} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex min-h-11 min-w-28 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create"}
          </button>
      </AdminActionFooter>
    </div>
  );
}
