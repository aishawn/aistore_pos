"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ListTable } from "@/components/admin/ListTable";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { formatAuDateTime } from "@/lib/au";
import { FilterDateRangePicker } from "@/components/admin/FilterDateRangePicker";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { NewStocktakeModal } from "@/components/admin/NewStocktakeModal";
import {
  AdminPageLayout,
  AdminPrimaryButton,
} from "@/components/admin/AdminPageLayout";
import { ScanIcon, ClipboardIcon, MenuIcon, XIcon } from "@/components/icons";
import { useApiList } from "@/hooks/useApi";
import { useAiCreateOpen } from "@/hooks/useAiCreateOpen";

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

const STATUS_OPTIONS = [
  { label: "In Progress", value: "IN_PROGRESS" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
];

interface Stocktake {
  id: string;
  name: string;
  type: string;
  outletId: string;
  status: string;
  createdAt: string;
  completedAt: string;
}

function formatTimestamp(ts?: string) {
  if (!ts) return "";
  return formatAuDateTime(ts);
}

export default function StocktakePage() {
  return (
    <Suspense fallback={null}>
      <StocktakePageInner />
    </Suspense>
  );
}

function StocktakePageInner() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [createdRange, setCreatedRange] = useState({ start: "", end: "" });
  const [completedRange, setCompletedRange] = useState({ start: "", end: "" });
  const {
    creating: newStocktakeOpen,
    setCreating: setNewStocktakeOpen,
    initial: stocktakePrefill,
    clearInitial: clearStocktakePrefill,
  } = useAiCreateOpen<{ name: string }>("stocktake");
  const [page, setPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { items, total, loading, error, reload } = useApiList<Stocktake>("/api/stocktakes", {
    status: status || undefined,
    createdFrom: createdRange.start || undefined,
    createdTo: createdRange.end || undefined,
    completedFrom: completedRange.start || undefined,
    completedTo: completedRange.end || undefined,
    page,
    size: PAGE_SIZE,
  });

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const hasActiveFilters =
    !!status || !!createdRange.start || !!createdRange.end || !!completedRange.start || !!completedRange.end;

  return (
    <AdminPageLayout
      title="Stocktakes"
      subtitle="Create and review stocktakes across outlets"
      compact
      actions={
        <>
          <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-4 py-2 text-center shadow-[var(--oh-shadow-card)]">
            <div className="text-[22px] font-bold leading-none text-[var(--oh-text)]">{total}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
              Results
            </div>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="dialog"
              aria-label="Menu"
              className="relative flex h-10 items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-orange)] px-3 text-[13px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-[var(--oh-orange-hover)]"
            >
              {menuOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
              Menu
              {hasActiveFilters && !menuOpen && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--oh-danger)] ring-2 ring-[var(--oh-surface)]" />
              )}
            </button>

            {menuOpen && (
              <div
                role="dialog"
                aria-label="Stocktakes menu"
                className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(960px,calc(100vw-2rem))] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-8 py-7 shadow-[var(--oh-shadow-card)]"
              >
                <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3">
                  <AdminPrimaryButton
                    className="w-full justify-center px-2 text-[13px]"
                    onClick={() => {
                      setMenuOpen(false);
                      clearStocktakePrefill();
                      setNewStocktakeOpen(true);
                    }}
                  >
                    <ClipboardIcon size={16} className="shrink-0" /> Advanced Stocktake
                  </AdminPrimaryButton>
                  <AdminPrimaryButton
                    className="w-full justify-center px-2 text-[13px]"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/stocktake/express");
                    }}
                  >
                    <ScanIcon size={16} className="shrink-0" /> Express Stocktake
                  </AdminPrimaryButton>
                  <AdminPrimaryButton
                    className="w-full justify-center px-2 text-[13px]"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/stocktake/external");
                    }}
                  >
                    <ScanIcon size={16} className="shrink-0" /> External Stocktakes
                  </AdminPrimaryButton>
                </div>

                <div className="mt-7 border-t border-[var(--oh-border)] pt-7">
                  <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-x-5 gap-y-5">
                    <FilterSelect
                      label="Status"
                      value={status}
                      onChange={(v) => {
                        setStatus(v);
                        setPage(1);
                      }}
                      options={STATUS_OPTIONS}
                      placeholder="All"
                    />
                    <FilterDateRangePicker
                      label="Created Between"
                      start={createdRange.start}
                      end={createdRange.end}
                      onChange={(range) => {
                        setCreatedRange(range);
                        setPage(1);
                      }}
                    />
                    <FilterDateRangePicker
                      label="Completed Between"
                      start={completedRange.start}
                      end={completedRange.end}
                      onChange={(range) => {
                        setCompletedRange(range);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      }
    >
      <AsyncState loading={loading} error={error} empty={items.length === 0}>
        <ListTable
          compact
          columns={[
            { label: "Name" },
            { label: "Status", align: "center" },
            { label: "Created", align: "center" },
          ]}
          rows={items.map((s) => [s.name, s.status, formatTimestamp(s.createdAt)])}
        />
        <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
      </AsyncState>

      <NewStocktakeModal
        open={newStocktakeOpen}
        initialName={stocktakePrefill?.name}
        onClose={() => {
          clearStocktakePrefill();
          setNewStocktakeOpen(false);
        }}
        onCreated={reload}
      />
    </AdminPageLayout>
  );
}
