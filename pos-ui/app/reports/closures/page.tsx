"use client";

import { useState } from "react";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
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
  const { items, total, loading, error } = useApiList<RegisterClosure>("/api/register-closures", { page, size: PAGE_SIZE });

  return (
    <AdminPageLayout
      title="Register Closures"
      subtitle="Review register open and close records"
      count={total}
      filters={
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-[var(--oh-text-secondary)]">Date Range</span>
          <span className="flex h-10 items-center gap-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 font-mono text-[13px] text-[var(--oh-placeholder)]">
            DD/MM/YYYY HH:mm:ss <span className="flex-1 text-center">—</span> DD/MM/YYYY HH:mm:ss
          </span>
        </label>
      }
    >
      <p className="mb-3 text-right text-[13px] text-[var(--oh-muted)]">
        Showing {total} of {total} Register Closures
      </p>

      <div className="overflow-hidden rounded-lg border border-[var(--oh-border)] text-[14px]">
        <div className="flex border-b border-[var(--oh-border)] bg-[var(--oh-surface)] text-[13px] font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
          {COLS.map((c, i) => (
            <div key={c} className={`px-4 py-3 text-center ${i === 5 ? "w-[120px]" : "flex-1"} ${i > 0 ? "border-l border-[var(--oh-border)]" : ""}`}>
              {c}
            </div>
          ))}
        </div>
        <AsyncState loading={loading} error={error} empty={items.length === 0}>
          {items.map((r, i) => (
            <div
              key={r.id}
              className={`flex border-b border-[var(--oh-border)] last:border-b-0 ${i % 2 === 1 ? "bg-[var(--oh-surface)]/50" : "bg-white"}`}
            >
              <div className="flex-1 px-4 py-3.5 text-[var(--oh-text)]">{r.registerId}</div>
              <div className="flex-1 border-l border-[var(--oh-border)] px-4 py-3.5 text-center text-[var(--oh-text-secondary)]">{r.openedAt}</div>
              <div className="flex-1 border-l border-[var(--oh-border)] px-4 py-3.5 text-center text-[var(--oh-text-secondary)]">{r.closedAt}</div>
              <div className="flex-1 border-l border-[var(--oh-border)] px-4 py-3.5 text-center font-medium text-[var(--oh-text)]">{`$${Number(r.totalExpected || 0).toFixed(2)}`}</div>
              <div className="flex-1 border-l border-[var(--oh-border)] px-4 py-3.5 text-center font-medium text-[var(--oh-text)]">{`$${Number(r.totalReceived || 0).toFixed(2)}`}</div>
              <div className="flex w-[120px] items-center justify-center gap-1.5 border-l border-[var(--oh-border)] px-4 py-3.5 text-[13px] font-medium text-[var(--oh-orange)]">
                <ViewIcon size={16} /> View
              </div>
            </div>
          ))}
        </AsyncState>
      </div>
      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
    </AdminPageLayout>
  );
}
