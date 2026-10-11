"use client";

import { useState } from "react";
import { CircleCheckIcon, CircleXIcon, SelectChevronIcon, XIcon } from "@/components/icons";
import { AdminPageLayout, AdminPrimaryButton, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
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

function Amount({ value }: { value: number }) {
  const neg = value < 0;
  const abs = Math.abs(value);
  const dollars = Math.floor(abs);
  const cents = Math.round((abs - dollars) * 100).toString().padStart(2, "0");
  return (
    <span className="leading-none text-[var(--oh-text)]">
      <span className="text-[24px] font-semibold">
        {neg ? "-" : ""}${dollars}
      </span>
      <span className="align-top text-[14px]">.{cents}</span>
    </span>
  );
}

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
    <AdminPageLayout
      title="Sales History"
      subtitle="Browse completed and voided sales"
      count={total}
      fullBleed
      filters={
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col">
            <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">Date</span>
            <span className="flex h-10 w-full max-w-xl items-center justify-between rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[13px] text-[var(--oh-text)]">
              <span>28/05/2026 22:00:00 — 29/06/2026 21:59:59</span>
              <XIcon size={16} className="text-[var(--oh-muted)]" />
            </span>
          </label>
          <label className="flex flex-col">
            <span className="mb-1.5 text-[13px] font-medium text-[var(--oh-text-secondary)]">Amount</span>
            <span className="flex gap-3">
              <input placeholder="$ Min" className="h-10 w-[120px] rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] outline-none placeholder:text-[var(--oh-placeholder)]" />
              <input placeholder="$ Max" className="h-10 w-[120px] rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] outline-none placeholder:text-[var(--oh-placeholder)]" />
            </span>
          </label>
          <span className="flex h-10 min-w-[180px] flex-1 items-center justify-between rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 text-[14px] text-[var(--oh-placeholder)]">
            Payment Method
            <SelectChevronIcon size={16} className="text-[var(--oh-muted)]" />
          </span>
        </div>
      }
    >
      <div className="mb-4 flex gap-2">
        <AdminSecondaryButton className="flex-1 justify-center">Show Advanced Filters</AdminSecondaryButton>
        <AdminPrimaryButton className="flex-1 justify-center">Filter</AdminPrimaryButton>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white">
        <AsyncState loading={loading} error={error} empty={items.length === 0}>
          {items.map((s, i) => {
            const { date, time } = splitDateTime(s.createdAt);
            const voided = s.status === "VOIDED";
            return (
              <div
                key={s.id}
                className={cn(
                  "flex h-[72px] items-center border-b border-[var(--oh-border)] px-4 last:border-b-0",
                  i % 2 === 1 ? "bg-[var(--oh-surface)]/50" : "bg-white",
                )}
              >
                {voided ? (
                  <CircleXIcon size={24} strokeWidth={1.5} className="text-[var(--oh-danger)]" />
                ) : (
                  <CircleCheckIcon size={24} strokeWidth={1.5} className="text-[var(--oh-success)]" />
                )}

                <div className="ml-5 w-[150px] leading-tight">
                  <div className="text-[14px] text-[var(--oh-text)]">{date}</div>
                  <div className="text-[14px] text-[var(--oh-text-secondary)]">{time}</div>
                  <div className="text-[12px] text-[var(--oh-muted)]">#{s.invoiceId}</div>
                </div>

                <div className="text-[14px] text-[var(--oh-text-secondary)]">{s.userName}</div>

                <div className="ml-auto text-right">
                  <Amount value={Number(s.totalPrice)} />
                  {s.customerName && <div className="text-[13px] text-[var(--oh-text-secondary)]">{s.customerName}</div>}
                </div>
              </div>
            );
          })}
        </AsyncState>
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </div>
    </AdminPageLayout>
  );
}
