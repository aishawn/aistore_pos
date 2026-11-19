"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { api, type Page } from "@/lib/api";
import { formatStoreEpoch } from "@/lib/retail-date";
import { naturalSortRows } from "@/lib/natural-sort";

type CustomerDetail = {
  id: number;
  name: string;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  customerGroupName?: string | null;
  priceListName?: string | null;
  currentOwing?: number | null;
  street?: string | null;
  city?: string | null;
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

function money(value: number | null | undefined, currency = "AUD") {
  return value == null || !Number.isFinite(Number(value))
    ? "—"
    : new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(value));
}

export default function CustomerViewRoute() {
  const params = useParams();
  const id = String(params.id);
  const search = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(search.get("tab") ?? "overview");
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [sales, setSales] = useState<RecentSaleLine[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all([
      api.get<CustomerDetail>(`/api/customers/${id}`),
      api.get<RecentSaleLine[]>(`/api/customers/${id}/recent-sales`, { limit: 20 }),
      api.get<Page<Revision>>(`/api/customers/${id}/revisions`, { page: 1, size: 20 }).catch(() => ({ items: [] as Revision[], total: 0, page: 1, size: 20 })),
    ])
      .then(([detail, recent, revisionPage]) => {
        if (cancelled) return;
        setCustomer(detail);
        setSales(Array.isArray(recent) ? recent : []);
        setRevisions(revisionPage.items || []);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Customer data unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, refreshKey]);

  function changeTab(next: string) {
    setTab(next);
    router.replace(`/customers/${id}/view?tab=${next}`);
  }

  const sortedSales = useMemo(
    () => naturalSortRows(
      sales,
      (line) => (line.timestamp ? Date.parse(line.timestamp) : null),
      (line) => `${line.timestamp ?? ""}-${line.item ?? ""}`,
      "desc",
    ),
    [sales],
  );
  const sortedRevisions = useMemo(
    () => naturalSortRows(revisions, (item) => item.createdAt ?? null, (item) => item.id, "desc"),
    [revisions],
  );

  return (
    <main className="min-h-full overflow-y-auto bg-[var(--oh-surface)] px-4 py-5 md:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/customers" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--oh-primary)]">
          <ArrowLeft size={16} /> Customers
        </Link>
        <header className="mt-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{customer?.name ?? "Customer"}</h1>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">Orithos customer · {customer?.code || `Customer #${id}`}</p>
          </div>
          <div className="flex gap-2">
            <Link href={`/customers?edit=${id}`} className="inline-flex min-h-11 items-center rounded-lg border bg-white px-3 text-sm font-semibold">Edit</Link>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-white px-3 text-sm">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </header>
        <nav className="mt-6 flex gap-1 overflow-x-auto border-b" aria-label="Customer detail tabs">
          {([["overview", "Overview"], ["history", "Sales history"], ["balance", "Balance"], ["activity", "Activity"]] as const).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => changeTab(key)}
              className={`min-h-11 whitespace-nowrap border-b-2 px-3 text-sm font-semibold ${tab === key ? "border-[var(--oh-primary)] text-[var(--oh-primary)]" : "border-transparent text-[var(--oh-muted)]"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {error && <div role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
        {loading ? (
          <div className="grid place-items-center py-20 text-[var(--oh-muted)]"><LoaderCircle className="animate-spin" /></div>
        ) : customer && (
          <section className="mt-5 grid gap-4">
            {tab === "overview" && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <dl className="rounded-lg border bg-white p-4">
                    <dt className="text-sm text-[var(--oh-muted)]">Contact</dt>
                    <dd className="mt-2 space-y-1 text-sm">
                      {customer.phone || "No phone"}
                      <br />
                      {customer.email || "No email"}
                      <br />
                      {[customer.street, customer.city].filter(Boolean).join(", ") || "No address"}
                    </dd>
                  </dl>
                  <dl className="rounded-lg border bg-white p-4">
                    <dt className="text-sm text-[var(--oh-muted)]">Customer group & pricing</dt>
                    <dd className="mt-2 text-sm">
                      {customer.customerGroupName || "No group"}
                      <br />
                      {customer.priceListName || "Store default"}
                    </dd>
                  </dl>
                </div>
                <h2 className="text-lg font-semibold">Recent Orithos sales</h2>
                {sortedSales.length === 0 ? <p className="text-sm text-[var(--oh-muted)]">No recent sales for this customer.</p> : sortedSales.map((line, index) => (
                  <article key={`${line.timestamp ?? "sale"}-${index}`} className="rounded-lg border border-[var(--oh-border)] bg-white p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{line.item || "Sale line"}</strong>
                      <span className="font-semibold">{money(line.price)}</span>
                    </div>
                    <p className="mt-1 text-[var(--oh-muted)]">
                      {line.timestamp ? formatStoreEpoch(Date.parse(line.timestamp), "Australia/Adelaide") : "Time unavailable"}
                      {" · "}qty {line.quantity ?? "—"}
                      {" · "}{line.userName || "Unknown operator"}
                    </p>
                  </article>
                ))}
              </>
            )}
            {tab === "history" && (
              sortedSales.length === 0 ? <p className="text-sm text-[var(--oh-muted)]">No Orithos sales history for this customer.</p> : sortedSales.map((line, index) => (
                <article key={`${line.timestamp ?? "history"}-${index}`} className="rounded-lg border border-[var(--oh-border)] bg-white p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{line.item || "Sale line"}</strong>
                    <span className="font-semibold">{money(line.price)}</span>
                  </div>
                  <p className="mt-1 text-[var(--oh-muted)]">
                    {line.timestamp ? formatStoreEpoch(Date.parse(line.timestamp), "Australia/Adelaide") : "Time unavailable"}
                    {" · "}qty {line.quantity ?? "—"}
                    {" · "}{line.userName || "Unknown operator"}
                  </p>
                </article>
              ))
            )}
            {tab === "balance" && (
              <div className="rounded-lg border bg-white p-4">
                <p className="text-sm text-[var(--oh-muted)]">Current owing</p>
                <p className="mt-2 text-2xl font-semibold">{money(customer.currentOwing)}</p>
                <p className="mt-1 text-xs text-[var(--oh-muted)]">Orithos customer balance for this store.</p>
              </div>
            )}
            {tab === "activity" && (
              sortedRevisions.length === 0 ? <p className="text-sm text-[var(--oh-muted)]">No revision history yet.</p> : (
                <div className="space-y-2">
                  {sortedRevisions.map((item) => (
                    <article key={item.id} className="rounded-lg border bg-white p-4 text-sm">
                      <strong>{item.kind || "Revision"}</strong> · {item.summary || "Updated"}
                      <p className="mt-1 text-xs text-[var(--oh-muted)]">
                        {item.createdAt ? formatStoreEpoch(Date.parse(item.createdAt), "Australia/Adelaide") : "Time unavailable"}
                      </p>
                    </article>
                  ))}
                </div>
              )
            )}
          </section>
        )}
      </div>
    </main>
  );
}
