"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { SelectChevronIcon } from "@/components/icons";
import { AdminActionFooter } from "@/components/admin/AdminPageLayout";

interface Named {
  id: string;
  name: string;
}

const fieldClass =
  "h-11 w-full rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--oh-surface)] disabled:opacity-70";
const labelClass = "mb-1.5 block text-sm font-semibold text-[var(--oh-text-secondary)]";
const textareaClass =
  "min-h-[140px] w-full flex-1 resize-y rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 py-2.5 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)] focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15";

function formatToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function generateTransferNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const suffix = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `T${suffix}`;
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

export function CreateTransferPage() {
  const router = useRouter();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [transferNumber, setTransferNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setTransferDate((current) => current || formatToday());
      setTransferNumber((current) => current || generateTransferNumber());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const outlets = useApi<Named[]>("/api/outlets");

  const outletOptions = useMemo(
    () => (outlets.data ?? []).map((o) => ({ label: o.name, value: String(o.id) })),
    [outlets.data],
  );

  function reloadDependencies() {
    outlets.reload();
  }

  const selectedFromId = fromId || outletOptions[0]?.value || "";
  const selectedToId = toId || outletOptions.find((o) => o.value !== selectedFromId)?.value || "";

  async function submit() {
    if (busy) return;

    if (!selectedFromId) {
      setError("Source outlet is required.");
      return;
    }
    if (!selectedToId) {
      setError("Destination outlet is required.");
      return;
    }
    if (selectedFromId === selectedToId) {
      setError("Source and destination outlets must be different.");
      return;
    }
    if (!transferDate.trim()) {
      setError("Transfer date is required.");
      return;
    }
    if (!transferNumber.trim()) {
      setError("Transfer number is required.");
      return;
    }

    const parsedTransferDate = parseDisplayDate(transferDate);
    if (!parsedTransferDate) {
      setError("Enter a valid transfer date (DD/MM/YYYY).");
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
      await api.post("/api/orders/transfers", {
        fromId: Number(selectedFromId),
        toId: Number(selectedToId),
        transferDate: parsedTransferDate,
        dueDate: parsedDueDate,
        transferNumber: transferNumber.trim(),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        internalNotes: internalNotes.trim() || null,
      });

      router.push("/orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create transfer");
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 sm:px-6">
        <div>
          <h1 className="oh-type-title text-[var(--oh-text)]">Transfer Stock</h1>
          <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Move stock between outlets and set the transfer dates</p>
        </div>
        <button type="button" onClick={() => router.push("/orders")} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm font-semibold text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
          <ArrowLeft size={16} aria-hidden="true" /> <span className="hidden sm:inline">Back to orders</span><span className="sm:hidden">Back</span>
        </button>
      </header>

      <main aria-busy={busy} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)] sm:p-6">
          <section aria-label="Transfer outlets" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormSelect
              label="From outlet"
              value={selectedFromId}
              onChange={setFromId}
              placeholder={outlets.loading ? "Loading outlets…" : outlets.error ? "Outlets unavailable" : "Select source outlet"}
              disabled={outlets.loading || Boolean(outlets.error)}
              options={outletOptions}
            />
            <FormSelect
              label="To outlet"
              value={selectedToId}
              onChange={setToId}
              placeholder={outlets.loading ? "Loading outlets…" : outlets.error ? "Outlets unavailable" : "Select destination outlet"}
              disabled={outlets.loading || Boolean(outlets.error)}
              options={outletOptions}
            />
          </section>
          {!outlets.loading && (outlets.error || outletOptions.length < 2) && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--brand-warning)] bg-[var(--brand-warning-tint)] px-3 py-2.5 text-sm leading-5 text-[var(--brand-warning)]">
                <span>{outlets.error ? "Outlets could not be loaded. Refresh and try again before creating a transfer." : outletOptions.length === 0 ? "No outlets are available for this account." : "At least two outlets are needed to create a stock transfer."}</span>
                {outlets.error && <button type="button" onClick={reloadDependencies} className="min-h-11 rounded-md border border-[var(--brand-warning)] bg-[var(--oh-surface-elevated)] px-3 font-semibold text-[var(--oh-text)] hover:bg-[var(--brand-warning-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-warning)]">Retry</button>}
              </div>
          )}
          {outletOptions.length > 1 && (
            <p className="-mt-2 flex items-center gap-1.5 text-xs text-[var(--oh-muted)]"><ArrowRightLeft size={14} aria-hidden="true" />Source and destination must be different outlets.</p>
          )}

          <section aria-label="Transfer details" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Transfer Date">
              <input
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                inputMode="numeric"
                autoComplete="off"
                className={fieldClass}
              />
            </FormField>
            <FormField label="Transfer Number">
              <input
                value={transferNumber}
                onChange={(e) => setTransferNumber(e.target.value)}
                autoComplete="off"
                className={fieldClass}
              />
            </FormField>
            <FormField label="Due Date">
              <input
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                inputMode="numeric"
                autoComplete="off"
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

          <section aria-label="Transfer notes" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          disabled={busy || outlets.loading || Boolean(outlets.error) || outletOptions.length < 2 || !selectedFromId || !selectedToId || selectedFromId === selectedToId}
          className="inline-flex min-h-11 min-w-28 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </AdminActionFooter>
    </div>
  );
}
