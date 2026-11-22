"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, CreditCard, Edit3, History, Home, LoaderCircle, X } from "lucide-react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { api, type Page } from "@/lib/api";
import { formatStoreEpoch } from "@/lib/retail-date";
import { naturalSortRows } from "@/lib/natural-sort";

type CustomerDetail = {
  id: number;
  name: string;
  code?: string | null;
  company?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  customerGroupName?: string | null;
  priceListName?: string | null;
  currentOwing?: number | null;
  billingStreetAddress1?: string | null;
  billingSuburb?: string | null;
  billingPostCode?: string | null;
  billingRegion?: string | null;
};

type RecentSaleLine = {
  timestamp?: string | null;
  userName?: string | null;
  quantity?: number | null;
  item?: string | null;
  price?: number | null;
};

type Revision = {
  id: number;
  summary?: string;
  kind?: string;
  createdAt?: string;
};

type Tab = "home" | "sales" | "revisions";

function money(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value))
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value));
}

function dateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? formatStoreEpoch(parsed, "Australia/Melbourne") : value;
}

export function NativeCustomerViewModal({
  customerId,
  onClose,
}: {
  customerId: string | number | null;
  onClose: () => void;
}) {
  const open = customerId != null;
  const [tab, setTab] = useState<Tab>("home");
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [sales, setSales] = useState<RecentSaleLine[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sortedSales = naturalSortRows(
    sales,
    (line) => line.timestamp ? Date.parse(line.timestamp) : null,
    (line) => `${line.timestamp ?? ""}-${line.item ?? ""}-${line.userName ?? ""}`,
    "desc",
  );

  useDialogFocus(open, onClose, customerId);

  useEffect(() => {
    if (customerId == null) return;
    let cancelled = false;
    setTab("home");
    setLoading(true);
    setError(null);
    void Promise.all([
      api.get<CustomerDetail>(`/api/customers/${customerId}`),
      api.get<RecentSaleLine[]>(`/api/customers/${customerId}/recent-sales`, { limit: 50 }),
      api.get<Page<Revision>>(`/api/customers/${customerId}/revisions`, { page: 1, size: 20 }).catch(() => ({ items: [] })),
    ])
      .then(([detail, recentSales, revisionPage]) => {
        if (cancelled) return;
        setCustomer(detail);
        setSales(Array.isArray(recentSales) ? recentSales : []);
        setRevisions(revisionPage.items ?? []);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Customer data unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [customerId]);

  if (!open) return null;

  const address = [customer?.billingStreetAddress1, customer?.billingSuburb, customer?.billingRegion, customer?.billingPostCode]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[75] grid place-items-center bg-black/40 p-2 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={customer?.name ? `${customer.name} customer details` : "Customer details"}
        className="flex max-h-[94dvh] min-h-[min(560px,90dvh)] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-2xl"
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-2 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-[var(--oh-text)]">{customer?.name ?? "Customer"}</h2>
            <p className="text-xs text-[var(--oh-muted)]">{customer?.code || (customerId == null ? "" : `Customer #${customerId}`)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {customer && <Link href={`/customers/${customer.id}/edit`} className="inline-flex min-h-10 items-center gap-2 border border-[var(--oh-border)] px-3 text-sm font-semibold hover:bg-[var(--oh-surface)]"><Edit3 size={15} />Edit</Link>}
            <button type="button" onClick={onClose} aria-label="Close customer details" title="Close" className="grid size-10 place-items-center text-[var(--oh-muted)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"><X size={19} /></button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_250px]">
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            {error && <div role="alert" className="mb-4 border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
            {loading ? (
              <div role="status" className="grid min-h-56 place-items-center text-[var(--oh-muted)]"><LoaderCircle className="animate-spin" aria-label="Loading customer" /></div>
            ) : customer ? (
              <>
                <div className="mb-5 grid gap-4 border-b border-[var(--oh-border)] pb-5 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div><dt className="text-xs text-[var(--oh-muted)]">Customer group</dt><dd className="mt-1 font-medium">{customer.customerGroupName || "—"}</dd></div>
                    <div><dt className="text-xs text-[var(--oh-muted)]">Price list</dt><dd className="mt-1 font-medium">{customer.priceListName || "Store default"}</dd></div>
                    <div><dt className="text-xs text-[var(--oh-muted)]">Contact</dt><dd className="mt-1">{customer.phone || customer.mobile || "—"}</dd></div>
                    <div><dt className="text-xs text-[var(--oh-muted)]">Email</dt><dd className="mt-1 break-all">{customer.email || "—"}</dd></div>
                    {address && <div className="col-span-2"><dt className="text-xs text-[var(--oh-muted)]">Address</dt><dd className="mt-1">{address}</dd></div>}
                  </dl>
                  <dl className="min-w-40 self-start border-l-2 border-[var(--oh-primary)] pl-4 lg:text-right lg:border-l-0 lg:border-r-2 lg:pr-4">
                    <dt className="text-xs text-[var(--oh-muted)]">Current owing</dt>
                    <dd className="mt-1 text-xl font-semibold tabular-nums">{money(customer.currentOwing)}</dd>
                  </dl>
                </div>

                {tab === "home" && (
                  <section>
                    <div className="mb-3 flex items-baseline justify-between gap-3"><h3 className="text-sm font-semibold">Recent sales</h3><span className="text-xs text-[var(--oh-muted)]">{sales.length} sale lines</span></div>
                    {sales.length === 0 ? <p className="py-8 text-center text-sm text-[var(--oh-muted)]">No recent Orithos sales.</p> : (
                      <div className="overflow-x-auto border border-[var(--oh-border)]">
                        <table aria-label="Recent customer sales" className="w-full min-w-[650px] border-collapse text-sm">
                          <thead className="sticky top-0 bg-[var(--oh-primary)] text-white"><tr><th scope="col" className="px-3 py-2 text-left">Timestamp</th><th scope="col" className="px-3 py-2 text-left">User</th><th scope="col" className="px-3 py-2 text-right">Quantity</th><th scope="col" className="px-3 py-2 text-left">Item</th><th scope="col" className="px-3 py-2 text-right">Price</th></tr></thead>
                          <tbody className="divide-y divide-[var(--oh-border)]">{sortedSales.map((line, index) => <tr key={`${line.timestamp ?? "sale"}-${line.item ?? "item"}-${index}`} className="odd:bg-white even:bg-[var(--oh-surface)]"><td className="whitespace-nowrap px-3 py-2">{dateTime(line.timestamp)}</td><td className="px-3 py-2">{line.userName || "—"}</td><td className="px-3 py-2 text-right tabular-nums">{line.quantity ?? "—"}</td><td className="px-3 py-2">{line.item || "Sale line"}</td><td className="px-3 py-2 text-right tabular-nums">{money(line.price)}</td></tr>)}</tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}
                {tab === "sales" && (
                  <section><h3 className="mb-3 text-sm font-semibold">Sales history</h3>{sales.length === 0 ? <p className="py-8 text-center text-sm text-[var(--oh-muted)]">No Orithos sales history.</p> : <div className="overflow-x-auto border border-[var(--oh-border)]"><table aria-label="Customer sales history" className="w-full min-w-[650px] border-collapse text-sm"><thead className="bg-[var(--oh-primary)] text-white"><tr><th className="px-3 py-2 text-left">Timestamp</th><th className="px-3 py-2 text-left">User</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Price</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{sortedSales.map((line, index) => <tr key={`${line.timestamp ?? "sale"}-${line.item ?? "item"}-${index}`}><td className="px-3 py-2">{dateTime(line.timestamp)}</td><td className="px-3 py-2">{line.userName || "—"}</td><td className="px-3 py-2 text-right">{line.quantity ?? "—"}</td><td className="px-3 py-2">{line.item || "Sale line"}</td><td className="px-3 py-2 text-right">{money(line.price)}</td></tr>)}</tbody></table></div>}</section>
                )}
                {tab === "revisions" && (
                  <section><h3 className="mb-3 text-sm font-semibold">Revision history</h3>{revisions.length === 0 ? <p className="py-8 text-center text-sm text-[var(--oh-muted)]">No customer revisions recorded.</p> : <ol className="divide-y divide-[var(--oh-border)] border-y border-[var(--oh-border)]">{revisions.map((revision) => <li key={revision.id} className="flex gap-3 py-3"><Clock3 size={16} className="mt-0.5 shrink-0 text-[var(--oh-muted)]" /><div><p className="text-sm font-medium">{revision.summary || revision.kind || "Customer updated"}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">{dateTime(revision.createdAt)}</p></div></li>)}</ol>}</section>
                )}
              </>
            ) : null}
          </div>

          <nav aria-label="Customer sections" className="order-first flex gap-1 overflow-x-auto border-b border-[var(--oh-border)] bg-[var(--oh-surface)] p-2 lg:order-none lg:flex-col lg:gap-0 lg:overflow-y-auto lg:border-b-0 lg:border-l lg:p-3">
            <button type="button" aria-current={tab === "home" ? "page" : undefined} onClick={() => setTab("home")} className={`flex min-h-12 shrink-0 items-center gap-3 px-3 text-left text-sm ${tab === "home" ? "bg-white font-semibold text-[var(--oh-text)]" : "text-[var(--oh-muted)] hover:bg-white"}`}><Home size={18} /><span>Home</span></button>
            <Link href={`/customers/${customerId}/payment`} onClick={onClose} className="flex min-h-12 shrink-0 items-center gap-3 px-3 text-sm text-[var(--oh-muted)] hover:bg-white hover:text-[var(--oh-text)]"><CreditCard size={18} /><span>Balance &amp; payments</span><ArrowUpRight className="ml-auto" size={14} /></Link>
            <button type="button" aria-current={tab === "sales" ? "page" : undefined} onClick={() => setTab("sales")} className={`flex min-h-12 shrink-0 items-center gap-3 px-3 text-left text-sm ${tab === "sales" ? "bg-white font-semibold text-[var(--oh-text)]" : "text-[var(--oh-muted)] hover:bg-white"}`}><History size={18} /><span>Sales history</span></button>
            <button type="button" aria-current={tab === "revisions" ? "page" : undefined} onClick={() => setTab("revisions")} className={`flex min-h-12 shrink-0 items-center gap-3 px-3 text-left text-sm ${tab === "revisions" ? "bg-white font-semibold text-[var(--oh-text)]" : "text-[var(--oh-muted)] hover:bg-white"}`}><Clock3 size={18} /><span>Revision history</span></button>
          </nav>
        </div>
      </section>
    </div>
  );
}
