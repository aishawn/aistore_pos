"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { downloadGiftCardsTemplate, importGiftCardsCsv } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Full-page gift card import with drag-and-drop upload (Excel or CSV). */
export function ImportGiftCardsPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await importGiftCardsCsv(file);
      if (result.errors.length > 0) {
        const first = result.errors[0];
        const extra = result.errors.length > 1 ? ` (${result.errors.length - 1} more)` : "";
        setNotice(`Imported ${result.imported} gift card${result.imported === 1 ? "" : "s"}. Row ${first.row}: ${first.message}${extra}`);
        if (result.imported > 0) setTimeout(() => router.push("/giftcards"), 1800);
        return;
      }
      router.push("/giftcards");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed. Please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [router]);

  async function downloadTemplate() {
    setTemplateBusy(true);
    setError(null);
    try {
      await downloadGiftCardsTemplate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not download the template.");
    } finally {
      setTemplateBusy(false);
    }
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || busy) return;
    void upload(file);
  }

  return (
    <AdminPageLayout
      title="Import Gift Cards"
      subtitle="Upload a CSV or Excel file to add gift cards"
      actions={
        <AdminSecondaryButton className="min-h-11" onClick={() => router.push("/giftcards")}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to gift cards
        </AdminSecondaryButton>
      }
    >
      <div className="mx-auto grid w-full max-w-4xl gap-4">
<section aria-labelledby="file-format-title" className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)] sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
                <FileSpreadsheet size={19} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="file-format-title" className="text-sm font-semibold text-[var(--oh-text)]">Prepare your file</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--oh-muted)]">Required: Code and Amount. Optional: Current Amount, Expiry, Status, and Outlet ID.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void downloadTemplate()}
              disabled={templateBusy || busy}
className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 text-sm font-semibold text-[var(--oh-primary)] transition-colors hover:bg-[var(--oh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60"
            >
              {templateBusy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet size={16} aria-hidden="true" />}
              {templateBusy ? "Preparing template…" : "Download template"}
            </button>
          </div>
        </section>

        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-label="Choose a CSV or Excel file, or drop one here"
          aria-disabled={busy}
          aria-busy={busy}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !busy) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); onFiles(event.dataTransfer.files); }}
          className={cn(
            "flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] sm:min-h-[280px] sm:px-8",
            dragging
              ? "border-[var(--oh-primary)] bg-[var(--oh-primary)]/5"
: "border-[var(--oh-border-strong)] bg-[var(--oh-surface-elevated)] hover:border-[var(--oh-primary)]/60 hover:bg-[var(--oh-surface-muted)]",
            busy && "pointer-events-none cursor-wait opacity-60",
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => onFiles(event.target.files)}
            aria-label="Select gift card import file"
          />
          <span className="flex size-12 items-center justify-center rounded-xl bg-[var(--oh-surface)] text-[var(--oh-primary)] ring-1 ring-[var(--oh-border)]">
            {busy ? <LoaderCircle size={23} className="animate-spin" aria-hidden="true" /> : <Upload size={23} aria-hidden="true" />}
          </span>
          <p className="mt-4 text-base font-semibold text-[var(--oh-text)]">
            {busy ? "Importing gift cards…" : dragging ? "Drop the file to import" : "Drop a file here or choose a file"}
          </p>
          <p className="mt-1.5 text-sm text-[var(--oh-muted)]">CSV, XLS, or XLSX · One file at a time</p>
          {!busy && <span className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Choose file</span>}
        </div>

        {notice && (
          <p role="status" className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-950">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />{notice}
          </p>
        )}
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-5 text-rose-800">{error}</p>}
      </div>
    </AdminPageLayout>
  );
}
