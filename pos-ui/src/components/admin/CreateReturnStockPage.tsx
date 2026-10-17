"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { SelectChevronIcon } from "@/components/icons";
import { AdminActionFooter } from "@/components/admin/AdminPageLayout";

interface Named {
  id: string;
  name: string;
}

const fieldClass =
  "h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--oh-surface)] disabled:opacity-70";
const readOnlyFieldClass =
  "h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-sm text-[var(--oh-text-secondary)] outline-none";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--oh-text-secondary)]";
const textareaClass =
  "min-h-[140px] w-full flex-1 resize-y rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2.5 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15";

function formatToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function parseDisplayDate(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (
    date.getUTCFullYear() !== Number(y)
    || date.getUTCMonth() + 1 !== Number(m)
    || date.getUTCDate() !== Number(d)
  ) return null;
  return iso;
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

export function CreateReturnStockPage() {
  const router = useRouter();
  const [toId, setToId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setOrderDate((current) => current || formatToday());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

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

  const selectedFromId = outletOptions[0]?.value || "";
  const outletName = useMemo(
    () => outletOptions.find((o) => o.value === selectedFromId)?.label ?? "",
    [outletOptions, selectedFromId],
  );

  async function submit() {
    if (busy) return;

    if (!selectedFromId) {
      setError("Source outlet is required.");
      return;
    }
    if (!toId) {
      setError("Supplier is required.");
      return;
    }
    if (!orderDate.trim()) {
      setError("Order date is required.");
      return;
    }

    const parsedOrderDate = parseDisplayDate(orderDate);
    if (!parsedOrderDate) {
      setError("Enter a valid order date (DD/MM/YYYY).");
      return;
    }

    const parsedDueDate = dueDate.trim() ? parseDisplayDate(dueDate) : null;
    if (dueDate.trim() && !parsedDueDate) {
      setError("Enter a valid due date (DD/MM/YYYY).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post("/api/orders/returns", {
        fromId: Number(selectedFromId),
        toId: Number(toId),
        orderDate: parsedOrderDate,
        dueDate: parsedDueDate,
        orderNumber: orderNumber.trim() || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        internalNotes: internalNotes.trim() || null,
      });

      router.push("/orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create return");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--oh-border)] bg-white px-4 py-3 sm:px-6">
        <div>
          <h1 className="oh-type-title text-[var(--oh-text)]">Return Stock</h1>
          <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Record stock being returned from an outlet to a supplier</p>
        </div>
        <button type="button" onClick={() => router.push("/orders")} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
          <ArrowLeft size={16} aria-hidden="true" /> <span className="hidden sm:inline">Back to orders</span><span className="sm:hidden">Back</span>
        </button>
      </header>

      <main aria-busy={busy} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-6">
          <section aria-label="Return locations" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="From">
              <input readOnly value={outletName} placeholder={outlets.loading ? "Loading outlet…" : outlets.error ? "Outlet unavailable" : "No outlet available"} className={readOnlyFieldClass} />
            </FormField>
            <FormSelect
              label="To supplier"
              value={toId}
              onChange={setToId}
              placeholder={suppliers.loading ? "Loading suppliers…" : suppliers.error ? "Suppliers unavailable" : "Select supplier"}
              disabled={suppliers.loading || Boolean(suppliers.error)}
              options={supplierOptions}
            />
          </section>
          {(suppliers.error || outlets.error || (!outlets.loading && outletOptions.length === 0)) && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-950">
              {outlets.error ? "The source outlet could not be loaded. Refresh and try again before returning stock." : !outlets.loading && outletOptions.length === 0 ? "No source outlets are available for this account." : "Suppliers could not be loaded. Refresh and try again before returning stock."}
            </p>
          )}
          {outletOptions.length > 0 && <p className="-mt-2 flex items-center gap-1.5 text-xs text-[var(--oh-muted)]"><Undo2 size={14} aria-hidden="true" />Stock will be returned from the selected outlet to the supplier.</p>}

          <section aria-label="Return details" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Order Date">
              <input
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                inputMode="numeric"
                className={fieldClass}
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
              <input
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                inputMode="numeric"
                className={fieldClass}
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

          <section aria-label="Return notes" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          disabled={busy || outlets.loading || Boolean(outlets.error) || !selectedFromId || suppliers.loading || Boolean(suppliers.error) || !toId}
          className="inline-flex min-h-11 min-w-28 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </AdminActionFooter>
    </div>
  );
}
