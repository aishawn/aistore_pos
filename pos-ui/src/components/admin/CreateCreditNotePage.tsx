"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";
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

function generateCreditNoteNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function parseDisplayDate(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
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

export function CreateCreditNotePage() {
  const router = useRouter();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState(formatToday);
  const [creditNoteNumber, setCreditNoteNumber] = useState(generateCreditNoteNumber);
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
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

  const outletName = useMemo(
    () => outletOptions.find((o) => o.value === toId)?.label ?? "",
    [outletOptions, toId],
  );

  useEffect(() => {
    if (!toId && outletOptions.length > 0) {
      setToId(outletOptions[0].value);
    }
  }, [outletOptions, toId]);

  async function submit() {
    if (busy) return;

    if (!fromId) {
      setError("Supplier is required.");
      return;
    }
    if (!toId) {
      setError("Destination outlet is required.");
      return;
    }
    if (!creditNoteDate.trim()) {
      setError("Credit note date is required.");
      return;
    }
    if (!creditNoteNumber.trim()) {
      setError("Credit note number is required.");
      return;
    }

    const parsedCreditNoteDate = parseDisplayDate(creditNoteDate);
    if (!parsedCreditNoteDate) {
      setError("Enter a valid credit note date (DD/MM/YYYY).");
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
      await api.post("/api/orders/credits", {
        fromId: Number(fromId),
        toId: Number(toId),
        creditNoteDate: parsedCreditNoteDate,
        dueDate: parsedDueDate,
        creditNoteNumber: creditNoteNumber.trim(),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        internalNotes: internalNotes.trim() || null,
      });

      router.push("/orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create credit note");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--oh-border)] bg-white px-4 py-3 sm:px-6">
        <div>
          <h1 className="oh-type-title text-[var(--oh-text)]">Create Credit Note</h1>
          <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Record a supplier credit for reporting</p>
        </div>
        <button type="button" onClick={() => router.push("/orders")} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
          <ArrowLeft size={16} aria-hidden="true" /> <span className="hidden sm:inline">Back to orders</span><span className="sm:hidden">Back</span>
        </button>
      </header>

      <main aria-busy={busy} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-6">
          <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2.5 text-sm leading-5 text-sky-950">
            <Info size={17} className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true" />
            <p>Credit notes adjust reporting only. They do not change product cost or inventory.</p>
          </div>

          <section aria-label="Supplier and outlet" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormSelect
              label="From supplier"
              value={fromId}
              onChange={setFromId}
              placeholder={suppliers.loading ? "Loading suppliers…" : suppliers.error ? "Suppliers unavailable" : "Select supplier"}
              disabled={suppliers.loading || Boolean(suppliers.error)}
              options={supplierOptions}
            />
            <FormField label="To">
              <input readOnly value={outletName} placeholder={outlets.loading ? "Loading outlet…" : outlets.error ? "Outlet unavailable" : "No outlet available"} className={readOnlyFieldClass} />
            </FormField>
          </section>
          {(suppliers.error || outlets.error || (!outlets.loading && outletOptions.length === 0)) && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-950">
              {outlets.error ? "The destination outlet could not be loaded. Refresh and try again before creating a credit note." : !outlets.loading && outletOptions.length === 0 ? "No destination outlets are available for this account." : "Suppliers could not be loaded. Refresh and try again before creating a credit note."}
            </p>
          )}

          <section aria-label="Credit note details" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Credit Note Date">
              <input
                value={creditNoteDate}
                onChange={(e) => setCreditNoteDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                inputMode="numeric"
                className={fieldClass}
              />
            </FormField>
            <FormField label="Credit Note Number">
              <input
                value={creditNoteNumber}
                onChange={(e) => setCreditNoteNumber(e.target.value)}
                className={fieldClass}
                autoComplete="off"
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

          <section aria-label="Credit note comments" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          disabled={busy || suppliers.loading || Boolean(suppliers.error) || !fromId || outlets.loading || Boolean(outlets.error) || !toId}
          className="inline-flex min-h-11 min-w-28 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </AdminActionFooter>
    </div>
  );
}
