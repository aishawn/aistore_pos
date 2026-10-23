"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FilePlus2, LoaderCircle, ReceiptText, Search } from "lucide-react";
import {
  apiFailureMessage,
  listInvoiceScans,
  type InvoiceScanSession,
} from "@/lib/api";

function money(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function statusLabel(status: string) {
  switch (status) {
    case "draft": return "Draft";
    case "matched": return "Matched";
    case "po_created": return "PO created";
    case "received": return "Received";
    case "failed": return "Failed";
    default: return status;
  }
}

function statusClass(status: string) {
  switch (status) {
    case "draft": return "bg-amber-50 text-amber-950";
    case "matched": return "bg-sky-50 text-sky-950";
    case "po_created": return "bg-indigo-50 text-indigo-950";
    case "received": return "bg-emerald-50 text-emerald-950";
    case "failed": return "bg-rose-50 text-rose-900";
    default: return "bg-[var(--oh-surface)] text-[var(--oh-text-secondary)]";
  }
}

function nextAction(status: string) {
  switch (status) {
    case "draft": return "Match products";
    case "matched": return "Confirm & receive";
    case "po_created": return "Finish receive";
    case "received": return "View stock";
    case "failed": return "Retry match";
    default: return "Open";
  }
}

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "matched", label: "Matched" },
  { value: "po_created", label: "PO created" },
  { value: "received", label: "Received" },
  { value: "failed", label: "Failed" },
] as const;

export function InvoiceScansListPage() {
  const [items, setItems] = useState<InvoiceScanSession[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listInvoiceScans({
        status: status || undefined,
        query: debouncedQuery || undefined,
        limit: 50,
        offset: 0,
      });
      setItems(page.items ?? []);
      setTotal(page.total ?? 0);
    } catch (cause) {
      setItems([]);
      setTotal(0);
      setError(apiFailureMessage(cause, "Could not load invoice scans.", "Please sign in again."));
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--oh-surface)]">
      <header className="shrink-0 border-b border-[var(--oh-border)] bg-white px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Stock · Documents</p>
            <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Supplier invoices</h1>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">
              Capture → match to Products → confirm PO → receive stock. Scanning alone does not update inventory.
            </p>
          </div>
          <Link
            href="/invoices/new"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"
          >
            <FilePlus2 size={17} />
            Scan invoice
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative min-w-0 flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search supplier, invoice #, ABN…"
                  className="h-11 w-full rounded-lg border border-[var(--oh-border)] bg-white pl-9 pr-3 text-sm outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15"
                />
              </label>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]"
              >
                Refresh
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
              {STATUS_FILTERS.map((filter) => {
                const active = status === filter.value;
                return (
                  <button
                    key={filter.value || "all"}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStatus(filter.value)}
                    className={[
                      "inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold",
                      active
                        ? "bg-[var(--oh-primary)] text-white"
                        : "bg-[var(--oh-surface)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-border)]/40",
                    ].join(" ")}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-[var(--oh-muted)]">{total} scan{total === 1 ? "" : "s"}</p>
          </section>

          {loading && (
            <div role="status" className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <LoaderCircle size={17} className="animate-spin" /> Loading invoice history…
            </div>
          )}
          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--oh-border-strong)] bg-white px-6 py-12 text-center">
              <ReceiptText className="mx-auto text-[var(--oh-primary)]" size={28} />
              <h2 className="mt-3 text-sm font-semibold text-[var(--oh-text)]">No scanned invoices yet</h2>
              <p className="mt-1 text-sm text-[var(--oh-muted)]">Upload a PDF or photograph to start a draft OCR review.</p>
              <Link href="/invoices/new" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]">
                Scan invoice
              </Link>
            </div>
          )}

          {items.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Next</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--oh-border)]">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-[var(--oh-surface)]/60">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${item.id}`} className="font-semibold text-[var(--oh-primary)] hover:underline">
                          {item.invoiceNumber || `Scan #${item.id}`}
                        </Link>
                        <p className="mt-0.5 text-xs text-[var(--oh-muted)]">{item.sourceType || "upload"}{item.sourceFilename ? ` · ${item.sourceFilename}` : ""}</p>
                      </td>
                      <td className="px-4 py-3 text-[var(--oh-text)]">{item.supplierName || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(String(item.status))}`}>
                          {statusLabel(String(item.status))}
                        </span>
                        {item.odooPoName && <p className="mt-1 text-xs text-[var(--oh-muted)]">{item.odooPoName}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${item.id}`} className="text-xs font-semibold text-[var(--oh-primary)] hover:underline">
                          {nextAction(String(item.status))}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{money(item.totalPayable)}</td>
                      <td className="px-4 py-3 text-xs text-[var(--oh-muted)]">{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-4 text-sm text-[var(--oh-muted)]">
            <h2 className="text-sm font-semibold text-[var(--oh-text)]">How stock updates</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Scan PDF/photo → OCR draft (no stock change).</li>
              <li>Match each line to an existing product (or skip / create the product in Products first).</li>
              <li>Confirm → Odoo PO → receive — then on-hand qty appears in Products.</li>
            </ol>
            <p className="mt-3 text-xs">
              Supplier API ingest remains reserved (`SUPPLIER_INVOICE_INGEST_ENABLED`). Use PDF or camera until a vendor adapter is connected.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
