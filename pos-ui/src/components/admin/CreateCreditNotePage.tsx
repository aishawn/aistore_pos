"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { CircleCheckIcon, SelectChevronIcon } from "@/components/icons";

interface Named {
  id: string;
  name: string;
}

const fieldClass =
  "h-11 w-full rounded border border-[#bdbdbd] px-3 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-[#5cb3e0]";
const readOnlyFieldClass =
  "h-11 w-full rounded border border-[#bdbdbd] bg-neutral-100 px-3 text-[15px] text-black outline-none";
const labelClass = "mb-1 block text-[14px] font-bold text-black";
const textareaClass =
  "min-h-0 w-full flex-1 resize-none rounded border border-[#bdbdbd] px-3 py-2.5 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-[#5cb3e0]";

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
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="shrink-0 bg-[#5cb3e0] px-6 py-3">
        <h1 className="text-[20px] font-semibold text-white">Create Credit</h1>
        <p className="mt-1 text-[13px] text-white/90">
          Credit notes do not adjust your costs or inventory, they only adjust your reporting.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4">
          <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <FormSelect
              label="From"
              value={fromId}
              onChange={setFromId}
              placeholder="Select Supplier..."
              options={supplierOptions}
            />
            <FormField label="To">
              <input readOnly value={outletName} className={readOnlyFieldClass} />
            </FormField>
          </div>

          <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Credit Note Date">
              <input
                value={creditNoteDate}
                onChange={(e) => setCreditNoteDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                className={fieldClass}
              />
            </FormField>
            <FormField label="Credit Note Number">
              <div className="relative">
                <input
                  value={creditNoteNumber}
                  onChange={(e) => setCreditNoteNumber(e.target.value)}
                  className={`${fieldClass} pr-10`}
                />
                {creditNoteNumber.trim() && (
                  <CircleCheckIcon
                    size={18}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#3cb44b]"
                  />
                )}
              </div>
            </FormField>
            <FormField label="Due Date">
              <input
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                className={fieldClass}
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

          {error && <p className="shrink-0 text-[14px] text-red-600">{error}</p>}
        </div>
      </div>

      <div className="flex shrink-0 justify-end border-t border-neutral-200 px-6 py-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded bg-[#5cb3e0] px-10 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-[#4aa8d8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}
