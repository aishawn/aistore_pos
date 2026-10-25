"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { QuestionIcon } from "@/components/icons";
import { ClassificationFormSelect } from "@/components/admin/ClassificationFormSelect";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/hooks/useDialogFocus";

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
      aria-label="Show expected stock"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-11 w-12 shrink-0 items-center rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]",
        checked ? "justify-end bg-[var(--oh-info)]" : "bg-[var(--oh-border-strong)]",
      )}
    >
<span className="h-5 w-5 rounded-full bg-[var(--oh-surface-elevated)] shadow-sm" />
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
  const { data: outletData, loading: outletsLoading, error: outletsError, reload: reloadOutlets } = useApi<Outlet[]>("/api/outlets");
  const [name, setName] = useState("");
  const [outletId, setOutletId] = useState("");
  const [displayExpected, setDisplayExpected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const outletOptions = (outletData ?? []).map((o) => ({ label: o.name, value: o.id }));

  useEffect(() => {
    if (!open) return;
    setName(initialName?.trim() ?? "");
    setOutletId("");
    setDisplayExpected(false);
    setError(null);
  }, [open, initialName]);

  useEffect(() => {
    if (!open || outletId || !outletData?.length) return;
    setOutletId(outletData[0].id);
  }, [open, outletId, outletData]);

  function close() {
    if (busy) return;
    onClose();
  }

  useDialogFocus(open, close, "new-stocktake", nameInputRef);

  if (!open) return null;

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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
className="flex w-full max-w-[560px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 bg-[var(--oh-tile-blue-bg)] px-5 py-3.5">
          <QuestionIcon size={18} className="shrink-0 text-[var(--oh-tile-blue-text)]" strokeWidth={2} />
          <h2 id={titleId} className="text-[16px] font-semibold text-[var(--oh-tile-blue-text)]">New Stocktake</h2>
        </div>

        <div className="px-5 py-5">
          <div className="flex flex-col gap-4">
            <label className="block text-[14px] font-medium text-[var(--oh-text)]">
              Name
              <input
                ref={nameInputRef}
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
                loading={outletsLoading}
                onChange={setOutletId}
                placeholder="Select..."
              />
            </label>

            {outletsError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
                <span>Could not load outlets: {outletsError}</span>
<button type="button" onClick={reloadOutlets} disabled={outletsLoading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--oh-tile-red-border)] bg-[var(--oh-surface-elevated)] px-3 font-semibold text-[var(--oh-danger-text)] hover:bg-[var(--oh-tile-red-bg)] disabled:opacity-60">
                  <RefreshCw size={15} /> Retry outlets
                </button>
              </div>
            )}

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
className="rounded-[var(--oh-radius)] bg-[var(--oh-surface-muted)] px-4 py-1.5 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-border)] disabled:opacity-60"
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
