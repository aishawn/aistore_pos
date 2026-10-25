"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { ExportIcon, ImportIcon } from "@/components/icons";
import { AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
import { ExportExternalStocktakeModal } from "@/components/admin/ExportExternalStocktakeModal";
import { ImportExternalStocktakeModal } from "@/components/admin/ImportExternalStocktakeModal";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList } from "@/hooks/useApi";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";

interface ExternalStocktake {
  id: string;
  outletName?: string | null;
  status?: string | null;
  timestamp?: string | null;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatStatus(status?: string | null) {
  if (!status) return "";
  return status
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** External stocktake import/export list page. */
export function ExternalStocktakesPage() {
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = DEFAULT_PAGE_SIZE;

  const { items, total, loading, error, reload } = useApiList<ExternalStocktake>(
    "/api/external-stocktakes",
    { page, size: PAGE_SIZE },
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--oh-surface-elevated)] p-6 font-sans">
      <div className="flex shrink-0 flex-wrap items-center gap-4">
        <h1 className="text-[28px] font-bold text-[var(--oh-text)]">External Stocktakes</h1>
        <AdminPrimaryButton onClick={() => setImportOpen(true)}>
          <ImportIcon size={18} />
          Import Stocktake File
        </AdminPrimaryButton>
        <AdminPrimaryButton onClick={() => setExportOpen(true)}>
          <ExportIcon size={18} />
          Export Stocktake File
        </AdminPrimaryButton>
      </div>

      <ImportExternalStocktakeModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={reload}
      />

      <ExportExternalStocktakeModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />

      <div className="mt-6 min-h-0 flex-1 overflow-auto">
        <div className="flex items-center rounded-md bg-[var(--oh-surface-muted)] px-3 py-2 text-[13px] font-bold text-[var(--oh-text)]">
          <div className="w-[40%] px-4">Date Created</div>
          <div className="w-[35%] px-4">Outlet</div>
          <div className="w-[25%] px-4">Status</div>
        </div>

        {loading ? (
          <div role="status" aria-label="Loading external stocktakes" className="grid gap-2 py-3">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-[40%_35%_25%] gap-0 border-b border-[var(--oh-border)] py-3"><div className="mx-4 h-4 animate-pulse rounded bg-[var(--oh-surface-muted)]" /><div className="mx-4 h-4 animate-pulse rounded bg-[var(--oh-surface-muted)]" /><div className="mx-4 h-4 animate-pulse rounded bg-[var(--oh-surface-muted)]" /></div>)}
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            <span>{error}</span>
            <button type="button" onClick={reload} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold hover:bg-amber-100"><RefreshCw size={15} /> Retry</button>
          </div>
        ) : items.length === 0 ? (
          <p className="border-b border-[var(--oh-border)] px-4 py-10 text-center text-sm text-[var(--oh-text-secondary)]">No external stocktakes have been imported or exported yet.</p>
        ) : (
          items.map((row) => (
            <div key={row.id} className="flex border-b border-[var(--oh-border)] py-3 text-[14px] text-[var(--oh-text)]">
              <div className="w-[40%] px-4">{formatDate(row.timestamp)}</div>
              <div className="w-[35%] px-4">{row.outletName ?? "—"}</div>
              <div className="w-[25%] px-4">{formatStatus(row.status)}</div>
            </div>
          ))
        )}
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
