"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, FileText, Upload } from "lucide-react";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList } from "@/hooks/useApi";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { api, downloadCappedPricingTemplate, importCappedPricingCsv } from "@/lib/api";
import { cn } from "@/lib/utils";

type SourceTab = "PROVIDED" | "IMPORTED";

interface CappedPriceRow {
  id: string;
  productId: string;
  priceId?: string | null;
  productName: string;
  priceSetName?: string | null;
  source: string;
  sourceType: string;
  startDate?: string | null;
  endDate?: string | null;
  quantity?: number | null;
  cappedPrice?: number | null;
  currentPrice?: number | null;
  cost?: number | null;
}

const TAB_LABELS: Record<SourceTab, string> = {
  PROVIDED: "Provided",
  IMPORTED: "Imported",
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function money(v?: number | null) {
  if (v == null) return "";
  return `$${Number(v).toFixed(2)}`;
}

function marginPct(cost?: number | null, price?: number | null) {
  if (cost == null || price == null || price <= 0) return "";
  return `${(((price - cost) / price) * 100).toFixed(2)}%`;
}

function cellInput(className?: string) {
  return cn(
    "h-[34px] w-full rounded border border-neutral-300 bg-white px-2 text-[13px] outline-none focus:border-[#6eb5e0]",
    className,
  );
}

function CappedPriceRowEditor({
  row,
  onDirty,
  onSaved,
}: {
  row: CappedPriceRow;
  onDirty: () => void;
  onSaved: () => void;
}) {
  const [current, setCurrent] = useState(row.currentPrice != null ? String(row.currentPrice) : "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setCurrent(row.currentPrice != null ? String(row.currentPrice) : "");
    setDirty(false);
  }, [row]);

  const save = useCallback(async () => {
    const priceNum = current === "" ? null : Number(current);
    if (priceNum === row.currentPrice || !row.priceId || priceNum == null || Number.isNaN(priceNum)) {
      setDirty(false);
      return;
    }
    await api.patch("/api/capped-pricing/current-price", {
      priceId: row.priceId,
      price: priceNum,
    });
    setDirty(false);
    onSaved();
  }, [current, onSaved, row.currentPrice, row.priceId]);

  const currentNum = current === "" ? null : Number(current);
  const overCap =
    currentNum != null &&
    row.cappedPrice != null &&
    !Number.isNaN(currentNum) &&
    currentNum > row.cappedPrice;

  return (
    <div className="flex items-start border-b border-neutral-200 bg-white py-2 text-[13px] text-black">
      <div className="w-[24%] shrink-0 px-3">
        <div className="text-[13px] text-neutral-500">{row.priceSetName ?? "Default Price Set"}</div>
        <div className="mt-0.5 font-semibold leading-snug">{row.productName}</div>
      </div>
      <div className="w-[18%] shrink-0 px-3 leading-snug">{row.source}</div>
      <div className="w-[9%] shrink-0 px-3">{formatDate(row.startDate)}</div>
      <div className="w-[9%] shrink-0 px-3">{formatDate(row.endDate)}</div>
      <div className="w-[6%] shrink-0 px-3 text-center">{row.quantity ?? ""}</div>
      <div className="w-[9%] shrink-0 px-3">{money(row.cappedPrice)}</div>
      <div className="w-[11%] shrink-0 px-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
          <input
            className={cellInput(cn("pl-5", overCap && "text-[#e2231a]"))}
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setDirty(true);
              onDirty();
            }}
            onBlur={() => void save()}
          />
        </div>
      </div>
      <div className="min-w-0 flex-1 px-3 pt-1.5">{marginPct(row.cost, currentNum)}</div>
      {dirty ? <span className="sr-only">unsaved</span> : null}
    </div>
  );
}

function CappedPricingImportPanel({
  onImported,
}: {
  onImported: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const result = await importCappedPricingCsv(file);
        if (result.errors.length > 0) {
          const first = result.errors[0];
          const extra = result.errors.length > 1 ? ` (and ${result.errors.length - 1} more)` : "";
          setNotice(
            `Imported ${result.imported} row${result.imported === 1 ? "" : "s"}. Row ${first.row}: ${first.message}${extra}`,
          );
        } else if (result.imported > 0) {
          setNotice(`Imported ${result.imported} row${result.imported === 1 ? "" : "s"}.`);
        }
        if (result.imported > 0) onImported();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onImported],
  );

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || busy) return;
    void upload(file);
  }

  return (
    <div className="mb-6">
      <p className="text-[14px] text-[var(--oh-text-secondary)]">
        Looking for the file format?{" "}
        <button
          type="button"
          onClick={downloadCappedPricingTemplate}
          className="font-medium text-[#00a3ee] underline underline-offset-2 transition-colors hover:text-[#0090d4]"
        >
          Click here
        </button>
        .
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
          "mt-4 flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-[var(--oh-radius)] border border-dashed px-6 py-10 text-center transition-colors",
          dragging
            ? "border-[#00a3ee] bg-[#00a3ee]/5"
            : "border-[var(--oh-border-strong)] bg-white hover:border-[#00a3ee]/60 hover:bg-[var(--oh-surface)]",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <Upload size={40} strokeWidth={1.25} className="text-[var(--oh-muted)]" />
        <p className="mt-4 text-[15px] text-[var(--oh-text-secondary)]">
          {busy ? (
            "Importing…"
          ) : (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
                className="font-medium text-[#00a3ee] underline underline-offset-2 transition-colors hover:text-[#0090d4]"
              >
                Upload a file
              </button>{" "}
              or drag and drop.
            </>
          )}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {notice && <p className="mt-3 text-[14px] text-[var(--oh-text-secondary)]">{notice}</p>}
      {error && <p className="mt-3 text-[14px] text-[var(--oh-danger)]">{error}</p>}
    </div>
  );
}

/** Compare current prices against provided or imported capped price lists. */
export function CappedPricingPage() {
  const [tab, setTab] = useState<SourceTab>("PROVIDED");
  const [hasChanges, setHasChanges] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = DEFAULT_PAGE_SIZE;

  // Provided is the working list: supplier caps and CSV imports both belong here.
  // Imported keeps the same rows that were just uploaded, under the drop zone.
  const listSourceType = tab === "IMPORTED" ? "IMPORTED" : "ALL";

  const { items, total, loading, error, reload } = useApiList<CappedPriceRow>(
    "/api/capped-pricing",
    { sourceType: listSourceType, page, size: PAGE_SIZE },
  );

  useEffect(() => {
    setHasChanges(false);
    setPage(1);
  }, [tab]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white font-sans">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-neutral-200 px-6 py-4">
        <h1 className="text-[28px] font-bold text-black">Capped Pricing</h1>
        <div className="ml-auto flex items-center gap-2 text-[14px] text-neutral-600">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              hasChanges ? "bg-[#f5a623]" : "bg-[#6cc04a]",
            )}
          />
          {hasChanges ? "Unsaved changes" : "No changes made"}
        </div>
      </div>

      <div className="shrink-0 px-6 pt-4">
        <div className="inline-flex overflow-hidden rounded-md border border-neutral-200">
          {(["PROVIDED", "IMPORTED"] as SourceTab[]).map((key) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 text-[14px] font-medium transition-colors",
                  active ? "bg-[#b8d9eb] text-black" : "bg-white text-neutral-600 hover:bg-neutral-50",
                )}
              >
                {key === "PROVIDED" ? <Cloud size={16} /> : <FileText size={16} />}
                {TAB_LABELS[key]}
              </button>
            );
          })}
        </div>
        <h2 className="mt-5 text-[22px] font-normal text-black">{TAB_LABELS[tab]}</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6 pt-3">
        {tab === "IMPORTED" ? <CappedPricingImportPanel onImported={reload} /> : null}

        <div className="sticky top-0 z-10 flex items-center rounded-md bg-black px-3 py-2 text-[13px] font-bold text-white">
          <div className="w-[24%] px-3">Product</div>
          <div className="w-[18%] px-3">Capped Pricing</div>
          <div className="w-[9%] px-3">Start Date</div>
          <div className="w-[9%] px-3">End Date</div>
          <div className="w-[6%] px-3 text-center">Quantity</div>
          <div className="w-[9%] px-3">Capped Price</div>
          <div className="w-[11%] px-3">Current Price</div>
          <div className="min-w-0 flex-1 px-3">%</div>
        </div>

        <AsyncState loading={loading} error={error} empty={items.length === 0}>
          {items.map((row) => (
            <CappedPriceRowEditor
              key={row.id}
              row={row}
              onDirty={() => setHasChanges(true)}
              onSaved={() => {
                setHasChanges(false);
                reload();
              }}
            />
          ))}
        </AsyncState>
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
