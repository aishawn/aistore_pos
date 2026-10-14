"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Gift, LoaderCircle, Search, Upload } from "lucide-react";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { ListTable } from "@/components/admin/ListTable";
import { Pagination } from "@/components/admin/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useApi, useApiList, useDebouncedValue } from "@/hooks/useApi";
import { exportGiftCardsXlsx } from "@/lib/api";

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

const money = (amount: number) => `$${Number(amount).toFixed(2)}`;

export default function GiftCardsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [redeemedExpired, setRedeemedExpired] = useState(false);
  const [outletId, setOutletId] = useState("");
  const [page, setPage] = useState(1);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const searchQuery = debouncedSearch.trim();
  const outlets = useApi<Outlet[]>("/api/outlets");
  const { items, total, loading, error, reload } = useApiList<GiftCard>("/api/gift-cards", {
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
    setExportError(null);
    try {
      await exportGiftCardsXlsx(exportQuery);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Export failed. Please try again.");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <AdminPageLayout
      title="Gift Cards"
      subtitle="Find, import, and export gift card balances"
      count={loading || error ? undefined : total}
      countLabel="Gift cards"
      actions={
        <>
          <AdminSecondaryButton className="min-h-11" onClick={() => router.push("/giftcards/import")}>
            <Upload size={16} aria-hidden="true" /> Import
          </AdminSecondaryButton>
          <AdminSecondaryButton className="min-h-11" onClick={() => void handleExport()} disabled={exportBusy}>
            {exportBusy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
            {exportBusy ? "Exporting…" : "Export"}
          </AdminSecondaryButton>
        </>
      }
    >
      <div className="mb-4 grid gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-3 shadow-[var(--oh-shadow-card)] sm:grid-cols-[minmax(220px,1fr)_minmax(180px,0.7fr)_auto] sm:items-center">
        <label className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg border border-[var(--oh-border)] px-3 text-[var(--oh-muted)] focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
          <Search size={17} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            aria-label="Search gift card codes"
            placeholder="Search gift card codes"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[var(--oh-text)] outline-none placeholder:text-[var(--oh-muted)]"
          />
        </label>

        <label className="relative min-w-0">
          <span className="sr-only">Filter by outlet</span>
          <select
            value={outletId}
            onChange={(event) => { setOutletId(event.target.value); setPage(1); }}
            disabled={outlets.loading || Boolean(outlets.error)}
            className="h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
          >
            <option value="">{outlets.loading ? "Loading outlets…" : outlets.error ? "Outlets unavailable" : "All outlets"}</option>
            {(outlets.data ?? []).map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
          </select>
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={redeemedExpired}
          aria-label="Filter to redeemed or expired gift cards"
          onClick={() => { setRedeemedExpired((value) => !value); setPage(1); }}
          className="inline-flex min-h-11 items-center justify-start gap-2.5 rounded-lg px-2 text-left text-sm font-medium text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] sm:justify-center"
        >
          <span className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${redeemedExpired ? "justify-end bg-[var(--oh-primary)]" : "bg-slate-300"}`}>
            <span className="size-5 rounded-full bg-white shadow-sm" />
          </span>
          Redeemed / expired
        </button>
      </div>

      {outlets.error && <p role="status" className="mb-3 text-xs text-[var(--oh-muted)]">Outlet filtering is unavailable because outlets could not be loaded.</p>}
      {exportError && <p role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{exportError}</p>}

      {loading ? (
        <div role="status" className="flex flex-col items-center gap-2 py-16 text-sm text-[var(--oh-muted)]">
          <LoaderCircle size={20} className="animate-spin text-[var(--oh-primary)]" aria-hidden="true" />
          Loading gift cards…
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>{error}</p>
          <button type="button" onClick={reload} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-4 font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800">Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white px-5 py-12 text-center">
          <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-[var(--oh-surface)] text-[var(--oh-primary)]"><Gift size={19} aria-hidden="true" /></span>
          <h2 className="mt-3 text-base font-semibold text-[var(--oh-text)]">No gift cards found</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-[var(--oh-muted)]">Try changing the search or outlet filters, or import gift cards to get started.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-[var(--oh-border)] md:block">
            <ListTable
              headerClassName="bg-[var(--oh-surface)] text-[var(--oh-text-secondary)] ring-1 ring-inset ring-[var(--oh-border)]"
              columns={[{ label: "Code" }, { label: "Original value", align: "right" }, { label: "Balance", align: "right" }, { label: "Status" }, { label: "Expiry" }]}
              rows={items.map((card) => [
                <span key="code" className="font-semibold text-[var(--oh-text)]">{card.code}</span>,
                <span key="original" className="tabular-nums text-[var(--oh-text-secondary)]">{money(card.originalAmount)}</span>,
                <span key="balance" className="font-semibold tabular-nums text-[var(--oh-text)]">{money(card.currentAmount)}</span>,
                <span key="status" className="inline-flex rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-text-secondary)]">{card.status}</span>,
                <span key="expiry" className="text-[var(--oh-text-secondary)]">{card.expiry || "—"}</span>,
              ])}
            />
          </div>
          <ul className="grid gap-3 md:hidden">
            {items.map((card) => (
              <li key={card.id} className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="break-all font-semibold text-[var(--oh-text)]">{card.code}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">Gift card</p></div>
                  <span className="shrink-0 rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-medium text-[var(--oh-text-secondary)]">{card.status}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--oh-border)] pt-3">
                  <div><p className="text-xs text-[var(--oh-muted)]">Balance</p><p className="mt-1 text-sm font-semibold tabular-nums text-[var(--oh-text)]">{money(card.currentAmount)}</p></div>
                  <div><p className="text-xs text-[var(--oh-muted)]">Original value</p><p className="mt-1 text-sm tabular-nums text-[var(--oh-text-secondary)]">{money(card.originalAmount)}</p></div>
                  <div className="col-span-2"><p className="text-xs text-[var(--oh-muted)]">Expiry</p><p className="mt-1 text-sm text-[var(--oh-text-secondary)]">{card.expiry || "No expiry"}</p></div>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </>
      )}
    </AdminPageLayout>
  );
}
