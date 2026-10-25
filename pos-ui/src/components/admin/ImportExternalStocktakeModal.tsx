"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { QuestionIcon } from "@/components/icons";
import { downloadExternalStocktakeImportTemplate, importExternalStocktakeFile } from "@/lib/api";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/** Import external stocktake dialog with template download and file selection. */
export function ImportExternalStocktakeModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectFileRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [open]);

  function close() {
    if (busy) return;
    onClose();
  }

  useDialogFocus(open, close, "external-stocktake-import", selectFileRef);

  if (!open) return null;

  async function downloadTemplate() {
    setTemplateBusy(true);
    setError(null);
    try {
      await downloadExternalStocktakeImportTemplate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download the template.");
    } finally {
      setTemplateBusy(false);
    }
  }

  async function submit() {
    if (!file) {
      setError("Please select a file to import.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await importExternalStocktakeFile(file);
      onImported?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
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
className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 bg-[var(--oh-tile-blue-bg)] px-5 py-3.5">
          <QuestionIcon size={18} className="shrink-0 text-[var(--oh-tile-blue-text)]" strokeWidth={2} />
          <h2 id={titleId} className="text-[16px] font-semibold text-[var(--oh-tile-blue-text)]">Import Stocktake File</h2>
        </div>

        <div className="px-5 py-5">
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            disabled={templateBusy || busy}
            className="inline-flex min-h-10 items-center gap-2 text-[14px] font-medium text-[#00a3ee] underline underline-offset-2 transition-colors hover:text-[#0090d4] disabled:opacity-60"
          >
            {templateBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
            {templateBusy ? "Downloading…" : "Download Template"}
          </button>

          <p className="mt-3 text-[13px] text-[var(--oh-text-secondary)]">
            Required columns: Outlet, Barcode, Quantity. Case Quantity is optional.
          </p>

          <p className="mt-4 text-[14px] text-[var(--oh-text)]">Please select the file to import:</p>

          <div className="mt-2 flex items-center gap-3">
            <button
              ref={selectFileRef}
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="shrink-0 rounded-[var(--oh-radius)] border border-[var(--oh-border-strong)] bg-[var(--oh-surface)] px-3 py-1.5 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[#eee] disabled:opacity-60"
            >
              Select File
            </button>
            <span className="truncate text-[14px] text-[var(--oh-text-secondary)]">
              {file ? file.name : "No file selected"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
              className="hidden"
            />
          </div>

          {error && <p role="alert" className="mt-3 text-[13px] text-[var(--oh-danger)]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--oh-border)] px-5 py-3.5">
          <button
            type="button"
            onClick={close}
            disabled={busy}
className="rounded-[var(--oh-radius)] bg-[var(--oh-surface-muted)] px-4 py-1.5 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-border)] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-[var(--oh-radius)] bg-[#00a3ee] px-4 py-1.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#0090d4] disabled:opacity-60"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
