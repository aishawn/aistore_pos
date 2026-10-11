"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { SelectChevronIcon } from "@/components/icons";

interface Named {
  id: string;
  name: string;
}

const fieldClass =
  "h-11 w-full rounded border border-[#bdbdbd] px-3 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-[#5cb3e0]";
const labelClass = "mb-1 block text-[14px] font-bold text-black";
const textareaClass =
  "min-h-0 w-full flex-1 resize-none rounded border border-[#bdbdbd] px-3 py-2.5 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-[#5cb3e0]";

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

export function CreateTransferPage() {
  const router = useRouter();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [transferDate, setTransferDate] = useState(formatToday);
  const [transferNumber, setTransferNumber] = useState(generateTransferNumber);
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outlets = useApi<Named[]>("/api/outlets");

  const outletOptions = useMemo(
    () => (outlets.data ?? []).map((o) => ({ label: o.name, value: String(o.id) })),
    [outlets.data],
  );

  useEffect(() => {
    if (outletOptions.length === 0) return;
    if (!fromId) {
      setFromId(outletOptions[0].value);
    }
    if (!toId && outletOptions.length > 1) {
      const second = outletOptions.find((o) => o.value !== outletOptions[0].value);
      if (second) setToId(second.value);
    }
  }, [outletOptions, fromId, toId]);

  async function submit() {
    if (busy) return;

    if (!fromId) {
      setError("Source outlet is required.");
      return;
    }
    if (!toId) {
      setError("Destination outlet is required.");
      return;
    }
    if (fromId === toId) {
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
        fromId: Number(fromId),
        toId: Number(toId),
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
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="shrink-0 bg-[#5cb3e0] px-6 py-3">
        <h1 className="text-[20px] font-semibold text-white">Create Transfer</h1>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-6 py-5">
        <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4">
          <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <FormSelect
              label="From"
              value={fromId}
              onChange={setFromId}
              options={outletOptions}
            />
            <FormSelect
              label="To"
              value={toId}
              onChange={setToId}
              placeholder="Select..."
              options={outletOptions}
            />
          </div>

          <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Transfer Date">
              <input
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                placeholder="DD/MM/YYYY"
                className={fieldClass}
              />
            </FormField>
            <FormField label="Transfer Number">
              <input
                value={transferNumber}
                onChange={(e) => setTransferNumber(e.target.value)}
                className={fieldClass}
              />
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
