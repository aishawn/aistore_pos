"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormDatePicker } from "@/components/admin/FormDatePicker";
import { FilterMultiSelect } from "@/components/admin/FilterMultiSelect";
import type { SelectOption } from "@/components/admin/FilterSelect";
import {
  StatementIcon,
  PrinterIcon,
  ViewIcon,
  DollarSignIcon,
  MenuIcon,
  XIcon,
} from "@/components/icons";
import {
  ViewAllStatementsModal,
  buildStatementsPreviewPath,
} from "@/components/admin/ViewAllStatementsModal";
import {
  AdminPageLayout,
  AdminPrimaryButton,
  AdminSearchInput,
} from "@/components/admin/AdminPageLayout";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { DROPDOWN_PAGE_SIZE } from "@/lib/pagination";
import { fetchAndPrintBalances } from "@/lib/printCustomerBalances";

interface Customer {
  id: string;
  name: string;
  currentOwing: number | null;
}

interface Named {
  id: string;
  name: string;
}

interface AppliedFilters {
  groupIds: string[];
  minOwing: string;
  maxOwing: string;
  asOf: string;
}

const PAGE_SIZE = 20;

const toOptions = (rows?: Named[] | null): SelectOption[] =>
  (rows ?? []).map((r) => ({ label: r.name, value: r.id }));

const emptyFilters: AppliedFilters = { groupIds: [], minOwing: "", maxOwing: "", asOf: "" };

const labelClass =
  "mb-1 block h-4 truncate whitespace-nowrap text-[13px] font-medium leading-4 text-[var(--oh-text-secondary)]";
const inputClass =
  "h-8 min-w-0 flex-1 rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-[13px] text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-placeholder)] focus:border-[var(--oh-orange)] focus:ring-1 focus:ring-[var(--oh-orange)]";

export default function BalancesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [draftGroupIds, setDraftGroupIds] = useState<string[]>([]);
  const [draftMinOwing, setDraftMinOwing] = useState("");
  const [draftMaxOwing, setDraftMaxOwing] = useState("");
  const [draftAsOf, setDraftAsOf] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [printing, setPrinting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [statementModal, setStatementModal] = useState<{
    open: boolean;
    customerId?: string;
    customerName?: string;
  }>({ open: false });

  const debouncedSearch = useDebouncedValue(search, 300);

  const groups = useApiList<Named>("/api/customers/groups", { page: 1, size: DROPDOWN_PAGE_SIZE });

  const { items, total, loading, error } = useApiList<Customer>("/api/customers", {
    name: debouncedSearch.trim() || undefined,
    groupIds: applied.groupIds.length > 0 ? applied.groupIds.join(",") : undefined,
    minOwing: applied.minOwing || undefined,
    maxOwing: applied.maxOwing || undefined,
    asOf: applied.asOf || undefined,
    page,
    size: PAGE_SIZE,
  });
  const totalOwing = items.reduce((sum, c) => sum + Number(c.currentOwing || 0), 0);

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

  function applyFilters() {
    setApplied({
      groupIds: draftGroupIds,
      minOwing: draftMinOwing.trim(),
      maxOwing: draftMaxOwing.trim(),
      asOf: draftAsOf,
    });
    setPage(1);
    setMenuOpen(false);
  }

  async function handlePrintBalances() {
    setPrinting(true);
    try {
      await fetchAndPrintBalances({
        name: debouncedSearch.trim() || undefined,
        groupIds: applied.groupIds.length > 0 ? applied.groupIds.join(",") : undefined,
        minOwing: applied.minOwing || undefined,
        maxOwing: applied.maxOwing || undefined,
        asOf: applied.asOf || undefined,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to print balances");
    } finally {
      setPrinting(false);
    }
  }

  const hasActiveFilters =
    draftGroupIds.length > 0 || !!draftMinOwing.trim() || !!draftMaxOwing.trim() || !!draftAsOf;

  return (
    <AdminPageLayout
      title="Balances"
      subtitle="View customer balances, statements and payments"
      compact
      search={
        <AdminSearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search for Customers"
        />
      }
      actions={
        <>
          <div className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white px-4 py-2 text-center shadow-[var(--oh-shadow-card)]">
            <div className="text-[22px] font-bold leading-none text-[var(--oh-text)]">{total}</div>
            <div className="text-[13px] font-semibold uppercase tracking-wider text-[var(--oh-muted)]">
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
              className="relative flex h-11 items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-3 text-[13px] font-semibold uppercase tracking-wide text-white outline-none transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] focus-visible:ring-offset-2"
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
                aria-label="Balances menu"
                className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(960px,calc(100vw-2rem))] rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)] sm:p-6"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
                  <AdminPrimaryButton
                    className="w-full justify-center px-2 text-[13px]"
                    onClick={() => {
                      setMenuOpen(false);
                      setStatementModal({ open: true });
                    }}
                  >
                    <StatementIcon size={16} className="shrink-0" /> View All Statements
                  </AdminPrimaryButton>
                  <AdminPrimaryButton
                    className="w-full justify-center px-2 text-[13px]"
                    disabled={printing}
                    onClick={() => {
                      void handlePrintBalances();
                    }}
                  >
                    <PrinterIcon size={16} className="shrink-0" />{" "}
                    {printing ? "Preparing…" : "Print Balances"}
                  </AdminPrimaryButton>
                </div>

                <div className="mt-5 border-t border-[var(--oh-border)] pt-5 sm:mt-6 sm:pt-6">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-x-5 sm:gap-y-5">
                    <FilterMultiSelect
                      label="Customer Group"
                      options={[{ label: "No Group", value: "__none__" }, ...toOptions(groups.items)]}
                      values={draftGroupIds}
                      onChange={setDraftGroupIds}
                    />
                    <label className="flex min-w-0 w-full flex-col font-sans">
                      <span className={labelClass}>Balances as of</span>
                      <div className="[&_button]:h-8 [&_button]:rounded-md [&_button]:px-2.5 [&_button]:text-[13px]">
                        <FormDatePicker
                          value={draftAsOf}
                          onChange={setDraftAsOf}
                          placeholder="Today"
                          compact
                          showTodayWhenToday
                        />
                      </div>
                    </label>
                    <label className="flex min-w-0 w-full flex-col font-sans">
                      <span className={labelClass}>Customer Balance Between</span>
                      <span className="flex gap-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draftMinOwing}
                          onChange={(e) => setDraftMinOwing(e.target.value)}
                          placeholder="$ Min"
                          aria-label="Minimum customer balance"
                          className={inputClass}
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draftMaxOwing}
                          onChange={(e) => setDraftMaxOwing(e.target.value)}
                          placeholder="$ Max"
                          aria-label="Maximum customer balance"
                          className={inputClass}
                        />
                      </span>
                    </label>
                  </div>

                  <div className="mt-6 flex items-center justify-end">
                    <AdminPrimaryButton onClick={applyFilters}>Filter</AdminPrimaryButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      }
    >
      <div className="overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] text-[13px]">
        <div className="md:hidden">
          <AsyncState loading={loading} error={error} empty={items.length === 0}>
            {items.map((c) => (
              <article key={c.id} className="border-b border-[var(--oh-border)] bg-white p-4 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words font-semibold text-[var(--oh-text)]">{c.name ?? ""}</p>
                  <p className="shrink-0 text-right text-lg font-semibold tabular-nums text-[var(--oh-text)]">${Number(c.currentOwing || 0).toFixed(2)}</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--oh-border)] pt-3">
                  <button type="button" aria-label={`View ${c.name}`} onClick={() => router.push(`/customers/${c.id}/view`)} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-[var(--oh-info)] outline-none hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"><ViewIcon size={16} /> View</button>
                  <button type="button" aria-label={`View statement for ${c.name}`} onClick={() => setStatementModal({ open: true, customerId: c.id, customerName: c.name ?? "" })} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-[var(--oh-orange-dark)] outline-none hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"><StatementIcon size={16} /> Statement</button>
                  <button type="button" aria-label={`Make payment for ${c.name}`} onClick={() => router.push(`/customers/${c.id}/payment`)} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-[var(--oh-success)] outline-none hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"><DollarSignIcon size={16} /> Payment</button>
                </div>
              </article>
            ))}
          </AsyncState>
          {items.length > 0 && <div className="flex items-center justify-between gap-3 bg-[var(--oh-surface)] px-4 py-3 text-sm"><span className="font-medium text-[var(--oh-muted)]">This page total</span><span className="font-semibold tabular-nums text-[var(--oh-text)]">${totalOwing.toFixed(2)}</span></div>}
        </div>

        <div className="hidden md:block">
          <div className="flex bg-[var(--oh-primary)] font-semibold text-white">
            <div className="w-[260px] border-r border-white/20 px-4 py-3 text-center">Customer</div>
            <div className="w-[260px] border-r border-white/20 px-4 py-3 text-center">Total Balance</div>
            <div className="flex-1 px-4 py-3 text-center">Actions</div>
          </div>
          <AsyncState loading={loading} error={error} empty={items.length === 0}>
            {items.map((c) => (
              <div key={c.id} className="flex items-center border-b border-[var(--oh-border)] last:border-b-0">
              <div className="w-[260px] border-r border-[var(--oh-border)] px-4 py-4 text-[var(--oh-text)]">
                {c.name ?? ""}
              </div>
              <div className="w-[260px] border-r border-[var(--oh-border)] px-4 py-4 text-center text-[var(--oh-text)]">
                {`$${Number(c.currentOwing || 0).toFixed(2)}`}
              </div>
              <div className="flex flex-1 items-center justify-around px-4 py-3 text-center text-[13px]">
                <button
                  type="button"
                  onClick={() => router.push(`/customers/${c.id}/view`)}
                  className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md px-3 text-[var(--oh-info)] outline-none transition-opacity hover:bg-[var(--oh-surface)] hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
                >
                  <ViewIcon size={18} /> View Customer
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setStatementModal({ open: true, customerId: c.id, customerName: c.name ?? "" })
                  }
                  className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md px-3 text-[var(--oh-orange-dark)] outline-none transition-opacity hover:bg-[var(--oh-surface)] hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
                >
                  <StatementIcon size={18} /> View Statement
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/customers/${c.id}/payment`)}
                  className="flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md px-3 text-[var(--oh-success)] outline-none transition-opacity hover:bg-[var(--oh-surface)] hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)]"
                >
                  <DollarSignIcon size={18} /> Make Payment
                </button>
              </div>
            </div>
          ))}
          </AsyncState>
          {items.length > 0 && <div className="flex bg-[var(--oh-primary)] font-semibold text-white">
            <div className="w-[260px] border-r border-white/20 px-4 py-3 text-right text-xs uppercase tracking-wide">This page total</div>
            <div className="w-[260px] border-r border-white/20 px-4 py-3 text-center">
              {`$${totalOwing.toFixed(2)}`}
            </div>
            <div className="flex-1 px-4 py-3" />
          </div>}
        </div>
      </div>

      <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />

      <ViewAllStatementsModal
        open={statementModal.open}
        customerName={statementModal.customerName}
        onClose={() => setStatementModal({ open: false })}
        onView={(params) => {
          router.push(
            buildStatementsPreviewPath({
              ...params,
              customerId: statementModal.customerId,
              name: statementModal.customerId ? undefined : debouncedSearch.trim() || undefined,
            }),
          );
        }}
      />
    </AdminPageLayout>
  );
}
