"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { FormDatePicker } from "@/components/admin/FormDatePicker";
import { SelectChevronIcon, SettingsGearIcon } from "@/components/icons";

interface Named {
  id: string;
  name: string;
}

const fieldClass =
  "h-11 w-full rounded border border-[#bdbdbd] px-3 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-[#5cb3e0]";
const labelClass = "mb-1 block text-[14px] font-bold text-black";
const textareaClass =
  "min-h-0 w-full flex-1 resize-none rounded border border-[#bdbdbd] px-3 py-2.5 text-[15px] text-black outline-none placeholder:text-neutral-400 focus:border-[#5cb3e0]";

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
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="shrink-0 bg-[#5cb3e0] px-6 py-3">
        <h1 className="text-[20px] font-semibold text-white">Create Order</h1>
      </div>

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

          <div className="grid shrink-0 grid-cols-1 items-end gap-4 sm:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-2 pb-2.5 text-[14px] font-bold text-black">
              <SettingsGearIcon size={18} strokeWidth={1.75} />
              Generate
            </div>
            <FormSelect
              label="Generate Stock From"
              value={generateStockFrom}
              onChange={setGenerateStockFrom}
              options={GENERATE_STOCK_OPTIONS}
            />
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
