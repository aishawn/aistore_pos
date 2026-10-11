"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FrownIcon, SelectChevronIcon, ExportIcon, ImportIcon } from "@/components/icons";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useApi, useApiList, useDebouncedValue } from "@/hooks/useApi";
import { exportGiftCardsXlsx } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

interface GiftCard {
  id: string;
  clientId: string;
  outletId: string;
  code: string;
  originalAmount: number;
  currentAmount: number;
  expiry: string;
  status: string;
}

interface Outlet {
  id: string;
  name: string;
}

const EMPTY = (
  <div className="mt-12 flex items-center justify-center gap-10">
    <FrownIcon size={160} strokeWidth={1.5} className="text-black" />
    <div>
      <h2 className="text-[28px] font-bold text-black">No Results Found</h2>
      <p className="mt-2 text-[18px] text-black">We looked under every stone, but couldn&apos;t find a single one</p>
    </div>
  </div>
);

export default function GiftCardsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [redeemedExpired, setRedeemedExpired] = useState(false);
  const [outletId, setOutletId] = useState("");
  const [page, setPage] = useState(1);
  const [exportBusy, setExportBusy] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);
  const searchQuery = debouncedSearch.trim();

  const outlets = useApi<Outlet[]>("/api/outlets");

  const { items, total, loading, error } = useApiList<GiftCard>("/api/gift-cards", {
    code: searchQuery || undefined,
    redeemedExpiredOnly: redeemedExpired,
    outletId: outletId || undefined,
    page,
    size: PAGE_SIZE,
  });

  const exportQuery = {
    code: searchQuery || undefined,
    redeemedExpiredOnly: redeemedExpired,
    outletId: outletId || undefined,
  };

  async function handleExport() {
    setExportBusy(true);
    try {
      await exportGiftCardsXlsx(exportQuery);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <div className="flex items-start">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/giftcards/import")}
            className="flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2 text-[16px] font-medium text-black"
          >
            <ImportIcon size={18} /> Import Gift Cards
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exportBusy}
            className="flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2 text-[16px] font-medium text-black disabled:opacity-60"
          >
            <ExportIcon size={18} /> {exportBusy ? "Exporting…" : "Export Gift Cards"}
          </button>
        </div>
        <div className="ml-auto text-right leading-none">
          <div className="text-[28px] font-bold text-black">{total}</div>
          <div className="text-[14px] text-black">Results</div>
        </div>
      </div>

      <div className="mt-4 flex gap-4">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search of Gift Card Codes"
          className="h-[52px] flex-1 rounded-xl border-2 border-black px-4 text-[16px] outline-none placeholder:text-neutral-400"
        />
        <button
          type="button"
          role="switch"
          aria-checked={redeemedExpired}
          aria-label="Redeemed / Expired"
          onClick={() => {
            setRedeemedExpired((v) => !v);
            setPage(1);
          }}
          className="flex shrink-0 items-center gap-3 rounded-md border border-neutral-300 px-4 text-[16px] text-black"
        >
          <span
            className={cn(
              "flex h-7 w-12 items-center rounded-full p-1 transition-colors",
              redeemedExpired ? "justify-end bg-[#3aa0e3]" : "bg-neutral-300",
            )}
          >
            <span className="h-5 w-5 rounded-full bg-white" />
          </span>
          Redeemed / Expired
        </button>
      </div>

      <div className="relative mt-4">
        <select
          value={outletId}
          onChange={(e) => {
            setOutletId(e.target.value);
            setPage(1);
          }}
          className={cn(
            "h-[52px] w-full appearance-none rounded-lg border border-neutral-300 bg-white px-4 pr-10 text-[16px] outline-none",
            outletId ? "text-black" : "text-neutral-400",
          )}
        >
          <option value="">Outlet</option>
          {(outlets.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <SelectChevronIcon size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500" />
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="py-16 text-center text-[16px] text-neutral-400">Loading…</div>
        ) : error ? (
          <div className="py-16 text-center text-[16px] text-[#e2231a]">{error}</div>
        ) : items.length === 0 ? (
          EMPTY
        ) : (
          <>
            <ListTable
              columns={[
                { label: "Code" },
                { label: "Amount" },
                { label: "Status" },
                { label: "Expiry" },
              ]}
              rows={items.map((g) => [
                g.code,
                `$${Number(g.currentAmount).toFixed(2)}`,
                g.status,
                g.expiry,
              ])}
            />
            <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
