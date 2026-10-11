"use client";

import { useState } from "react";
import { Modal } from "@/components/admin/Modal";

export interface FormField {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "checkbox";
  options?: { label: string; value: string }[];
  required?: boolean;
  placeholder?: string;
}

export type FormValues = Record<string, string | boolean>;

/**
 * Field-config-driven create/edit form in a modal. `onSubmit` receives the
 * current values; throw to surface an error. Closes on success.
 */
export function EntityFormModal({
  title,
  fields,
  initial,
  submitLabel = "Save",
  onClose,
  onSubmit,
}: {
  title: string;
  fields: FormField[];
  initial?: FormValues;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (values: FormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<FormValues>(() => {
    const seed: FormValues = {};
    for (const f of fields) seed[f.name] = initial?.[f.name] ?? (f.type === "checkbox" ? false : "");
    return seed;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (name: string, value: string | boolean) => setValues((v) => ({ ...v, [name]: value }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-md border border-neutral-300 px-5 py-2 text-[15px] text-neutral-700">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy} className="rounded-md bg-[#3aa0e3] px-5 py-2 text-[15px] font-semibold text-white disabled:opacity-60">
            {busy ? "Saving…" : submitLabel}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {fields.map((f) =>
          f.type === "checkbox" ? (
            <label
              key={f.name}
              className="flex cursor-pointer items-center justify-between gap-4 text-[14px] text-neutral-700"
            >
              <span>{f.label}</span>
              <input
                type="checkbox"
                checked={Boolean(values[f.name])}
                onChange={(e) => set(f.name, e.target.checked)}
                className="h-5 w-5 shrink-0"
              />
            </label>
          ) : (
            <label key={f.name} className="flex flex-col text-[14px] text-neutral-700">
              {f.label}
              {f.type === "select" ? (
                <select
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => set(f.name, e.target.value)}
                  className="mt-1 h-[44px] rounded-md border border-neutral-300 px-3 text-[15px] text-black outline-none"
                >
                  <option value="">Select…</option>
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  value={String(values[f.name] ?? "")}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.name, e.target.value)}
                  className="mt-1 h-[44px] rounded-md border border-neutral-300 px-3 text-[15px] text-black outline-none"
                />
              )}
            </label>
          ),
        )}
        {error && <p className="text-[14px] text-[#e2231a]">{error}</p>}
      </div>
    </Modal>
  );
}
