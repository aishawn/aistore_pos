"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ImportIcon } from "@/components/icons";
import { downloadGiftCardsTemplate, importGiftCardsCsv } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Full-page gift card import with drag-and-drop upload (Excel or CSV). */
export function ImportGiftCardsPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
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
        const extra = result.errors.length > 1 ? ` (and ${result.errors.length - 1} more)` : "";
        setNotice(
          `Imported ${result.imported} gift card${result.imported === 1 ? "" : "s"}. Row ${first.row}: ${first.message}${extra}`,
        );
        if (result.imported > 0) {
          setTimeout(() => router.push("/giftcards"), 1500);
        }
        return;
      }
      router.push("/giftcards");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [router]);

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || busy) return;
    upload(file);
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans md:p-8">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push("/giftcards")}
          className="flex items-center gap-2 rounded-[var(--oh-radius)] bg-[#00a3ee] px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#0090d4]"
        >
          <ArrowLeftIcon size={16} />
          Back
        </button>
        <h1 className="text-[28px] font-bold text-[var(--oh-text)]">Import Gift Cards</h1>
      </div>

      <p className="mt-3 text-[14px] text-[var(--oh-text-secondary)]">
        Looking for the file format?{" "}
        <button
          type="button"
          onClick={() => void downloadGiftCardsTemplate()}
          className="font-medium text-[#00a3ee] underline underline-offset-2 transition-colors hover:text-[#0090d4]"
        >
          Click here.
        </button>
      </p>

      <p className="mt-1 text-[13px] text-[var(--oh-text-secondary)]">
        Required columns: Code, Amount. Current Amount, Expiry, Status, and Outlet ID are optional.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        className={cn(
          "mt-8 flex min-h-[420px] cursor-pointer flex-col items-center justify-center rounded-[var(--oh-radius)] border border-dashed px-6 py-16 text-center transition-colors",
          dragging
            ? "border-[#00a3ee] bg-[#00a3ee]/5"
            : "border-[var(--oh-border-strong)] bg-white hover:border-[#00a3ee]/60 hover:bg-[var(--oh-surface)]",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <ImportIcon size={72} strokeWidth={1.25} className="text-[var(--oh-muted)]" />
        <p className="mt-6 text-[18px] text-[var(--oh-text-secondary)]">
          {busy ? "Importing…" : "Drop in a file or click to select a file"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {notice && <p className="mt-4 text-[14px] text-[var(--oh-text-secondary)]">{notice}</p>}
      {error && <p className="mt-4 text-[14px] text-[var(--oh-danger)]">{error}</p>}
    </div>
  );
}
