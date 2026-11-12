"use client";

import { useRef, useState } from "react";
import { api, apiFailureMessage } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { FormDatePicker } from "@/components/admin/FormDatePicker";
import { Modal } from "@/components/admin/Modal";

interface Named {
  id: string | number;
  name: string;
}

interface CreatedOrder {
  id: number | string;
  invoiceNumber?: string;
}

interface ProductHit {
  id: number | string;
  name: string;
  caseQuantity?: number | null;
}

interface DraftLine {
  key: string;
  query: string;
  productId?: number | string;
  quantity: string;
  caseQuantity: string;
  unitPrice: string;
  hits: ProductHit[];
  searching: boolean;
}

interface ProductPage {
  items?: ProductHit[];
}

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function orderNumber() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `PO-${Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`;
}

export function CreatePurchaseOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (order: CreatedOrder) => void;
}) {
  const suppliers = useApiList<Named>("/api/suppliers", { page: 1, size: 500 });
  const outlets = useApi<Named[]>("/api/outlets");
  const [supplierId, setSupplierId] = useState("");
  const [outletId, setOutletId] = useState("");
  const [date, setDate] = useState(localDate);
  const [dueDate, setDueDate] = useState("");
  const [number, setNumber] = useState(orderNumber);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const searchSequence = useRef<Record<string, number>>({});

  const selectedOutlet = outletId || String(outlets.data?.[0]?.id ?? "");
  const dependenciesLoading = suppliers.loading || outlets.loading;
  const dependenciesError = suppliers.error || outlets.error;

  function updateLine(key: string, update: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...update } : line));
  }

  function searchProducts(key: string, query: string) {
    clearTimeout(searchTimers.current[key]);
    const sequence = (searchSequence.current[key] ?? 0) + 1;
    searchSequence.current[key] = sequence;
    if (query.trim().length < 2) {
      updateLine(key, { hits: [], searching: false });
      return;
    }
    updateLine(key, { searching: true });
    searchTimers.current[key] = setTimeout(() => {
      void api.get<ProductPage>("/api/products", { name: query.trim(), page: 1, size: 8, status: "ACTIVE" })
        .then((page) => {
          if (searchSequence.current[key] === sequence) updateLine(key, { hits: page.items ?? [], searching: false });
        })
        .catch(() => {
          if (searchSequence.current[key] === sequence) updateLine(key, { hits: [], searching: false });
        });
    }, 250);
  }

  async function submit() {
    if (busy) return;
    if (!supplierId || !selectedOutlet || !date || !number.trim()) {
      setError("Choose a supplier and outlet, then complete the order date and number.");
      return;
    }
    if (!lines.length || lines.some((line) => {
      const quantity = Number(line.quantity);
      const caseQuantity = Number(line.caseQuantity);
      const unitPrice = Number(line.unitPrice);
      return !line.productId || !Number.isFinite(quantity) || quantity <= 0
        || !Number.isFinite(caseQuantity) || caseQuantity <= 0
        || !Number.isFinite(unitPrice) || unitPrice < 0;
    })) {
      setError("Add at least one product and enter a positive quantity, pack size, and valid unit cost for every line.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<CreatedOrder>("/api/orders", {
        fromId: Number(supplierId),
        toId: Number(selectedOutlet),
        orderDate: date,
        dueDate: dueDate || null,
        invoiceNumber: number.trim(),
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        lines: lines.map((line) => ({
          productId: Number(line.productId),
          quantity: Number(line.quantity),
          caseQuantity: Number(line.caseQuantity),
          unitPrice: Number(line.unitPrice),
          description: null,
        })),
      });
      onCreated(created);
    } catch (cause) {
      const existing = await api.get<{ items?: CreatedOrder[] }>("/api/orders", {
        type: "ORDER", invoiceNumber: number.trim(), page: 1, size: 1,
      }).catch(() => null);
      if (existing?.items?.[0]) {
        onCreated(existing.items[0]);
        return;
      }
      setError(apiFailureMessage(cause, "Could not create the purchase order.", "Please sign in again."));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New purchase order"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={busy || dependenciesLoading || Boolean(dependenciesError)} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create order"}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-[var(--oh-text-secondary)]">
          Supplier
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
            <option value="">Select supplier</option>
            {suppliers.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--oh-text-secondary)]">
          Outlet
          <select value={selectedOutlet} onChange={(event) => setOutletId(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
            <option value="">Select outlet</option>
            {(outlets.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--oh-text-secondary)]">
          Order date
          <span className="mt-1.5 block"><FormDatePicker value={date} onChange={setDate} placeholder="DD/MM/YYYY" currentMonthOnly /></span>
        </label>
        <label className="text-sm font-medium text-[var(--oh-text-secondary)]">
          Due date
          <span className="mt-1.5 block"><FormDatePicker value={dueDate} onChange={setDueDate} placeholder="DD/MM/YYYY" currentMonthOnly /></span>
        </label>
        <label className="text-sm font-medium text-[var(--oh-text-secondary)] sm:col-span-2">
          Order number
          <input value={number} onChange={(event) => setNumber(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]" />
        </label>
        <label className="text-sm font-medium text-[var(--oh-text-secondary)] sm:col-span-2">
          Reference
          <input value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]" />
        </label>
        <label className="text-sm font-medium text-[var(--oh-text-secondary)] sm:col-span-2">
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1.5 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 py-2 text-sm text-[var(--oh-text)]" />
        </label>
        <section aria-labelledby="purchase-order-lines" className="space-y-3 border-t border-[var(--oh-border)] pt-4 sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="purchase-order-lines" className="text-sm font-semibold text-[var(--oh-text)]">Products</h2>
              <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Add the quantities and supplier costs before creating this order.</p>
            </div>
            <button type="button" onClick={() => setLines((current) => [...current, { key: crypto.randomUUID(), query: "", quantity: "1", caseQuantity: "1", unitPrice: "", hits: [], searching: false }])} className="min-h-10 shrink-0 rounded-md border border-[var(--oh-border)] px-3 text-sm font-semibold">Add product</button>
          </div>
          {lines.map((line, index) => (
            <div key={line.key} className="space-y-3 rounded-md border border-[var(--oh-border)] p-3">
              <div className="relative min-w-0">
                <label className="block text-xs font-medium text-[var(--oh-text-secondary)]" htmlFor={`po-product-${line.key}`}>Product {index + 1}</label>
                <input
                  id={`po-product-${line.key}`}
                  value={line.query}
                  autoComplete="off"
                  onChange={(event) => {
                    const query = event.target.value;
                    updateLine(line.key, { query, productId: undefined, hits: [] });
                    searchProducts(line.key, query);
                  }}
                  placeholder="Search active products"
                  className="mt-1.5 h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm"
                />
                {line.searching && <p role="status" className="mt-1 text-xs text-[var(--oh-muted)]">Searching products…</p>}
                {line.hits.length > 0 && !line.productId && (
                  <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-[var(--oh-border)] bg-white shadow-lg">
                    {line.hits.map((product) => (
                      <li key={product.id}>
                        <button type="button" onClick={() => updateLine(line.key, { query: product.name, productId: product.id, caseQuantity: String(product.caseQuantity && product.caseQuantity > 0 ? product.caseQuantity : 1), hits: [] })} className="min-h-10 w-full px-3 text-left text-sm hover:bg-[var(--oh-surface)]">{product.name}</button>
                      </li>
                    ))}
                  </ul>
                )}
                {line.query.length >= 2 && !line.searching && !line.productId && line.hits.length === 0 && <p className="mt-1 text-xs text-[var(--oh-muted)]">No matching active products.</p>}
              </div>
              <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] items-end gap-2 sm:gap-3">
                <label className="min-w-0 text-xs font-medium text-[var(--oh-text-secondary)]">Quantity
                  <input type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} className="mt-1.5 h-11 w-full rounded-md border border-[var(--oh-border)] px-2 text-right text-sm" />
                </label>
                <label className="min-w-0 text-xs font-medium text-[var(--oh-text-secondary)]">Pack size
                  <input type="number" min="0.0001" step="0.0001" value={line.caseQuantity} onChange={(event) => updateLine(line.key, { caseQuantity: event.target.value })} className="mt-1.5 h-11 w-full rounded-md border border-[var(--oh-border)] px-2 text-right text-sm" />
                </label>
                <label className="min-w-0 text-xs font-medium text-[var(--oh-text-secondary)]">Cost / pack
                  <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} className="mt-1.5 h-11 w-full rounded-md border border-[var(--oh-border)] px-2 text-right text-sm" />
                </label>
                <button type="button" aria-label={`Remove product line ${index + 1}`} onClick={() => { clearTimeout(searchTimers.current[line.key]); setLines((current) => current.filter((item) => item.key !== line.key)); }} className="min-h-11 rounded-md border border-[var(--oh-border)] px-2 text-xs font-semibold text-[var(--oh-text-secondary)] sm:px-3 sm:text-sm">Remove</button>
              </div>
            </div>
          ))}
        </section>
      </div>
      {dependenciesError && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"><span>Suppliers or outlets could not be loaded.</span><button type="button" onClick={() => { suppliers.reload(); outlets.reload(); }} className="min-h-9 shrink-0 font-semibold underline">Retry</button></div>}
      {error && <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    </Modal>
  );
}
