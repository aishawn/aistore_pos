"use client";

import { useState } from "react";
import { ExportIcon, ImportIcon } from "@/components/icons";
import { AdminPrimaryButton } from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
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
    <div className="flex h-full flex-col overflow-hidden bg-white p-6 font-sans">
      <div className="flex shrink-0 flex-wrap items-center gap-4">
        <h1 className="text-[28px] font-bold text-black">External Stocktakes</h1>
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
        <div className="flex items-center rounded-md bg-black px-3 py-2 text-[12px] font-bold text-white">
          <div className="w-[40%] px-4">Date Created</div>
          <div className="w-[35%] px-4">Outlet</div>
          <div className="w-[25%] px-4">Status</div>
        </div>

        <AsyncState loading={loading} error={error} empty={false}>
          {items.map((row) => (
            <div
              key={row.id}
              className="flex border-b border-neutral-200 py-3 text-[14px] text-black"
            >
              <div className="w-[40%] px-4">{formatDate(row.timestamp)}</div>
              <div className="w-[35%] px-4">{row.outletName ?? "—"}</div>
              <div className="w-[25%] px-4">{formatStatus(row.status)}</div>
            </div>
          ))}
        </AsyncState>
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
