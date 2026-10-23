"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, LoaderCircle, Plus } from "lucide-react";
import { getOdooTransfers, OdooApiError, type OdooTransferListItem, type OdooTransfersBootstrap } from "@/lib/odoo-api";

function stateLabel(state: string) {
  switch (state) {
    case "done": return "Done";
    case "assigned": return "Ready";
    case "confirmed": return "Waiting";
    case "draft": return "Draft";
    case "cancel": return "Cancelled";
    default: return state;
  }
}

export function StockTransfersPage({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<OdooTransfersBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getOdooTransfers());
    } catch (cause) {
      setData(null);
      setError(cause instanceof OdooApiError ? cause.message : "Could not load transfers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items: OdooTransferListItem[] = data?.items ?? [];
  const canCreate = (data?.locations.length ?? 0) >= 2;

  const newHref = embedded ? "/purchases/odoo?tab=transfer-new" : "/stock/transfers/new";
  const body = (
        <div className={`flex flex-col gap-4 ${embedded ? "" : "mx-auto w-full max-w-6xl"}`}>
          {!embedded && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm text-[var(--oh-muted)]">Move stock between warehouses in this company.</p>
              <Link
                href={newHref}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${
                  canCreate
                    ? "bg-[var(--oh-primary)] text-white hover:bg-[var(--oh-primary-hover)]"
                    : "pointer-events-none bg-[var(--oh-surface)] text-[var(--oh-muted)] ring-1 ring-[var(--oh-border)]"
                }`}
                aria-disabled={!canCreate}
              >
                <Plus size={17} />
                New transfer
              </Link>
            </div>
          )}
          {embedded && canCreate && (
            <div className="flex justify-end">
              <Link href={newHref} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
                <Plus size={17} /> New transfer
              </Link>
            </div>
          )}
          {data?.note && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{data.note}</div>
          )}
          {loading && (
            <div role="status" className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <LoaderCircle size={17} className="animate-spin" /> Loading transfers…
            </div>
          )}
          {error && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center justify-center rounded-md border border-rose-300 bg-white px-3 text-sm font-semibold">Retry</button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white px-6 py-12 text-center">
              <ArrowRightLeft className="mx-auto text-[var(--oh-primary)]" size={28} />
              <h2 className="mt-3 text-sm font-semibold text-[var(--oh-text)]">No internal transfers yet</h2>
              <p className="mt-1 text-sm text-[var(--oh-muted)]">
                {canCreate ? "Create a move between two warehouse stock locations." : "Add a second warehouse/location in Odoo first."}
              </p>
            </div>
          )}

          {items.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                  <tr>
                    <th className="px-4 py-3">Transfer</th>
                    <th className="px-4 py-3">From</th>
                    <th className="px-4 py-3">To</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--oh-border)]">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-semibold text-[var(--oh-text)]">{item.name}</td>
                      <td className="px-4 py-3">{item.fromLocation || "—"}</td>
                      <td className="px-4 py-3">{item.toLocation || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-[var(--oh-surface)] px-2.5 py-1 text-xs font-semibold">{stateLabel(item.state)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--oh-muted)]">{item.origin || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
  );

  if (embedded) return body;

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock · Moves</p>
          <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Transfers</h1>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">{body}</div>
    </main>
  );
}
