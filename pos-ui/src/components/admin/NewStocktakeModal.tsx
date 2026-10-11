"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { QuestionIcon } from "@/components/icons";
import { ClassificationFormSelect } from "@/components/admin/ClassificationFormSelect";
import { cn } from "@/lib/utils";

interface Outlet {
  id: string;
  name: string;
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
        checked ? "justify-end bg-[var(--oh-info)]" : "bg-[var(--oh-border-strong)]",
      )}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

/** New advanced stocktake dialog — name, outlet, and display-expected toggle. */
export function NewStocktakeModal({
  open,
  onClose,
  onCreated,
  initialName,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  initialName?: string | null;
}) {
  const outlets = useApi<Outlet[]>("/api/outlets");
  const [name, setName] = useState("");
  const [outletId, setOutletId] = useState("");
  const [displayExpected, setDisplayExpected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outletOptions = (outlets.data ?? []).map((o) => ({ label: o.name, value: o.id }));

  useEffect(() => {
    if (!open) return;
    setName(initialName?.trim() ?? "");
    setOutletId("");
    setDisplayExpected(false);
    setError(null);
  }, [open, initialName]);

  useEffect(() => {
    if (!open || outletId || !outlets.data?.length) return;
    setOutletId(outlets.data[0].id);
  }, [open, outletId, outlets.data]);

  if (!open) return null;

  function close() {
    if (busy) return;
    onClose();
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (!outletId) {
      setError("Outlet is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.post("/api/stocktakes", {
        name: trimmed,
        outletId: Number(outletId),
        displayExpected,
        type: "ADVANCED",
      });
      onClose();
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create stocktake");
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
        className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-[var(--oh-shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 bg-[var(--oh-tile-blue-bg)] px-5 py-3.5">
          <QuestionIcon size={18} className="shrink-0 text-[var(--oh-tile-blue-text)]" strokeWidth={2} />
          <h2 className="text-[16px] font-semibold text-[var(--oh-tile-blue-text)]">New Stocktake</h2>
        </div>

        <div className="px-5 py-5">
          <div className="flex flex-col gap-4">
            <label className="block text-[14px] font-medium text-[var(--oh-text)]">
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Stocktake Name"
                className="mt-1 h-9 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border-strong)] px-3 text-[14px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-info)] focus:ring-1 focus:ring-[var(--oh-info)]"
              />
            </label>

            <label className="block text-[14px] font-medium text-[var(--oh-text)]">
              Outlet
              <ClassificationFormSelect
                value={outletId}
                options={outletOptions}
                loading={outlets.loading}
                onChange={setOutletId}
                placeholder="Select..."
              />
            </label>

            <div className="flex items-center gap-3">
              <ToggleSwitch checked={displayExpected} onChange={setDisplayExpected} />
              <span className="text-[14px] font-medium text-[var(--oh-text)]">Display expected</span>
            </div>
          </div>

          {error && <p className="mt-3 text-[13px] text-[var(--oh-danger)]">{error}</p>}
        </div>

        <form
          className="flex justify-end gap-2 border-t border-[var(--oh-border)] px-5 py-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#d8d8d8] px-4 py-1.5 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[#ccc] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#00a3ee] px-4 py-1.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#0090d4] disabled:opacity-60"
          >
            {busy ? "Creating…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
