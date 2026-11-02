"use client";

import { ModalOverlay } from "@/components/ModalOverlay";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { CustomerLookup } from "@/components/CustomerLookup";
import { OdooCustomerGroupsPage } from "@/components/OdooCustomerGroupsPage";
import { OdooRecordLink } from "@/components/OdooRecordLink";
import { useSearchParams } from "next/navigation";
import { Archive, AlertCircle, Check, ChevronLeft, ChevronRight, Ellipsis, LoaderCircle, Mail, Pencil, Phone, Plus, RefreshCw, Search, UserRound, X } from "lucide-react";
import {
  createOdooCustomer,
  archiveOdooCustomer,
  getOdooCustomerGroups,
  getOdooPosBootstrap,
  getOdooPricelists,
  getOdooSession,
  searchOdooRecords,
  updateOdooCustomer,
  type OdooCustomerGroupRecord,
  type OdooCustomerRecord,
  type OdooPricelistRecord,
} from "@/lib/odoo-api";
import { formatStoreEpoch } from "@/lib/odoo-date";
import { useDialogFocus } from "@/hooks/useDialogFocus";

const PAGE_SIZE = 40;
const money = (amount?: number | null) => typeof amount === "number" && Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "—";

function CustomerEmptyState({ searching, onClear }: { searching: boolean; onClear: () => void }) {
  return (
    <div role="status" className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--oh-orange-light)] text-[var(--oh-primary)]">
        <UserRound size={19} aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-semibold text-[var(--oh-text)]">
        {searching ? "No customers match this search" : "No customers available"}
      </p>
      <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--oh-muted)]">
        {searching ? "Try another name, phone number, email or customer code." : "Customer records available to this Orithos account will appear here."}
      </p>
      {searching && (
        <button type="button" onClick={onClear} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-primary)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
          Clear search
        </button>
      )}
    </div>
  );
}

export function OdooCustomerDirectoryPage() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("customers.edit");
  const canBalance = hasPermission("customers.balances");
  const canGroups = hasPermission("customers.groups");
  const [groupFilter, setGroupFilter] = useState<number[]>([]);
  const [priceFilter, setPriceFilter] = useState<number[]>([]);
  const [selectedPriceIds, setSelectedPriceIds] = useState<number[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [detail, setDetail] = useState<OdooCustomerRecord | null>(null);
  useDialogFocus(Boolean(detail), () => setDetail(null));
  useEffect(() => { if (searchParams.get("manage") === "groups" && canGroups) setGroupsOpen(true); }, [searchParams, canGroups]);
  useEffect(() => { const id = Number(searchParams.get("pricelistId")); if (Number.isSafeInteger(id) && id > 0) setPriceFilter([id]); }, [searchParams]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectionRetryKey, setConnectionRetryKey] = useState(0);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [items, setItems] = useState<OdooCustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [storeTimezone, setStoreTimezone] = useState("Australia/Adelaide");
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pricelists, setPricelists] = useState<OdooPricelistRecord[]>([]);
  const [groups, setGroups] = useState<OdooCustomerGroupRecord[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  useDialogFocus(groupsOpen, () => { setGroupsOpen(false); setRefreshKey((value) => value + 1); });

  useEffect(() => {
    const initialQuery = searchParams.get("q");
    if (initialQuery !== null) setQuery(initialQuery);
  }, [searchParams]);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<OdooCustomerRecord | null>(null);
  const [archivingCustomerId, setArchivingCustomerId] = useState<number | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  useEffect(() => {
    const id = Number(searchParams.get("edit"));
    const customer = items.find((item) => item.id === id);
    if (customer && canEdit) openEdit(customer);
  }, [searchParams, items, canEdit]);

  const requestRevision = useRef(0);
  const customerNameInputRef = useRef<HTMLInputElement>(null);
  const queryPending = query.trim() !== debouncedQuery;
  const resultsBusy = loading || queryPending;
  const rowActionsDisabled = resultsBusy || Boolean(error);
  useDialogFocus(createOpen, () => {
    if (!creating) {
      setCreateOpen(false);
      setEditingCustomer(null);
    }
  }, undefined, customerNameInputRef);

  function clearSearch() {
    setQuery("");
    setOffset(0);
  }

  useEffect(() => {
    if (query.trim() === debouncedQuery) return;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    setCheckingConnection(true);
    void getOdooSession().then((user) => {
      if (!cancelled) setConnected(Boolean(user));
    }).catch((cause) => {
      if (!cancelled) {
        setConnected(false);
        setError(cause instanceof Error ? cause.message : "Could not check the Orithos connection.");
      }
    }).finally(() => {
      if (!cancelled) setCheckingConnection(false);
    });
    return () => { cancelled = true; };
  }, [connectionRetryKey]);

  useEffect(() => {
    if (connected !== true) return;
    let cancelled = false;
    void getOdooPosBootstrap().then((bootstrap) => {
      if (cancelled) return;
      const activeConfig = bootstrap.configs.find((config) => config.session) ?? bootstrap.configs[0];
      if (activeConfig?.timezone) setStoreTimezone(activeConfig.timezone);
    }).catch(() => {
      // Keep Adelaide as the display fallback when bootstrap is unavailable.
    });
    return () => { cancelled = true; };
  }, [connected]);

  const loadLookups = useCallback(async () => {
    if (connected !== true) return;
    setLookupError(null);
    try {
      const [pricePage, groupPage] = await Promise.all([
        getOdooPricelists(undefined, 0, 100),
        getOdooCustomerGroups(undefined, 0, 100),
      ]);
      setPricelists(pricePage.items.filter((item) => item.active));
      setGroups(groupPage.items);
    } catch (cause) {
      setLookupError(cause instanceof Error ? cause.message : "Could not load price lists or customer groups.");
      setPricelists([]);
      setGroups([]);
    }
  }, [connected]);

  useEffect(() => { void loadLookups(); }, [loadLookups, refreshKey]);

  const loadCustomers = useCallback(async () => {
    if (connected !== true) return;
    const revision = ++requestRevision.current;
    setLoading(true);
    setError(null);
    try {
      const page = await searchOdooRecords<OdooCustomerRecord>("customers", { query: debouncedQuery, limit: PAGE_SIZE, offset, groupId: groupFilter[0], pricelistId: priceFilter[0] });
      if (revision !== requestRevision.current) return;
      setItems(page.items.slice(0, PAGE_SIZE));
      setHasNext(page.hasNext ?? (page.items.length > PAGE_SIZE));
      setTotal(typeof page.total === "number" ? page.total : null);
      setLastLoadedAt(Date.now());
    } catch (cause) {
      if (revision === requestRevision.current) setError(cause instanceof Error ? cause.message : "Could not load Orithos customers.");
    } finally {
      if (revision === requestRevision.current) setLoading(false);
    }
  }, [connected, debouncedQuery, offset, groupFilter, priceFilter]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers, refreshKey]);

  function openCreate() {
    setEditingCustomer(null);
    setSelectedGroupIds([]);
    setSelectedPriceIds([]);
    setCreateError(null);
    setCreateOpen(true);
    void loadLookups();
  }

  function openEdit(customer: OdooCustomerRecord) {
    setEditingCustomer(customer);
    setSelectedPriceIds(Array.isArray(customer.property_product_pricelist) ? [customer.property_product_pricelist[0]] : []);
    setSelectedGroupIds(Array.isArray(customer.category_id) ? customer.category_id : []);
    setCreateError(null);
    setCreateOpen(true);
    void loadLookups();
  }

  async function submitCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const pricelistRaw = selectedPriceIds[0];
    setCreating(true);
    setCreateError(null);
    try {
      const values = {
        name,
        phone: String(form.get("phone") ?? "").trim(),
        email: String(form.get("email") ?? "").trim(),
        comment: String(form.get("comment") ?? "").trim(),
        ref: String(form.get("ref") ?? "").trim(),
        street: String(form.get("street") ?? "").trim(),
        city: String(form.get("city") ?? "").trim(),
        vat: String(form.get("vat") ?? "").trim(),
        company_type: (String(form.get("company_type") ?? "person") === "company" ? "company" : "person") as "person" | "company",
        property_product_pricelist: pricelistRaw ? Number(pricelistRaw) : null,
        category_id: selectedGroupIds,
      };
      if (editingCustomer) {
        await updateOdooCustomer(editingCustomer.id, values);
      } else {
        await createOdooCustomer(values);
      }
      setCreateOpen(false);
      setEditingCustomer(null);
      setOffset(0);
      if (!editingCustomer) setQuery(name);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : `Could not ${editingCustomer ? "update" : "create"} this Orithos customer.`);
    } finally {
      setCreating(false);
    }
  }

  async function archiveCustomer(customer: OdooCustomerRecord) {
    if (archivingCustomerId !== null || !window.confirm(`Archive ${customer.name}? It will no longer appear in the active customer directory.`)) return;
    setArchivingCustomerId(customer.id);
    setError(null);
    try {
      await archiveOdooCustomer(customer.id);
      if (detail?.id === customer.id) setDetail(null);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not archive this Orithos customer.");
    } finally {
      setArchivingCustomerId(null);
    }
  }

  const groupName = (ids?: number[]) => {
    if (!ids?.length) return "—";
    const names = ids.map((id) => groups.find((group) => group.id === id)?.name).filter(Boolean);
    return names.length ? names.join(", ") : `${ids.length} group${ids.length === 1 ? "" : "s"}`;
  };

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-y-contain bg-[var(--oh-surface)] px-4 pb-4 md:px-6 md:pb-6">
      <header className="mt-4 flex shrink-0 flex-col items-stretch gap-3 md:mt-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="oh-type-title text-[var(--oh-text)]">Customers</h1>
          <p className="oh-type-label mt-1 text-[var(--oh-muted)]">
            Orithos customer directory{total !== null ? ` · ${total} matching customers` : ""} with price lists, groups and receivable balances.
            {lastLoadedAt !== null && <span className="ml-2">Last refreshed {formatStoreEpoch(lastLoadedAt, storeTimezone)}.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <button type="button" onClick={openCreate} disabled={connected !== true} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> New customer</button>}
          {canGroups && <button type="button" onClick={() => setGroupsOpen(true)} className="min-h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold">Manage groups</button>}
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={resultsBusy} aria-label="Refresh customers" title="Refresh customers" className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">
            {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </button>
        </div>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Connect Orithos to view customers</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">Connect your Orithos staff account to see customers used by the Orithos register.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setConnectionRetryKey((value) => value + 1)} disabled={checkingConnection} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60">{checkingConnection ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} {checkingConnection ? "Retrying…" : "Retry connection"}</button>
              <Link href="/settings/integrations" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Connect Orithos</Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          <label className="flex h-11 w-full max-w-xl shrink-0 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
            <Search size={17} className="text-[var(--oh-muted)]" />
            <input aria-label="Search customers by name, phone, email or customer code" aria-busy={queryPending} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, email or customer code" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
          </label>
          <details className="rounded-lg border border-[var(--oh-border)] bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">Filters{groupFilter.length + priceFilter.length > 0 ? " · active" : ""}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
            <CustomerLookup kind="groups" label="Customer group" values={groupFilter} onChange={(ids) => { setGroupFilter(ids); setOffset(0); }} initialOptions={groups} />
            <CustomerLookup kind="pricelists" label="Customer price list" values={priceFilter} onChange={(ids) => { setPriceFilter(ids); setOffset(0); }} initialOptions={pricelists} />
          </div></details>
          {resultsBusy && items.length > 0 && <p role="status" aria-live="polite" className="text-sm text-[var(--oh-muted)]">{queryPending ? "Waiting to apply search…" : "Updating customer results…"} Existing rows are temporarily read-only.</p>}
          {lookupError && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">{lookupError} Price list and group assignment may be limited until this recovers.</div>}
          {error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800"><span>{error}{items.length > 0 && " The list below is the last successful result and may be out of date."}</span><button type="button" onClick={() => { setConnectionRetryKey((value) => value + 1); setRefreshKey((value) => value + 1); }} disabled={resultsBusy} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">{resultsBusy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}

          <section aria-busy={resultsBusy} className="shrink-0 overflow-visible rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table aria-label="Orithos customers" className="hidden w-full min-w-[1100px] border-collapse text-left text-sm xl:table">
              <thead className="sticky top-0 z-10 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)] shadow-[0_1px_0_var(--oh-border)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Customer</th>
                  <th scope="col" className="px-4 py-3">Phone</th>
                  <th scope="col" className="px-4 py-3">Email</th>
                  <th scope="col" className="px-4 py-3">Price list</th>
                  <th scope="col" className="px-4 py-3">Groups</th>
                  {canBalance && <th scope="col" className="px-4 py-3 text-right">Owing</th>}
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? Array.from({ length: 6 }, (_, index) => (
                  <tr key={`customer-skeleton-${index}`} aria-hidden="true">
                    <td colSpan={7} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /></td>
                  </tr>
                )) : items.length === 0 ? (
                  <tr><td colSpan={7} className="p-0"><CustomerEmptyState searching={Boolean(debouncedQuery)} onClear={clearSearch} /></td></tr>
                ) : items.map((customer) => (
                  <tr key={customer.id} className="transition-colors hover:bg-[var(--oh-surface)]/70">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${customer.id}/view`} className="flex min-h-11 items-center gap-2 text-left font-medium text-[var(--oh-primary)]"><UserRound size={16} />{customer.name}</Link>
                      <span className="ml-6 block text-xs text-[var(--oh-muted)]">Orithos #{customer.id}{customer.ref ? ` · ${customer.ref}` : ""}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.phone ? <a className="inline-flex items-center gap-1.5 rounded px-1 hover:text-[var(--sf-link-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`tel:${encodeURIComponent(customer.phone)}`}><Phone size={14} />{customer.phone}</a> : "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{customer.email ? <a className="inline-flex max-w-full items-center gap-1.5 rounded px-1 hover:text-[var(--sf-link-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`mailto:${encodeURIComponent(customer.email)}`}><Mail size={14} /><span className="break-all">{customer.email}</span></a> : "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{Array.isArray(customer.property_product_pricelist) ? customer.property_product_pricelist[1] : "—"}</td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{groupName(customer.category_id)}</td>
                    {canBalance && <td className="px-4 py-3 text-right font-medium text-[var(--oh-text)]">{money(customer.credit)}</td>}
                    <td className="px-4 py-3 text-right"><div className="flex justify-end gap-2"><Link href={`/customers/${customer.id}/view`} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)]">View</Link>{canEdit && <details className="relative"><summary className="inline-flex min-h-11 list-none cursor-pointer items-center gap-1 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-medium"><Ellipsis size={16} /> More</summary><div className="absolute right-0 z-20 mt-1 grid min-w-32 rounded-lg border bg-white p-1 text-left shadow-lg"><button type="button" onClick={() => openEdit(customer)} className="min-h-10 px-3 text-left text-sm hover:bg-[var(--oh-surface)]">Edit</button><button type="button" onClick={() => void archiveCustomer(customer)} className="min-h-10 px-3 text-left text-sm text-rose-800 hover:bg-rose-50">Archive</button></div></details>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] xl:hidden">
              {loading && items.length === 0 ? (
                <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Loading customers…</p>
              ) : items.length === 0 ? (
                <CustomerEmptyState searching={Boolean(debouncedQuery)} onClear={clearSearch} />
              ) : items.map((customer) => (
                <article key={customer.id} className="px-4 py-3.5">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/customers/${customer.id}/view`} className="flex min-h-11 items-center break-words text-left text-sm font-semibold text-[var(--oh-primary)]">{customer.name}</Link>
                      <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Orithos #{customer.id}{customer.ref ? ` · ${customer.ref}` : ""}</p>
                    </div>
                    {canBalance && <p className="shrink-0 text-sm font-semibold text-[var(--oh-text)]">{money(customer.credit)}</p>}
                  </header>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {customer.phone ? <a className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text-secondary)]" href={`tel:${encodeURIComponent(customer.phone)}`}><Phone size={15} className="shrink-0 text-[var(--oh-muted)]" /><span className="break-all">{customer.phone}</span></a> : <p className="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-muted)]"><Phone size={15} />No phone</p>}
                    {customer.email ? <a className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text-secondary)]" href={`mailto:${encodeURIComponent(customer.email)}`}><Mail size={15} className="shrink-0 text-[var(--oh-muted)]" /><span className="break-all">{customer.email}</span></a> : <p className="flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-muted)]"><Mail size={15} />No email</p>}
                  </div>
                  <p className="mt-2 text-xs text-[var(--oh-muted)]">
                    {Array.isArray(customer.property_product_pricelist) ? customer.property_product_pricelist[1] : "No price list"} · {groupName(customer.category_id)}
                  </p>
                  <footer className="mt-3 flex justify-end border-t border-[var(--oh-border)] pt-3">
                    <div className="flex gap-2"><button type="button" onClick={() => openEdit(customer)} disabled={connected !== true || rowActionsDisabled || !canEdit || archivingCustomerId !== null} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-50"><Pencil size={14} /> Edit</button><button type="button" onClick={() => void archiveCustomer(customer)} disabled={connected !== true || rowActionsDisabled || !canEdit || archivingCustomerId !== null} aria-label={`Archive ${customer.name}`} title="Archive customer" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-rose-200 text-rose-800 transition-colors hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-50">{archivingCustomerId === customer.id ? <LoaderCircle size={15} className="animate-spin" /> : <Archive size={15} />}</button></div>
                  </footer>
                </article>
              ))}
            </div>
          </section>

          <footer className="flex shrink-0 flex-col gap-2 pr-32 text-sm text-[var(--oh-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>{items.length ? `Page ${Math.floor(offset / PAGE_SIZE) + 1} · Showing ${offset + 1}–${offset + items.length}` : "No records"}</span>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button type="button" onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={offset === 0 || resultsBusy} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"><ChevronLeft size={16} /> Previous</button>
              <button type="button" onClick={() => setOffset((value) => value + PAGE_SIZE)} disabled={!hasNext || resultsBusy} className="inline-flex h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">Next <ChevronRight size={16} /></button>
            </div>
          </footer>
        </>
      )}

      {createOpen && <ModalOverlay className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !creating) { setCreateOpen(false); setEditingCustomer(null); } }}>
        <section role="dialog" aria-modal="true" aria-labelledby="customer-create-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-white p-4 shadow-2xl sm:p-5 md:p-6">
          <header className="flex items-start justify-between gap-4">
            <div><h2 id="customer-create-title" className="text-lg font-semibold text-[var(--oh-text)]">{editingCustomer ? "Edit customer" : "New customer"}</h2><p className="mt-1 text-sm text-[var(--oh-muted)]">{editingCustomer ? "Update this customer record in Orithos, including price list and groups." : "Create a contact in Orithos for sales and customer lookup."}</p></div>
            <button type="button" onClick={() => { setCreateOpen(false); setEditingCustomer(null); }} disabled={creating} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><X size={18} /></button>
          </header>
          <form key={editingCustomer?.id ?? "new-customer"} onSubmit={(event) => void submitCustomer(event)} className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]"><span>Customer name <span className="text-red-700">*</span></span>
              <input ref={customerNameInputRef} name="name" defaultValue={editingCustomer?.name ?? ""} maxLength={120} required className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Phone
                <input name="phone" type="tel" autoComplete="tel" defaultValue={editingCustomer?.phone || ""} maxLength={32} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Email
                <input name="email" type="email" autoComplete="email" defaultValue={editingCustomer?.email || ""} maxLength={254} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Notes
              <textarea name="comment" defaultValue={editingCustomer?.comment || ""} maxLength={4000} rows={3} className="min-h-20 rounded-lg border border-[var(--oh-border)] bg-white px-3 py-2 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
            </label>
            <details open={Boolean(editingCustomer)} className="grid gap-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Advanced information</summary>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Customer reference
                <input name="ref" defaultValue={editingCustomer?.ref || ""} maxLength={64} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Type
                <select name="company_type" defaultValue={editingCustomer?.company_type === "company" ? "company" : "person"} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15">
                  <option value="person">Individual</option>
                  <option value="company">Company</option>
                </select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">Street
                <input name="street" defaultValue={editingCustomer?.street || ""} maxLength={128} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">City
                <input name="city" defaultValue={editingCustomer?.city || ""} maxLength={64} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--oh-text)]">ABN / VAT
                <input name="vat" defaultValue={editingCustomer?.vat || ""} maxLength={64} className="h-11 rounded-lg border border-[var(--oh-border)] bg-white px-3 font-normal text-[var(--oh-text)] outline-none focus:border-[var(--oh-primary)] focus:ring-2 focus:ring-[var(--oh-primary)]/15" />
              </label>
              <CustomerLookup kind="pricelists" label="Price list" values={selectedPriceIds} onChange={setSelectedPriceIds} initialOptions={pricelists} />
            </div>
            <CustomerLookup kind="groups" label="Customer groups" multiple values={selectedGroupIds} onChange={setSelectedGroupIds} initialOptions={groups} />
            </details>

            {createError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{createError}</p>}
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--oh-border)] pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setCreateOpen(false); setEditingCustomer(null); }} disabled={creating} className="h-11 w-full rounded-md border border-[var(--oh-border)] px-4 text-sm font-semibold text-[var(--oh-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50 sm:w-auto">Cancel</button>
              <button type="submit" disabled={creating} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60 sm:w-auto">{creating ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} {editingCustomer ? "Save changes" : "Create customer"}</button>
            </footer>
          </form>
        </section>
      </ModalOverlay>}
      {groupsOpen && <ModalOverlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-2 sm:p-4"><section role="dialog" aria-modal="true" aria-label="Manage customer groups" className="flex max-h-[95dvh] w-full max-w-5xl flex-col overflow-y-auto rounded-xl bg-white"><button type="button" onClick={() => { setGroupsOpen(false); setRefreshKey((value) => value + 1); }} className="m-3 min-h-11 self-end rounded border px-4">Close groups</button><OdooCustomerGroupsPage /></section></ModalOverlay>}
      {detail && <ModalOverlay className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40"><section role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" className="h-full w-full max-w-lg overflow-y-auto bg-white p-5"><button type="button" onClick={() => setDetail(null)} className="min-h-11 rounded border px-3">Close details</button><h2 id="customer-detail-title" className="mt-4 text-xl font-semibold">{detail.name}</h2><dl className="mt-5 grid gap-3 text-sm">{[["Phone", detail.phone], ["Email", detail.email], ["Customer reference", detail.ref], ["Type", detail.company_type], ["Address", [detail.street, detail.city].filter(Boolean).join(", ")], ["ABN / VAT", detail.vat], ["Groups", groupName(detail.category_id)], ["Price list", Array.isArray(detail.property_product_pricelist) ? detail.property_product_pricelist[1] : "Store default"]].map(([label, value]) => <div key={String(label)}><dt className="text-[var(--oh-muted)]">{label}</dt><dd className="break-words font-medium">{value || "—"}</dd></div>)}</dl>{canBalance && <div className="mt-5 grid gap-3 rounded-lg border p-3"><p>Current receivable: {money(detail.credit)}</p><Link href={`/customers/balances?customerId=${detail.id}&q=${encodeURIComponent(detail.name)}`} className="min-h-11 text-[var(--oh-primary)] underline">Open unpaid invoices</Link></div>}<div className="mt-5 flex flex-wrap gap-2">{canEdit && <button type="button" onClick={() => { setDetail(null); openEdit(detail); }} className="min-h-11 rounded border px-3">Edit customer</button>}<OdooRecordLink model="res.partner" id={detail.id}>Open in Orithos</OdooRecordLink></div></section></ModalOverlay>}
    </main>
  );
}
