"use client";

import { useState } from "react";
import { ViewIcon } from "@/components/icons";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList } from "@/hooks/useApi";

const PAGE_SIZE = 20;

interface RegisterClosure {
  id: string;
  registerId: string;
  userId: string;
  totalExpected: number;
  totalReceived: number;
  openedAt: string;
  closedAt: string;
}

const COLS = ["Register", "Open Time", "Close Time", "Expected", "Received", "Actions"];

export default function RegisterClosuresPage() {
  const [page, setPage] = useState(1);
  const { items, total, loading, error, reload } = useApiList<RegisterClosure>("/api/register-closures", { page, size: PAGE_SIZE });

  return (
    <div className="h-full overflow-auto bg-white p-6 font-sans">
      <h1 className="text-[34px] font-bold text-black">Register Closures</h1>

      <label className="mt-4 block">
        <span className="text-[16px] text-black">Date Range</span>
        <span className="mt-1 flex h-[56px] items-center gap-4 rounded-lg border border-neutral-300 px-4 font-mono text-[16px] text-neutral-400">
          DD/MM/YYYY HH:mm:ss <span className="flex-1 text-center">—</span> DD/MM/YYYY HH:mm:ss
        </span>
      </label>

      <p className="mt-3 text-right text-[15px] text-neutral-500">Showing {total} of {total} Register Closures</p>

      <div className="mt-2 border border-neutral-300 text-[16px]">
        <div className="flex font-bold text-black">
          {COLS.map((c, i) => (
            <div key={c} className={`px-4 py-3 text-center ${i === 5 ? "w-[140px]" : "flex-1"} ${i > 0 ? "border-l border-neutral-300" : ""}`}>{c}</div>
          ))}
        </div>
        <AsyncState loading={loading} error={error} empty={items.length === 0} onRetry={reload}>
          {items.map((r) => (
            <div key={r.id} className="flex border-t border-neutral-300 bg-[#f8f8f8]">
              <div className="flex-1 px-4 py-4 text-black">{r.registerId}</div>
              <div className="flex-1 border-l border-neutral-300 px-4 py-4 text-center text-black">{r.openedAt}</div>
              <div className="flex-1 border-l border-neutral-300 px-4 py-4 text-center text-black">{r.closedAt}</div>
              <div className="flex-1 border-l border-neutral-300 px-4 py-4 text-center text-black">{`$${Number(r.totalExpected || 0).toFixed(2)}`}</div>
              <div className="flex-1 border-l border-neutral-300 px-4 py-4 text-center text-black">{`$${Number(r.totalReceived || 0).toFixed(2)}`}</div>
              <div className="flex w-[140px] items-center justify-center gap-2 border-l border-neutral-300 px-4 py-4 text-[var(--sf-tab-blue)]"><ViewIcon size={18} /> View</div>
            </div>
          ))}
        </AsyncState>
      </div>
      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
    </div>
  );
}
