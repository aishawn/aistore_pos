"use client";

import { useState } from "react";
import { CircleCheckIcon, CircleXIcon, SelectChevronIcon, XIcon } from "@/components/icons";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

interface Sale {
  id: string;
  invoiceId: string;
  status: string;
  totalPrice: number;
  outstanding: number;
  userId: string;
  customerId: string;
  registerId: string;
  createdAt: string;
  userName: string;
  customerName: string;
}

/** Big-dollar / small-cents amount, matching the Orithos sale styling. */
function Amount({ value }: { value: number }) {
  const neg = value < 0;
  const abs = Math.abs(value);
  const dollars = Math.floor(abs);
  const cents = Math.round((abs - dollars) * 100).toString().padStart(2, "0");
  return (
    <span className="leading-none text-black">
      <span className="text-[32px]">
        {neg ? "-" : ""}${dollars}
      </span>
      <span className="align-top text-[20px]">.{cents}</span>
    </span>
  );
}

/** "2026-06-27T12:38:27" → { date: "27/06/2026", time: "12:38:27" }. */
function splitDateTime(createdAt: string): { date: string; time: string } {
  const [datePart = "", timePartRaw = ""] = createdAt.split("T");
  const time = timePartRaw.slice(0, 8);
  const [y, m, d] = datePart.split("-");
  const date = y && m && d ? `${d}/${m}/${y}` : datePart;
  return { date, time };
}

export default function SalesHistoryPage() {
  const [page, setPage] = useState(1);
  const { items, total, loading, error } = useApiList<Sale>("/api/sales", { page, size: PAGE_SIZE });

  return (
    <div className="flex h-full flex-col bg-white font-sans">
      {/* Filter bar */}
      <div className="flex shrink-0 flex-wrap items-end gap-4 px-6 py-3">
        <label className="flex flex-col text-[13px] text-neutral-600">
          Date
          <span className="mt-1 flex h-[46px] w-[600px] max-w-full items-center justify-between rounded border border-[#bdbdbd] px-3 text-[16px] text-black">
            <span>28/05/2026 22:00:00&nbsp;&nbsp;—&nbsp;&nbsp;29/06/2026 21:59:59</span>
            <XIcon size={18} className="text-neutral-500" />
          </span>
        </label>
        <label className="flex flex-col text-[13px] text-neutral-600">
          Amount
          <span className="mt-1 flex gap-4">
            <span className="flex h-[46px] w-[150px] items-center rounded border border-[#bdbdbd] px-3 text-[16px] text-neutral-400">$</span>
            <span className="flex h-[46px] w-[150px] items-center rounded border border-[#bdbdbd] px-3 text-[16px] text-neutral-400">$</span>
          </span>
        </label>
        <span className="mt-1 flex h-[46px] flex-1 items-center justify-between rounded border border-[#bdbdbd] px-3 text-[16px] text-neutral-400">
          Payment Method
          <SelectChevronIcon size={18} className="text-neutral-500" />
        </span>
      </div>

      {/* Filter actions split bar */}
      <div className="flex h-[50px] shrink-0">
        <button type="button" className="flex-1 bg-[#f8f8f8] text-[16px] text-black">
          Show Advanced Filters
        </button>
        <button type="button" className="flex-1 bg-[#5cb3e0] text-[16px] text-white">
          Filter
        </button>
      </div>

      {/* Sale list */}
      <div className="min-h-0 flex-1 overflow-auto">
        <AsyncState loading={loading} error={error} empty={items.length === 0}>
          {items.map((s, i) => {
            const { date, time } = splitDateTime(s.createdAt);
            const voided = s.status === "VOIDED";
            return (
              <div
                key={s.id}
                className={cn(
                  "flex h-[89px] items-center px-4",
                  i % 2 === 1 ? "bg-[#ededed]" : "bg-white",
                )}
              >
                {voided ? (
                  <CircleXIcon size={30} strokeWidth={1.5} className="text-[#e2231a]" />
                ) : (
                  <CircleCheckIcon size={30} strokeWidth={1.5} className="text-black" />
                )}

                <div className="ml-6 w-[170px] leading-tight">
                  <div className="text-[18px] text-black">{date}</div>
                  <div className="text-[18px] text-black">{time}</div>
                  <div className="text-[14px] text-neutral-500">#{s.invoiceId}</div>
                </div>

                <div className="text-[16px] text-black">{s.userName}</div>

                <div className="ml-auto text-right">
                  <Amount value={Number(s.totalPrice)} />
                  {s.customerName && <div className="text-[16px] text-black">{s.customerName}</div>}
                </div>
              </div>
            );
          })}
        </AsyncState>
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
