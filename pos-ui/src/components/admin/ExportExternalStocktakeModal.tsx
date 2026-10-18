"use client";

import { useEffect, useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import { QuestionIcon } from "@/components/icons";
import { ClassificationFormSelect } from "@/components/admin/ClassificationFormSelect";
import { useApi } from "@/hooks/useApi";
import { exportExternalStocktakesXlsx } from "@/lib/api";
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
      aria-label="Include products without a barcode"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-11 w-12 shrink-0 items-center rounded-full p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]",
        checked ? "justify-end bg-[var(--oh-info)]" : "bg-[var(--oh-border-strong)]",
      )}
    >
      <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
    </button>
  );
}

/** Export external stocktake dialog with outlet selection and barcode options. */
export function ExportExternalStocktakeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: outletData, loading: outletsLoading, error: outletsError, reload: reloadOutlets } = useApi<Outlet[]>("/api/outlets");
  const [outletId, setOutletId] = useState("");
  const [includeNoBarcode, setIncludeNoBarcode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  const outletOptions = (outletData ?? []).map((o) => ({ label: o.name, value: o.id }));

  useEffect(() => {
    if (!open) return;
    setIncludeNoBarcode(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || outletId || !outletData?.length) return;
    setOutletId(outletData[0].id);
  }, [open, outletId, outletData]);

  function close() {
    if (busy) return;
    onClose();
  }

  useDialogFocus(open, close, "external-stocktake-export");

  if (!open) return null;

  async function submit() {
    if (!outletId) {
      setError("Outlet is required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await exportExternalStocktakesXlsx({
        outletId,
        includeNoBarcode,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
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
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-[var(--oh-shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 bg-[var(--oh-tile-blue-bg)] px-5 py-3.5">
          <QuestionIcon size={18} className="shrink-0 text-[var(--oh-tile-blue-text)]" strokeWidth={2} />
          <h2 id={titleId} className="text-[16px] font-semibold text-[var(--oh-tile-blue-text)]">Export Stocktake File</h2>
        </div>

        <div className="px-5 py-5">
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
            <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
              <span>Could not load outlets: {outletsError}</span>
              <button type="button" onClick={reloadOutlets} disabled={outletsLoading || busy} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60">
                <RefreshCw size={15} /> Retry outlets
              </button>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <ToggleSwitch checked={includeNoBarcode} onChange={setIncludeNoBarcode} />
            <span className="text-[14px] font-medium text-[var(--oh-text)]">
              Include products that don&apos;t have barcodes
            </span>
          </div>

          {error && <p role="alert" className="mt-3 text-[13px] text-[var(--oh-danger)]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--oh-border)] px-5 py-3.5">
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#d8d8d8] px-4 py-1.5 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[#ccc] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#00a3ee] px-4 py-1.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#0090d4] disabled:opacity-60"
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
