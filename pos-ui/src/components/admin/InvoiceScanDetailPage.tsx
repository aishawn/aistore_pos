"use client";

import { useAuth } from "@/lib/auth";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Package, Search, ShoppingCart } from "lucide-react";
import {
  apiFailureMessage,
  discardInvoiceScan,
  getInvoiceScan,
  linkInvoiceScanPurchase,
  suggestedInvoiceSupplierByAbn,
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
import { InvoiceWorkflowSteps, invoiceStepFromStatus } from "@/components/admin/InvoiceWorkflowSteps";

interface Named {
  id: number;
  name: string;
  display_name?: string;
}

function money(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "draft": return "Draft — match products";
    case "matched": return "Matched — ready to receive";
    case "po_created": return "PO created — finish receive";
    case "received": return "Received into stock";
    case "failed": return "Failed — retry or fix matches";
    case "discarded": return "Discarded";
    default: return status;
  }
}

function isLowConfidence(value?: number | null) {
  return value != null && Number(value) > 0 && Number(value) < 0.7;
}

export function InvoiceScanDetailPage({ scanId }: { scanId: number }) {
  const { hasPermission } = useAuth();
  const canReceiveStock = hasPermission("stock.purchases") && hasPermission("stock.receive");
  const router = useRouter();
  const [session, setSession] = useState<InvoiceScanSession | null>(null);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [outlets, setOutlets] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState<Record<number, string>>({});
  const [productHits, setProductHits] = useState<Record<number, Named[]>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const suggestStarted = useRef(false);
  const searchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, sessionInfo, supplierPage, outletPage] = await Promise.all([
        getInvoiceScan(scanId),
        getOdooSession(),
        searchOdooRecords<Named>("suppliers", { limit: 100 }).catch(() => ({ items: [] as Named[] })),
        searchOdooRecords<Named>("outlets", { limit: 100 }).catch(() => ({ items: [] as Named[] })),
      ]);
      if (!sessionInfo) {
        setNotice("Connect your Orithos staff account before confirming into purchases.");
      }
      let next = detail;
      if (!detail.supplierId && detail.supplierAbn) {
        try {
          const mapped = await suggestedInvoiceSupplierByAbn(detail.supplierAbn);
          if (mapped) next = { ...detail, supplierId: mapped };
        } catch {
          /* optional ABN map */
        }
      }
      setSession(next);
      setSuppliers(supplierPage.items ?? []);
      setOutlets(outletPage.items ?? []);
      const queries: Record<number, string> = {};
      (next.lines ?? []).forEach((line, index) => {
        queries[index] = line.productName || line.description || "";
      });
      setProductQuery(queries);
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
  const canFinishReceive = session?.status === "po_created" && Boolean(session.purchaseOrderId);
  const done = session?.status === "received";
  const lines = session?.lines ?? [];
  const openLines = useMemo(
    () => lines.filter((line) => {
      const status = line.matchStatus;
      if (status === "confirmed" || status === "skipped") return false;
      if (status === "suggested" && line.productId) return false;
      return true;
    }),
    [lines],
  );
  const confirmedLines = useMemo(
    () => lines.filter((line) => (
      (line.matchStatus === "confirmed" || line.matchStatus === "suggested")
      && line.productId
      && Number(line.qtyCases ?? 0) > 0
    )),
    [lines],
  );
  const skippedCount = useMemo(
    () => lines.filter((line) => line.matchStatus === "skipped").length,
    [lines],
  );
  const canConfirm = Boolean(
    editable
    && session?.supplierId
    && lines.length > 0
    && openLines.length === 0
    && confirmedLines.length > 0,
  );

  useEffect(() => {
    if (!session || !editable || suggestStarted.current) return;
    suggestStarted.current = true;
    const unmatched = (session.lines ?? [])
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => !line.productId && line.matchStatus !== "skipped" && (line.description || "").trim());
    void (async () => {
      for (const { line, index } of unmatched.slice(0, 12)) {
        const query = (line.description || "").trim();
        try {
          const page = await searchOdooRecords<Named>("purchaseProducts", { query, limit: 5 });
          const hits = page.items ?? [];
          setProductHits((current) => ({ ...current, [index]: hits }));
          if (hits.length === 1) {
            const hit = hits[0];
            setSession((current) => {
              if (!current) return current;
              const next = [...(current.lines ?? [])];
              if (next[index]?.productId) return current;
              next[index] = {
                ...next[index],
                productId: hit.id,
                productName: hit.display_name || hit.name,
                matchStatus: "suggested",
              };
              return { ...current, lines: next };
            });
            setProductQuery((current) => ({ ...current, [index]: hit.display_name || hit.name }));
          }
        } catch {
          /* ignore suggest failures */
        }
      }
    })();
  }, [session, editable]);

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

  function searchProducts(index: number, query: string) {
    setProductQuery((current) => ({ ...current, [index]: query }));
    if (searchTimers.current[index]) clearTimeout(searchTimers.current[index]);
    searchTimers.current[index] = setTimeout(() => {
      void (async () => {
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
      })();
    }, 250);
  }

  async function saveMatches(options?: { quiet?: boolean }): Promise<InvoiceScanSession | null> {
    if (!session) return null;
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
        supplierId: session.supplierId,
        outletId: session.outletId,
        notes: session.notes,
        internalNotes: session.internalNotes,
        lines: (session.lines ?? []).map((line) => ({
          description: line.description,
          brand: line.brand,
          packQty: line.packQty,
          qtyCases: line.qtyCases,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          productId: line.productId,
          productName: line.productName,
          matchStatus: line.matchStatus === "suggested" ? "confirmed" : line.matchStatus,
          confidence: line.confidence,
        })),
      });
      setSession(saved);
      if (!options?.quiet) {
        setNotice("Matches saved. Confirm when every line is matched or skipped.");
      }
      return saved;
    } catch (cause) {
      setError(apiFailureMessage(cause, "Could not save matches.", "Please sign in again."));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function confirmAndReceive() {
    if (!canReceiveStock) return;
    if (!session || !canConfirm || !session.supplierId) return;
    setConfirming(true);
    setError(null);
    setNotice(null);
    setConfirmOpen(false);
    try {
      const saved = await saveMatches({ quiet: true });
      if (!saved) return;
      const working = saved;
      const linesToReceive = (working.lines ?? []).filter(
        (line) => line.matchStatus === "confirmed" && line.productId && Number(line.qtyCases ?? 0) > 0,
      );
      if (!linesToReceive.length) {
        throw new Error("Confirm at least one matched line with quantity before creating a purchase.");
      }
      const draft = await createOdooDraftRfqFromInvoice({
        supplierId: working.supplierId!,
        invoiceNumber: working.invoiceNumber,
        invoiceDate: working.invoiceDate,
        notes: working.notes,
        lines: linesToReceive.map((line) => ({
          productId: Number(line.productId),
          quantity: Number(line.qtyCases),
          priceUnit: line.unitPrice ?? null,
          description: line.description,
        })),
      });
      await confirmOdooPurchaseOrder(draft.id);
      const receiveResult = await tryReceivePurchase(draft.id, linesToReceive);
      const linked = await linkInvoiceScanPurchase(working.id, {
        purchaseOrderId: draft.id,
        purchaseOrderName: draft.name,
        receiptId: receiveResult.receiptId,
        receiptName: receiveResult.pickingName,
        status: receiveResult.status,
      });
      setSession(linked);
      setNotice(
        receiveResult.status === "received"
          ? `Stock received for ${draft.name}. Check Products for updated on-hand quantities.`
          : `Created and confirmed ${draft.name}. Finish receive in Purchases if the picking needs a manual check.`,
      );
    } catch (cause) {
      const message = cause instanceof OdooApiError
        ? cause.message
        : apiFailureMessage(cause, "Could not confirm this invoice into Orithos.", "Please sign in again.");
      setError(message);
      try {
        const linked = await linkInvoiceScanPurchase(session.id, {
          purchaseOrderId: session.purchaseOrderId || undefined,
          purchaseOrderName: session.purchaseOrderName || undefined,
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

  async function finishReceive() {
    if (!canReceiveStock) return;
    if (!session?.purchaseOrderId) return;
    setReceiving(true);
    setError(null);
    setNotice(null);
    try {
      const linesToReceive = (session.lines ?? []).filter(
        (line) => line.matchStatus === "confirmed" && line.productId && Number(line.qtyCases ?? 0) > 0,
      );
      const receiveResult = await tryReceivePurchase(session.purchaseOrderId, linesToReceive);
      const linked = await linkInvoiceScanPurchase(session.id, {
        purchaseOrderId: session.purchaseOrderId,
        purchaseOrderName: session.purchaseOrderName || undefined,
        receiptId: receiveResult.receiptId,
        receiptName: receiveResult.pickingName,
        status: receiveResult.status,
      });
      setSession(linked);
      setNotice(
        receiveResult.status === "received"
          ? `Received ${receiveResult.pickingName || session.purchaseOrderName}. Stock is now in Orithos.`
          : "Could not auto-receive. Open Purchases to validate the picking manually.",
      );
    } catch (cause) {
      setError(cause instanceof OdooApiError
        ? cause.message
        : apiFailureMessage(cause, "Could not finish receive.", "Please sign in again."));
    } finally {
      setReceiving(false);
    }
  }

  async function tryReceivePurchase(
    purchaseOrderId: number,
    confirmed: InvoiceScanSessionLine[],
  ): Promise<{ status: "po_created" | "received"; receiptId?: number; pickingName?: string }> {
    const detail = await getOdooPurchaseOrderDetail(purchaseOrderId);
    if (!detail.receivable?.pickingId || !detail.receivable.moves?.length) {
      return { status: "po_created" };
    }
    const qtyByProduct = new Map<number, number>();
    for (const line of confirmed) {
      const productId = Number(line.productId);
      qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + Number(line.qtyCases ?? 0));
    }
    const receiveLines = detail.receivable.moves.map((move) => {
      const productId = Array.isArray(move.product_id) ? move.product_id[0] : 0;
      const ordered = Number(move.product_uom_qty ?? 0);
      const wanted = qtyByProduct.get(productId) ?? ordered;
      return { moveId: move.id, qtyDone: Math.max(0, Math.min(ordered, wanted)) };
    });
    if (!receiveLines.some((line) => line.qtyDone > 0)) {
      return { status: "po_created" };
    }
    const received = await receiveOdooPurchaseOrder(purchaseOrderId, {
      lines: receiveLines,
    });
    return {
      status: "received",
      receiptId: received.receiptId,
      pickingName: received.pickingName,
    };
  }

  async function onDiscard() {
    if (!session || !editable) return;
    if (!window.confirm("Discard this draft invoice scan?")) return;
    try {
      await discardInvoiceScan(session.id);
      router.push("/purchases?tab=invoices");
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
          <p className="text-sm text-[var(--oh-tile-red-text)]">{error || "Invoice scan not found."}</p>
          <Link href="/purchases?tab=invoices" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold">Back to Purchasing</Link>
        </div>
      </main>
    );
  }

  const step = invoiceStepFromStatus(session.status);

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock · Invoices</p>
              <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">{session.invoiceNumber || `Scan #${session.id}`}</h1>
              <p className="mt-1 text-sm text-[var(--oh-muted)]">{statusLabel(String(session.status))}</p>
            </div>
            <Link href="/purchases?tab=invoices" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold">Back to Purchasing</Link>
          </div>
          <InvoiceWorkflowSteps active={step} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          {error && <div role="alert" className="rounded-lg border border-[var(--oh-tile-red-border)] bg-[var(--oh-tile-red-bg)] px-4 py-3 text-sm text-[var(--oh-tile-red-text)]">{error}</div>}
          {notice && <div role="status" className="rounded-lg border border-[var(--oh-tile-green-border)] bg-[var(--oh-tile-green-bg)] px-4 py-3 text-sm text-[var(--oh-tile-green-text)]">{notice}</div>}
          {session.duplicateIds && session.duplicateIds.length > 0 && (
            <div className="rounded-lg border border-[var(--oh-tile-orange-border)] bg-[var(--oh-tile-orange-bg)] px-4 py-3 text-sm text-[var(--oh-tile-orange-text)]">
              Possible duplicate invoice number. Existing scans: {session.duplicateIds.map((id) => (
                <Link key={id} href={`/invoices/${id}`} className="mx-1 font-semibold underline">#{id}</Link>
              ))}
              Confirm only once — a second PO will create duplicate stock.
            </div>
          )}

          {done && (
            <section className="rounded-xl border border-[var(--oh-tile-green-border)] bg-[var(--oh-tile-green-bg)] p-4 shadow-[var(--oh-shadow-card)]">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--oh-tile-green-text)]" size={22} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-[var(--oh-tile-green-text)]">Stock received</h2>
                  <p className="mt-1 text-sm text-[var(--oh-tile-green-text)]">
                    {session.purchaseOrderName || "Purchase"} is confirmed
                    {session.receiptName ? ` · ${session.receiptName}` : ""}.
                    On-hand quantities are updated in Orithos for matched products only — unmatched/skipped lines were not received.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Link href="/purchases" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--oh-success)] px-4 text-sm font-semibold text-white hover:opacity-90">
                      <ShoppingCart size={16} /> Open Purchases
                    </Link>
                    <Link href="/products" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--oh-tile-green-border)] bg-[var(--oh-surface-elevated)] px-4 text-sm font-semibold text-[var(--oh-tile-green-text)] hover:bg-[var(--oh-tile-green-bg)]">
                      <Package size={16} /> Check Products stock
                    </Link>
                    <Link href="/invoices/new" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-tile-green-border)] bg-[var(--oh-surface-elevated)] px-4 text-sm font-semibold text-[var(--oh-tile-green-text)] hover:bg-[var(--oh-tile-green-bg)]">
                      Scan another
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-[var(--oh-text)]">Header</h2>
              <p className="text-xs text-[var(--oh-muted)]">
                {confirmedLines.length} matched · {skippedCount} skipped · {openLines.length} still open
              </p>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Supplier</span>
                <select
                  disabled={!editable}
                  value={session.supplierId ? String(session.supplierId) : ""}
                  onChange={(e) => patchSession({ supplierId: e.target.value ? Number(e.target.value) : null })}
                  className="h-11 w-full rounded-lg border border-[var(--oh-border)] px-3 disabled:bg-[var(--oh-surface)]"
                >
                  <option value="">{session.supplierName ? `OCR: ${session.supplierName}` : "Select supplier…"}</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Outlet</span>
                <select
                  disabled={!editable}
                  value={session.outletId ? String(session.outletId) : ""}
                  onChange={(e) => patchSession({ outletId: e.target.value ? Number(e.target.value) : null })}
                  className="h-11 w-full rounded-lg border border-[var(--oh-border)] px-3 disabled:bg-[var(--oh-surface)]"
                >
                  <option value="">No outlet selected</option>
                  {outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1.5 block font-medium">Invoice number</span>
                <input disabled={!editable} value={session.invoiceNumber ?? ""} onChange={(e) => patchSession({ invoiceNumber: e.target.value })} className="h-11 w-full rounded-lg border border-[var(--oh-border)] px-3 disabled:bg-[var(--oh-surface)]" />
              </label>
              <div className="rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm"><p className="text-xs text-[var(--oh-muted)]">Total</p><p className="mt-1 font-semibold tabular-nums">{money(session.totalPayable)}</p></div>
              <div className="rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm"><p className="text-xs text-[var(--oh-muted)]">ABN</p><p className="mt-1">{session.supplierAbn || "—"}</p></div>
              {(session.purchaseOrderName || session.receiptName) && (
                <div className="rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm sm:col-span-2">
                  <p className="text-xs text-[var(--oh-muted)]">Orithos documents</p>
                  <p className="mt-1 font-medium">
                    {session.purchaseOrderName || "—"}
                    {session.receiptName ? ` · ${session.receiptName}` : ""}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)]">
            <header className="border-b border-[var(--oh-border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--oh-text)]">Match lines to Products</h2>
              <p className="mt-1 text-xs text-[var(--oh-muted)]">
                Match every line to an existing purchasable product, or skip it. Missing catalogue items must be created in Products first — OCR will not invent GST or shelf prices.
              </p>
            </header>
            <div className="divide-y divide-[var(--oh-border)]">
              {lines.map((line, index) => {
                const lowConfidence = isLowConfidence(line.confidence);
                const needsAttention = line.matchStatus !== "confirmed" && line.matchStatus !== "skipped";
                return (
                  <article
                    key={line.id ?? index}
                    className={[
                      "space-y-3 p-4",
                      needsAttention ? "bg-[var(--oh-tile-orange-bg)]/40" : "",
                      lowConfidence ? "ring-1 ring-inset ring-amber-200" : "",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--oh-text)]">{line.description || `Line ${index + 1}`}</p>
                        <p className="text-xs text-[var(--oh-muted)]">
                          Pack {line.packQty ?? "—"} · {money(line.unitPrice)}
                          {line.confidence != null ? ` · OCR ${(Number(line.confidence) * 100).toFixed(0)}%` : ""}
                        </p>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">{line.matchStatus || "unmatched"}</p>
                    </div>
                    {editable && (
                      <>
                        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
                          <label className="text-sm">
                            <span className="mb-1 block text-xs font-medium text-[var(--oh-muted)]">Qty / cases</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.qtyCases ?? ""}
                              onChange={(e) => patchLine(index, { qtyCases: e.target.value === "" ? null : Number(e.target.value) })}
                              className="h-11 w-full rounded-lg border border-[var(--oh-border)] px-3 tabular-nums"
                            />
                          </label>
                        </div>
                        <label className="relative block">
                          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
                          <input
                            value={productQuery[index] ?? ""}
                            onChange={(e) => searchProducts(index, e.target.value)}
                            placeholder="Search purchasable Orithos products…"
                            className="h-11 w-full rounded-lg border border-[var(--oh-border)] pl-9 pr-3 text-sm"
                          />
                        </label>
                        {(productHits[index] ?? []).length > 0 && (
                          <ul className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)]">
                            {(productHits[index] ?? []).map((hit) => (
                              <li key={hit.id}>
                                <button
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--oh-surface-muted)]"
                                  onClick={() => {
                                    patchLine(index, {
                                      productId: hit.id,
                                      productName: hit.display_name || hit.name,
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
                          {line.productName && (
                            <span className="rounded-full bg-[var(--oh-tile-green-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--oh-tile-green-text)]">
                              {line.matchStatus === "suggested" ? "Suggested: " : "Matched: "}
                              {line.productName}
                            </span>
                          )}
                          {line.matchStatus === "suggested" && line.productId && (
                            <button
                              type="button"
                              onClick={() => patchLine(index, { matchStatus: "confirmed" })}
                              className="rounded-md border border-[var(--oh-tile-green-border)] bg-[var(--oh-tile-green-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--oh-tile-green-text)]"
                            >
                              Accept suggestion
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => patchLine(index, { matchStatus: "skipped", productId: null, productName: null })}
                            className="rounded-md border border-[var(--oh-border)] px-2.5 py-1 text-xs font-semibold"
                          >
                            Skip line
                          </button>
                          <Link href="/products" className="rounded-md border border-[var(--oh-border)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--oh-surface)]">
                            Open Products
                          </Link>
                        </div>
                      </>
                    )}
                    {!editable && line.productName && (
                      <p className="text-sm text-[var(--oh-text-secondary)]">Product: {line.productName} · qty {line.qtyCases ?? 0}</p>
                    )}
                  </article>
                );
              })}
              {!lines.length && <p className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No OCR lines on this scan.</p>}
            </div>
          </section>
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-invoice-title">
          <div className="w-full max-w-md rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-xl">
            <h2 id="confirm-invoice-title" className="text-base font-semibold text-[var(--oh-text)]">Confirm into Orithos stock?</h2>
            <p className="mt-2 text-sm text-[var(--oh-muted)]">
              This creates a draft RFQ, confirms the purchase order, then receives stock for {confirmedLines.length} matched line{confirmedLines.length === 1 ? "" : "s"}
              {skippedCount ? ` (${skippedCount} skipped)` : ""}.
            </p>
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm text-[var(--oh-text)]">
              {confirmedLines.map((line, index) => (
                <li key={line.id ?? index} className="flex justify-between gap-3 border-b border-[var(--oh-border)] py-1.5 last:border-0">
                  <span className="min-w-0 truncate">{line.productName || line.description}</span>
                  <span className="shrink-0 tabular-nums">{line.qtyCases}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirmOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={() => void confirmAndReceive()} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
                Confirm → PO → receive
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="shrink-0 border-t border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            {editable && (
              <button type="button" onClick={() => void onDiscard()} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-tile-red-border)] px-4 text-sm font-semibold text-[var(--oh-tile-red-text)] hover:bg-[var(--oh-tile-red-bg)]">
                Discard draft
              </button>
            )}
            {(session.purchaseOrderId || done || canFinishReceive) && (
              <Link href="/purchases" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold">
                Open Purchases
              </Link>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {editable && (
              <button type="button" onClick={() => void saveMatches()} disabled={saving || confirming} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold disabled:opacity-60">
                {saving ? "Saving…" : "Save matches"}
              </button>
            )}
            {canFinishReceive && (
              <button
                type="button"
                onClick={() => void finishReceive()}
                disabled={receiving || !canReceiveStock}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:opacity-60"
              >
                {receiving ? "Receiving…" : "Finish receive"}
              </button>
            )}
            {editable && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={!canConfirm || confirming || saving || !canReceiveStock}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {confirming ? "Confirming…" : "Confirm → PO → receive"}
              </button>
            )}
          </div>
        </div>
        {editable && !canConfirm && (
          <p className="mx-auto mt-2 w-full max-w-5xl text-xs text-[var(--oh-muted)]">
            {!session.supplierId
              ? "Select an Orithos supplier first."
              : openLines.length > 0
                ? `${openLines.length} line${openLines.length === 1 ? "" : "s"} still need a match or skip.`
                : confirmedLines.length === 0
                  ? "Confirm at least one matched line with quantity."
                  : "Select an Orithos supplier and match or skip every line before confirming."}
          </p>
        )}
      </footer>
    </main>
  );
}
