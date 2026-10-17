"use client";

import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api";
import { QuestionIcon } from "@/components/icons";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/** Create-price-list dialog — name prompt with Cancel / New actions. */
export function CreatePriceListModal({
  open,
  onClose,
  onCreated,
  initialName,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialName?: string | null;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setName(initialName?.trim() ?? "");
    setError(null);
  }, [open, initialName]);

  function close() {
    if (busy) return;
    onClose();
  }

  useDialogFocus(open, close, "create-price-list");

  if (!open) return null;

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post("/api/price-lists", { name: trimmed });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create price list");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 font-sans"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-[420px] rounded-lg bg-white px-8 pb-8 pt-14 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute left-1/2 top-0 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#5cb3e0]">
          <QuestionIcon size={36} className="text-white" strokeWidth={1.5} />
        </div>

        <h2 id={titleId} className="text-center text-[22px] font-bold text-black">Create Price List</h2>

        <p className="mt-5 text-[15px] text-black">What should the price list be called?</p>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          className="mt-2 h-[44px] w-full rounded border border-black px-3 text-[15px] text-black outline-none"
        />

        {error && <p className="mt-2 text-[13px] text-[#e2231a]">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="flex-1 rounded border border-neutral-300 bg-white py-2.5 text-[15px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded bg-[#3cb44b] py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-[#35a042] disabled:opacity-60"
          >
            {busy ? "Creating…" : "New"}
          </button>
        </div>
      </div>
    </div>
  );
}
