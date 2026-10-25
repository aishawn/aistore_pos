"use client";

import { useEffect, useId, useRef, useState } from "react";
import { QuestionIcon } from "@/components/icons";
import { downloadProductsImportTemplate, importProductsCsv } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/** Import-products dialog with template download and file selection. */
export function ImportProductsModal({
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
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setFileError(null);
    setError(null);
    setNotice(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [open]);

  function close() {
    if (busy) return;
    onClose();
  }

  useDialogFocus(open, close, "import-products");

  if (!open) return null;

  async function submit() {
    if (!file) {
      setFileError("Please select a file to import.");
      return;
    }

    setBusy(true);
    setFileError(null);
    setError(null);
    setNotice(null);
    try {
      const result = await importProductsCsv(file);
      if (result.errors.length > 0) {
        const first = result.errors[0];
        const extra = result.errors.length > 1 ? ` (and ${result.errors.length - 1} more)` : "";
        setNotice(
          `Imported ${result.imported} product${result.imported === 1 ? "" : "s"}. Row ${first.row}: ${first.message}${extra}`,
        );
        if (result.imported > 0) onImported?.();
        return;
      }
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
          <h2 id={titleId} className="text-[16px] font-semibold text-[var(--oh-tile-blue-text)]">Import Products</h2>
        </div>

        <form
          className="px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <button
            type="button"
            onClick={() => void downloadProductsImportTemplate()}
            className="text-[14px] font-medium text-[#00a3ee] underline underline-offset-2 transition-colors hover:text-[#0090d4]"
          >
            Download Template
          </button>

          <p className="mt-3 text-[13px] text-[var(--oh-text-secondary)]">
            Required column: Name. Cost, Price, and Status are optional.
          </p>

          <label className="mt-4 block text-[14px] font-medium text-[var(--oh-text)]">
            Import file <span className="text-[var(--oh-danger)]">*</span>
          </label>

          <div
            className={cn(
              "mt-2 flex items-center gap-3 rounded-[var(--oh-radius)] border px-3 py-2 transition-colors",
              fileError
                ? "border-[var(--oh-danger)] bg-[var(--oh-danger)]/5"
                : "border-[var(--oh-border)] bg-[var(--oh-surface)]",
            )}
          >
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
className="shrink-0 rounded-[var(--oh-radius)] border border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] px-3 py-1.5 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface-muted)] disabled:opacity-60"
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
                setFileError(null);
                setError(null);
                setNotice(null);
              }}
              className="hidden"
            />
          </div>

          {fileError && (
            <p role="alert" className="mt-1.5 text-[13px] font-medium text-[var(--oh-danger)]">
              {fileError}
            </p>
          )}

          {notice && <p className="mt-3 text-[13px] text-[var(--oh-text-secondary)]">{notice}</p>}
          {error && <p className="mt-3 text-[13px] text-[var(--oh-danger)]">{error}</p>}

          <div className="mt-5 flex justify-end gap-2 border-t border-[var(--oh-border)] pt-3.5">
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
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
