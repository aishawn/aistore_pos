"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { AlertCircle, Gift, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { getRetailGiftCards, getOrithosSession, type RetailGiftCardRecord } from "@/lib/retail-api";
import { useDebouncedValue } from "@/hooks/useApi";

const PAGE_SIZE = 40;
const money = (amount: number, currency?: string | null) => `${currency ?? "Currency unknown"} ${Number(amount).toFixed(2)}`;

export function OdooGiftCardsPage() {
  const revision = useRef(0);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [items, setItems] = useState<RetailGiftCardRecord[]>([]);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void getOrithosSession().then((user) => setConnected(Boolean(user))).catch(() => setConnected(false));
  }, [refreshKey]);

  const load = useCallback(async () => {
    if (connected !== true) return;
    const request = ++revision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getRetailGiftCards(debouncedQuery, offset, PAGE_SIZE);
      if (request !== revision.current) return;
      setAvailable(page.available);
      setMessage(page.message ?? null);
      setItems(page.items);
      setHasNext(page.hasNext);
    } catch (cause) {
      if (request !== revision.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load gift cards.");
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, [connected, debouncedQuery, offset]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => { setOffset(0); }, [debouncedQuery]);

  if (connected === false) {
    return (
      <AdminPageLayout title="Gift Cards" subtitle="Orithos loyalty / gift card balances">
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <AlertCircle className="mb-2" size={20} />
          <p className="font-semibold">Connect Orithos to check gift cards</p>
          <Link href="/settings/integrations" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Connect Orithos</Link>
        </section>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Gift Cards"
      subtitle="Gift card balances only. Issuing and redemption are managed in Orithos."
      count={available && !loading && !error ? items.length : undefined}
      countLabel="Cards on this page"
      actions={
        <AdminSecondaryButton onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </AdminSecondaryButton>
      }
    >
      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
          <span>{error}</span>
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="inline-flex min-h-11 items-center rounded-md border border-rose-300 bg-white px-3 font-semibold">Retry</button>
        </div>
      )}

      {available === false && !loading && !error && (
        <section role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950 sm:p-6">
          <div className="flex items-start gap-3">
            <Gift className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
            <div>
              <h2 className="font-semibold">Orithos Loyalty is not available yet</h2>
              <p className="mt-2 text-sm">Gift cards are not enabled. A store administrator can configure them under Integrations.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/customers" className="inline-flex min-h-11 items-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white">Open customers</Link>
                <Link href="/settings/integrations" className="inline-flex min-h-11 items-center rounded-md border border-amber-300 bg-white px-4 text-sm font-medium">Integration status</Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {available === true && (
        <>
          {message && <p className="mb-4 text-sm text-[var(--oh-muted)]">{message}</p>}
          <label className="mb-4 flex h-11 max-w-xl items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3">
            <Search size={16} className="text-[var(--oh-muted)]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search gift card code or customer" className="min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Search gift cards" />
          </label>
          {!error && items.length === 0 && <p role="status" className="mb-4 text-sm md:hidden">{loading ? "Loading gift cards…" : "No gift cards found"}</p>}
          <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white">
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Program</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Balance</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-[var(--oh-muted)]"><LoaderCircle className="mr-2 inline animate-spin" size={15} />Loading gift cards…</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--oh-muted)]">No gift cards found</td></tr>
                ) : items.map((card) => (
                  <tr key={card.id}>
                    <td className="px-4 py-3 font-medium text-[var(--oh-text)]">{card.code}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{card.partner ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{card.program ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{card.status}{card.expiry ? ` · ${card.expiry}` : ""}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(card.balance, card.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] md:hidden">
              {items.map((card) => (
                <article key={card.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--oh-text)]">{card.code}</p>
                      <p className="text-xs text-[var(--oh-muted)]">{card.partner ?? "No customer"} · {card.status}</p>
                    </div>
                    <p className="font-semibold">{money(card.balance, card.currency)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 pr-32 text-sm text-[var(--oh-muted)]">
            <span>{items.length ? `Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
            <div className="flex gap-2">
              <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} className="inline-flex h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 disabled:opacity-40">Previous</button>
              <button type="button" disabled={!hasNext || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)} className="inline-flex h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 disabled:opacity-40">Next</button>
            </div>
          </footer>
        </>
      )}

      {loading && available === null && !error && (
        <p className="flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Checking Orithos gift card capability…</p>
      )}
    </AdminPageLayout>
  );
}
