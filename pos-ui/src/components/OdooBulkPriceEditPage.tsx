"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchOdooRoute, searchOdooRecords, type OdooProductRecord } from "@/lib/odoo-api";

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
type Outcome = { state: "confirmed" | "rejected" | "unknown"; message: string };

/** Odoo shelf-price review. Quantity-break pricelists are a separate Odoo workflow. */
export function OdooBulkPriceEditPage() {
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [offset, setOffset] = useState(0);
  const [products, setProducts] = useState<OdooProductRecord[]>([]);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const saving = useRef(false);
  const prefilled = useRef(false);

  const load = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true); setError(null); setConfirm(false);
    try {
      const page = await searchOdooRecords<OdooProductRecord>("products", { query: search, limit: 30, offset });
      if (current !== revision.current) return;
      setProducts(page.items); setDraft({}); setOutcomes({});
      const id = Number(params.get("productId"));
      const suggested = Number(params.get("suggestedPrice"));
      const expected = Number(params.get("expectedPrice"));
      const product = page.items.find((item) => item.id === id);
      if (!prefilled.current && product && params.has("suggestedPrice") && params.has("expectedPrice")) {
        prefilled.current = true;
        if (Number.isFinite(suggested) && suggested > 0 && suggested <= 1_000_000 && Number.isFinite(expected)
          && Math.abs(product.list_price - expected) < 0.000001) setDraft({ [id]: suggested.toFixed(2) });
        else setError("This suggestion is invalid or the original price has changed. Review the current price.");
      }
    } catch (cause) {
      if (current === revision.current) setError(cause instanceof Error ? cause.message : "Could not load Odoo products.");
    } finally { if (current === revision.current) setLoading(false); }
  }, [search, offset, params]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => { clearTimeout(timer); };
  }, [load]);

  const changed = products.filter((product) => draft[product.id] !== undefined && Number(draft[product.id]) !== product.list_price);
  const valid = changed.every((product) => draft[product.id].trim() !== "" && Number.isFinite(Number(draft[product.id]))
    && Number(draft[product.id]) > 0 && Number(draft[product.id]) <= 1_000_000);
  const unresolved = Object.values(outcomes).some((outcome) => outcome.state === "unknown");

  async function save() {
    if (saving.current || !confirm || !valid || !changed.length || unresolved) return;
    saving.current = true; setBusy(true); setConfirm(false); setError(null);
    try {
      for (const product of changed) {
        const next = Number(draft[product.id]);
        let outcome: Outcome;
        try {
          const response = await fetchOdooRoute(`/api/odoo/products/${product.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ list_price: next, expectedListPrice: product.list_price }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || payload?.ok !== true) {
            if (response.status >= 500 || payload?.resultState === "unknown") throw new Error("unconfirmed");
            outcome = { state: "rejected", message: payload?.message ?? "Price change rejected." };
          } else outcome = { state: "confirmed", message: "Saved and read back from Odoo." };
        } catch {
          // Read only after an uncertain write. Never automatically replay PATCH.
          try {
            const response = await fetchOdooRoute(`/api/odoo/products/${product.id}`, { cache: "no-store" });
            const current = response.ok ? await response.json() : null;
            outcome = current && Math.abs(current.list_price - next) < 0.000001
              ? { state: "confirmed", message: "Requested price confirmed by a fresh Odoo read." }
              : { state: "unknown", message: "Result pending confirmation. Check Odoo before making another change." };
          } catch { outcome = { state: "unknown", message: "Cannot confirm the result. Check Odoo before retrying." }; }
        }
        setOutcomes((previous) => ({ ...previous, [product.id]: outcome }));
        if (outcome.state === "confirmed") setProducts((previous) => previous.map((item) => item.id === product.id ? { ...item, list_price: next } : item));
        if (outcome.state === "unknown") break;
      }
    } finally { saving.current = false; setBusy(false); }
  }

  return <main className="h-full overflow-y-auto p-4 pb-24 sm:p-6">
    <h1 className="text-2xl font-semibold">Bulk Price Edit</h1>
    <p className="mt-2 text-sm text-neutral-600">Review Odoo list prices before saving. GST-inclusive shelf prices follow each product&apos;s tax configuration. Register pricelists may override these prices.</p>
    <div className="my-4 flex flex-wrap gap-3">
      <input aria-label="Search bulk price products" value={search} disabled={busy || changed.length > 0 || unresolved} onChange={(event) => { ++revision.current; setSearch(event.target.value); setOffset(0); }} className="h-11 min-w-0 flex-1 rounded border px-3" placeholder="Search product or SKU" />
      <button type="button" disabled={busy || loading} onClick={() => {
        if ((changed.length || unresolved) && !window.confirm("Discard local edits and reload current Odoo prices? Check pending operations in Odoo first.")) return;
        void load();
      }} className="min-h-11 rounded border px-3">Refresh</button>
    </div>
    {error && <p role="alert" className="my-3 rounded bg-red-50 p-3 text-red-900">{error}</p>}
    {loading ? <p role="status">Loading Odoo prices…</p> : <ul className="divide-y rounded border">
      {products.map((product) => <li key={product.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div><p className="font-semibold">{product.name}</p><p className="text-sm text-neutral-600">{product.default_code || "No SKU"} · Current list {money.format(product.list_price)}</p>
          {outcomes[product.id] && <p role="status" className={outcomes[product.id].state === "confirmed" ? "text-sm text-green-800" : "text-sm text-red-800"}>{outcomes[product.id].message}</p>}
        </div>
        <label className="text-sm">New Odoo list price
          <input aria-label={`Price for ${product.name}`} type="number" min="0.01" step="0.01" value={draft[product.id] ?? String(product.list_price)} disabled={busy || unresolved} onChange={(event) => { setConfirm(false); setOutcomes((previous) => { const next = { ...previous }; delete next[product.id]; return next; }); setDraft((previous) => ({ ...previous, [product.id]: event.target.value })); }} className="mt-1 h-11 w-full rounded border px-3" />
        </label>
      </li>)}
      {!products.length && <li className="p-4">No products match this search.</li>}
    </ul>}
    {changed.length > 0 && <section aria-label="Review price changes" className="mt-4 rounded border bg-amber-50 p-4">
      <h2 className="font-semibold">Review {changed.length} price changes</h2>
      <ul className="my-2 text-sm">{changed.map((product) => <li key={product.id}>{product.name}: {money.format(product.list_price)} → {draft[product.id]}</li>)}</ul>
      {!valid && <p role="alert">Enter valid prices between 0.01 and 1,000,000.</p>}
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={confirm} disabled={busy || unresolved} onChange={(event) => setConfirm(event.target.checked)} />I have reviewed these changes.</label>
      <button type="button" disabled={busy || loading || !valid || !confirm || unresolved} onClick={() => void save()} className="min-h-11 rounded bg-green-800 px-4 text-white disabled:opacity-50">{busy ? "Saving…" : "Save reviewed prices"}</button>
    </section>}
    <nav aria-label="Product pages" className="mt-4 flex items-center gap-4">
      <button type="button" disabled={offset === 0 || busy || loading || changed.length > 0 || unresolved} onClick={() => setOffset(Math.max(0, offset - 30))} className="min-h-11 rounded border px-3">Previous</button>
      <span>Page {Math.floor(offset / 30) + 1}</span>
      <button type="button" disabled={products.length < 30 || busy || loading || changed.length > 0 || unresolved} onClick={() => setOffset(offset + 30)} className="min-h-11 rounded border px-3">Next</button>
    </nav>
  </main>;
}
