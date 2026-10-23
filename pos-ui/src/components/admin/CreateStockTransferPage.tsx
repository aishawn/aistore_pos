"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search, Trash2 } from "lucide-react";
import {
  createOdooStockTransfer,
  getOdooTransfers,
  OdooApiError,
  searchOdooRecords,
  type OdooTransferLocation,
} from "@/lib/odoo-api";

interface Named {
  id: number;
  name: string;
  display_name?: string;
}

interface LineDraft {
  productId: number;
  name: string;
  quantity: number;
}

export function CreateStockTransferPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<OdooTransferLocation[]>([]);
  const [noteHint, setNoteHint] = useState<string | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [note, setNote] = useState("");
  const [validate, setValidate] = useState(true);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Named[]>([]);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bootstrap = await getOdooTransfers();
      setLocations(bootstrap.locations);
      setNoteHint(bootstrap.note || null);
      if (bootstrap.locations[0]) setFromId(String(bootstrap.locations[0].id));
      if (bootstrap.locations[1]) setToId(String(bootstrap.locations[1].id));
    } catch (cause) {
      setError(cause instanceof OdooApiError ? cause.message : "Could not load transfer locations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const page = await searchOdooRecords<Named>("products", { query: query.trim(), limit: 8 });
          setHits(page.items ?? []);
        } catch {
          setHits([]);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function onSubmit() {
    if (!fromId || !toId || fromId === toId || lines.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createOdooStockTransfer({
        fromLocationId: Number(fromId),
        toLocationId: Number(toId),
        note: note.trim() || undefined,
        validate,
        lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      });
      router.push(`/stock/transfers?created=${encodeURIComponent(created.name)}`);
    } catch (cause) {
      setError(cause instanceof OdooApiError ? cause.message : "Could not create transfer.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] text-sm text-[var(--oh-muted)]">
        <span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> Loading locations…</span>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock · Transfers</p>
          <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">New transfer</h1>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">Same-company warehouse move. Does not invent products or GST.</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {noteHint && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{noteHint}</div>}
          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">From</span>
                <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="h-11 w-full rounded-lg border border-[var(--oh-border)] px-3">
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">To</span>
                <select value={toId} onChange={(e) => setToId(e.target.value)} className="h-11 w-full rounded-lg border border-[var(--oh-border)] px-3">
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="mb-1.5 block font-medium">Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="h-11 w-full rounded-lg border border-[var(--oh-border)] px-3" placeholder="Optional origin / reason" />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={validate} onChange={(e) => setValidate(e.target.checked)} />
              Validate immediately (move stock now)
            </label>
          </section>

          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
            <h2 className="text-sm font-semibold text-[var(--oh-text)]">Products</h2>
            <label className="relative mt-3 block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search POS products…"
                className="h-11 w-full rounded-lg border border-[var(--oh-border)] pl-9 pr-3 text-sm"
              />
            </label>
            {hits.length > 0 && (
              <ul className="mt-2 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)]">
                {hits.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-white"
                      onClick={() => {
                        setLines((current) => {
                          if (current.some((line) => line.productId === hit.id)) return current;
                          return [...current, { productId: hit.id, name: hit.display_name || hit.name, quantity: 1 }];
                        });
                        setQuery("");
                        setHits([]);
                      }}
                    >
                      {hit.display_name || hit.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-3 divide-y divide-[var(--oh-border)]">
              {lines.map((line, index) => (
                <li key={line.productId} className="flex items-center gap-3 py-3">
                  <p className="min-w-0 flex-1 text-sm font-medium text-[var(--oh-text)]">{line.name}</p>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) => {
                      const quantity = Number(e.target.value);
                      setLines((current) => current.map((row, i) => (i === index ? { ...row, quantity } : row)));
                    }}
                    className="h-10 w-24 rounded-lg border border-[var(--oh-border)] px-2 text-right tabular-nums"
                  />
                  <button type="button" aria-label="Remove line" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="rounded-md border border-[var(--oh-border)] p-2 text-[var(--oh-muted)] hover:bg-[var(--oh-surface)]">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
              {!lines.length && <li className="py-6 text-center text-sm text-[var(--oh-muted)]">Add at least one product.</li>}
            </ul>
          </section>
        </div>
      </div>

      <footer className="shrink-0 border-t border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Link href="/stock/transfers" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold">Cancel</Link>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={saving || !fromId || !toId || fromId === toId || lines.length === 0 || locations.length < 2}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:opacity-60"
          >
            {saving ? "Creating…" : validate ? "Transfer now" : "Create transfer"}
          </button>
        </div>
      </footer>
    </main>
  );
}
