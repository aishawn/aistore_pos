"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";
import {
  apiFailureMessage,
  discardInvoiceScan,
  getInvoiceScan,
  linkInvoiceScanPurchase,
  updateInvoiceScan,
  type InvoiceScanSession,
  type InvoiceScanSessionLine,
} from "@/lib/api";
import {
  confirmOdooPurchaseOrder,
  createOdooDraftRfqFromInvoice,
  getOdooPurchaseOrderDetail,
  getOdooSession,
  OdooApiError,
  receiveOdooPurchaseOrder,
  searchOdooRecords,
} from "@/lib/odoo-api";

interface Named {
  id: number;
  name: string;
  display_name?: string;
}

function money(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

export function InvoiceScanDetailPage({ scanId }: { scanId: number }) {
  const router = useRouter();
  const [session, setSession] = useState<InvoiceScanSession | null>(null);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState<Record<number, string>>({});
  const [productHits, setProductHits] = useState<Record<number, Named[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, sessionInfo, supplierPage] = await Promise.all([
        getInvoiceScan(scanId),
        getOdooSession(),
        searchOdooRecords<Named>("suppliers", { limit: 100 }).catch(() => ({ items: [] as Named[] })),
      ]);
      if (!sessionInfo) {
        setNotice("Connect your Odoo staff account before confirming into purchases.");
      }
      setSession(detail);
      setSuppliers(supplierPage.items ?? []);
    } catch (cause) {
      setSession(null);
      setError(apiFailureMessage(cause, "Could not load this invoice scan.", "Please sign in again."));
    } finally {
      setLoading(false);
    }
  }, [scanId]);

  useEffect(() => {
    void load();
  }, [load]);

  const editable = session?.status === "draft" || session?.status === "matched" || session?.status === "failed";
  const lines = session?.lines ?? [];
  const openLines = useMemo(
    () => lines.filter((line) => line.matchStatus !== "confirmed" && line.matchStatus !== "skipped"),
    [lines],
  );
  const canConfirm = Boolean(
    editable
    && session?.odooSupplierId
    && lines.length > 0
    && openLines.length === 0
    && lines.some((line) => line.matchStatus === "confirmed" && line.odooProductId),
  );

  function patchSession(update: Partial<InvoiceScanSession>) {
    setSession((current) => (current ? { ...current, ...update } : current));
  }

  function patchLine(index: number, update: Partial<InvoiceScanSessionLine>) {
    setSession((current) => {
      if (!current) return current;
      const next = [...(current.lines ?? [])];
      next[index] = { ...next[index], ...update };
      return { ...current, lines: next };
    });
  }

  async function searchProducts(index: number, query: string) {
    setProductQuery((current) => ({ ...current, [index]: query }));
    if (!query.trim()) {
      setProductHits((current) => ({ ...current, [index]: [] }));
      return;
    }
    try {
      const page = await searchOdooRecords<Named>("purchaseProducts", { query: query.trim(), limit: 8 });
      setProductHits((current) => ({ ...current, [index]: page.items ?? [] }));
    } catch {
      setProductHits((current) => ({ ...current, [index]: [] }));
    }
  }

  async function saveMatches() {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await updateInvoiceScan(session.id, {
        supplierName: session.supplierName,
        supplierAbn: session.supplierAbn,
        invoiceNumber: session.invoiceNumber,
        invoiceDate: session.invoiceDate,
        dueDate: session.dueDate,
        totalPayable: session.totalPayable,
        gstIncluded: session.gstIncluded,
        odooSupplierId: session.odooSupplierId,
        odooOutletId: session.odooOutletId,
        notes: session.notes,
        internalNotes: session.internalNotes,
        lines: (session.lines ?? []).map((line) => ({
          description: line.description,
          brand: line.brand,
          packQty: line.packQty,
          qtyCases: line.qtyCases,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          odooProductId: line.odooProductId,
          odooProductName: line.odooProductName,
          matchStatus: line.matchStatus,
          confidence: line.confidence,
        })),
      });
      setSession(saved);
      setNotice("Draft matches saved.");
    } catch (cause) {
      setError(apiFailureMessage(cause, "Could not save matches.", "Please sign in again."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmAndReceive() {
    if (!session || !canConfirm || !session.odooSupplierId) return;
    setConfirming(true);
    setError(null);
    setNotice(null);
    try {
      await saveMatches();
      const confirmedLines = (session.lines ?? []).filter(
        (line) => line.matchStatus === "confirmed" && line.odooProductId && Number(line.qtyCases ?? 0) > 0,
      );
      if (!confirmedLines.length) {
        throw new Error("Confirm at least one matched line with quantity before creating a purchase.");
      }
      const draft = await createOdooDraftRfqFromInvoice({
        supplierId: session.odooSupplierId,
        invoiceNumber: session.invoiceNumber,
        invoiceDate: session.invoiceDate,
        notes: session.notes,
        lines: confirmedLines.map((line) => ({
          productId: Number(line.odooProductId),
          quantity: Number(line.qtyCases),
          priceUnit: line.unitPrice ?? null,
          description: line.description,
        })),
      });
      await confirmOdooPurchaseOrder(draft.id);
      const detail = await getOdooPurchaseOrderDetail(draft.id);
      let pickingId: number | undefined;
      let pickingName: string | undefined;
      let status: "po_created" | "received" | "failed" = "po_created";
      if (detail.receivable?.pickingId && detail.receivable.moves?.length) {
        const qtyByProduct = new Map<number, number>();
        for (const line of confirmedLines) {
          const productId = Number(line.odooProductId);
          qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + Number(line.qtyCases ?? 0));
        }
        const receiveLines = detail.receivable.moves.map((move) => {
          const productId = Array.isArray(move.product_id) ? move.product_id[0] : 0;
          const ordered = Number(move.product_uom_qty ?? 0);
          const wanted = qtyByProduct.get(productId) ?? ordered;
          return { moveId: move.id, qtyDone: Math.max(0, Math.min(ordered, wanted)) };
        });
        if (receiveLines.some((line) => line.qtyDone > 0)) {
          const received = await receiveOdooPurchaseOrder(draft.id, {
            pickingId: detail.receivable.pickingId,
            lines: receiveLines,
          });
          pickingId = detail.receivable.pickingId;
          pickingName = received.pickingName;
          status = "received";
        }
      }
      const linked = await linkInvoiceScanPurchase(session.id, {
        odooPoId: draft.id,
        odooPoName: draft.name,
        odooPickingId: pickingId,
        odooPickingName: pickingName,
        status,
      });
      setSession(linked);
      setNotice(
        status === "received"
          ? `Created ${draft.name}, confirmed, and received ${pickingName}.`
          : `Created and confirmed ${draft.name}. Open Purchases if receive needs a manual finish.`,
      );
    } catch (cause) {
      const message = cause instanceof OdooApiError
        ? cause.message
        : apiFailureMessage(cause, "Could not confirm this invoice into Odoo.", "Please sign in again.");
      setError(message);
      try {
        const linked = await linkInvoiceScanPurchase(session.id, {
          odooPoId: session.odooPoId || undefined,
          odooPoName: session.odooPoName || undefined,
          status: "failed",
        }).catch(() => null);
        if (linked) setSession(linked);
      } catch {
        /* ignore secondary status update */
      }
    } finally {
      setConfirming(false);
    }
  }

  async function onDiscard() {
    if (!session || !editable) return;
    if (!window.confirm("Discard this draft invoice scan?")) return;
    try {
      await discardInvoiceScan(session.id);
      router.push("/invoices");
    } catch (cause) {
      setError(apiFailureMessage(cause, "Could not discard this draft.", "Please sign in again."));
    }
  }

  if (loading) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] text-sm text-[var(--oh-muted)]">
        <span className="inline-flex items-center gap-2"><LoaderCircle className="animate-spin" size={17} /> Loading invoice…</span>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] px-4 text-center">
        <div>
          <p className="text-sm text-rose-800">{error || "Invoice scan not found."}</p>
          <Link href="/invoices" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold">Back to invoices</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock · Invoices</p>
            <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">{session.invoiceNumber || `Scan #${session.id}`}</h1>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">
              Status: {session.status}
              {session.odooPoName ? ` · ${session.odooPoName}` : ""}
              {session.odooPickingName ? ` · ${session.odooPickingName}` : ""}
            </p>
          </div>
          <Link href="/invoices" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold">History</Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
          {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>}
          {session.duplicateIds && session.duplicateIds.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Possible duplicate invoice number. Existing scans: {session.duplicateIds.map((id) => (
                <Link key={id} href={`/invoices/${id}`} className="mx-1 font-semibold underline">#{id}</Link>
              ))}
            </div>
          )}

          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
            <h2 className="text-sm font-semibold text-[var(--oh-text)]">Header</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Supplier</span>
                <select
                  disabled={!editable}
                  value={session.odooSupplierId ? String(session.odooSupplierId) : ""}
                  onChange={(e) => patchSession({ odooSupplierId: e.target.value ? Number(e.target.value) : null })}
                  className="h-11 w-full rounded-lg border border-[var(--oh-border)] px-3"
                >
                  <option value="">{session.supplierName ? `OCR: ${session.supplierName}` : "Select supplier…"}</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Invoice number</span>
                <input disabled={!editable} value={session.invoiceNumber ?? ""} onChange={(e) => patchSession({ invoiceNumber: e.target.value })} className="h-11 w-full rounded-lg border border-[var(--oh-border)] px-3" />
              </label>
              <div className="rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm"><p className="text-xs text-[var(--oh-muted)]">Total</p><p className="mt-1 font-semibold tabular-nums">{money(session.totalPayable)}</p></div>
              <div className="rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm"><p className="text-xs text-[var(--oh-muted)]">ABN</p><p className="mt-1">{session.supplierAbn || "—"}</p></div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <header className="border-b border-[var(--oh-border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--oh-text)]">Match lines</h2>
              <p className="mt-1 text-xs text-[var(--oh-muted)]">Every line must be matched or skipped before confirm. Unmatched catalog lines stay blocked — do not invent products or GST.</p>
            </header>
            <div className="divide-y divide-[var(--oh-border)]">
              {lines.map((line, index) => (
                <article key={line.id ?? index} className="space-y-3 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--oh-text)]">{line.description || `Line ${index + 1}`}</p>
                      <p className="text-xs text-[var(--oh-muted)]">{line.qtyCases ?? 0} cases · {money(line.unitPrice)}</p>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">{line.matchStatus || "unmatched"}</p>
                  </div>
                  {editable && (
                    <>
                      <label className="relative block">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
                        <input
                          value={productQuery[index] ?? ""}
                          onChange={(e) => void searchProducts(index, e.target.value)}
                          placeholder="Search purchasable Odoo products…"
                          className="h-11 w-full rounded-lg border border-[var(--oh-border)] pl-9 pr-3 text-sm"
                        />
                      </label>
                      {(productHits[index] ?? []).length > 0 && (
                        <ul className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)]">
                          {(productHits[index] ?? []).map((hit) => (
                            <li key={hit.id}>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-white"
                                onClick={() => {
                                  patchLine(index, {
                                    odooProductId: hit.id,
                                    odooProductName: hit.display_name || hit.name,
                                    matchStatus: "confirmed",
                                  });
                                  setProductHits((current) => ({ ...current, [index]: [] }));
                                  setProductQuery((current) => ({ ...current, [index]: hit.display_name || hit.name }));
                                }}
                              >
                                {hit.display_name || hit.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {line.odooProductName && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">Matched: {line.odooProductName}</span>}
                        <button type="button" onClick={() => patchLine(index, { matchStatus: "skipped", odooProductId: null, odooProductName: null })} className="rounded-md border border-[var(--oh-border)] px-2.5 py-1 text-xs font-semibold">Skip line</button>
                      </div>
                    </>
                  )}
                </article>
              ))}
              {!lines.length && <p className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No OCR lines on this scan.</p>}
            </div>
          </section>
        </div>
      </div>

      <footer className="shrink-0 border-t border-[var(--oh-border)] bg-white px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            {editable && (
              <button type="button" onClick={() => void onDiscard()} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-800 hover:bg-rose-50">
                Discard draft
              </button>
            )}
            {session.odooPoId ? (
              <Link href="/purchases/odoo" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold">
                Open Purchases
              </Link>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {editable && (
              <button type="button" onClick={() => void saveMatches()} disabled={saving || confirming} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold disabled:opacity-60">
                {saving ? "Saving…" : "Save matches"}
              </button>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => void confirmAndReceive()}
                disabled={!canConfirm || confirming || saving}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {confirming ? "Confirming…" : "Confirm → PO → receive"}
              </button>
            )}
          </div>
        </div>
        {editable && !canConfirm && (
          <p className="mx-auto mt-2 w-full max-w-5xl text-xs text-[var(--oh-muted)]">
            Select an Odoo supplier and match or skip every line before confirming.
          </p>
        )}
      </footer>
    </main>
  );
}
