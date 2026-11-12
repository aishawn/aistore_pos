"use client";
import { clearNativeReadCache } from "@/lib/native-read-cache";

import { ModalOverlay } from "@/components/ModalOverlay";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { CustomerLookup } from "@/components/CustomerLookup";
import { OdooCustomerGroupsPage } from "@/components/OdooCustomerGroupsPage";
import { OdooRecordLink } from "@/components/OdooRecordLink";
import { FilterMultiSelect } from "@/components/admin/FilterMultiSelect";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { useSearchParams } from "next/navigation";
import { Archive, AlertCircle, Check, Ellipsis, LoaderCircle, Mail, Pencil, Phone, Plus, RefreshCw, Search, UserRound, X } from "lucide-react";
import {
  createOdooCustomer,
  archiveOdooCustomer,
  getOdooCustomerGroups,
  getOdooPricelists,
  getOrithosSession,
  searchOdooRecords,
  updateOdooCustomer,
  type OdooCustomerGroupRecord,
  type OdooCustomerRecord,
  type OdooPricelistRecord,
} from "@/lib/odoo-api";
import { Sparkline } from "@/components/admin/Sparkline";
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
        {searching ? "No customers match these filters" : "No customers available"}
      </p>
      <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--oh-muted)]">
        {searching ? "Try another search, customer group or price list." : "Customer records available to this Orithos account will appear here."}
      </p>
      {searching && (
        <button type="button" onClick={onClear} className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-primary)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
          Clear filters
        </button>
      )}
    </div>
  );
}

export function OdooCustomerDirectoryPage() {
  const searchParams = useSearchParams();
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission("customers.edit");
  const canBalance = hasPermission("customers.balances");
  const canGroups = hasPermission("customers.groups");
  const [groupFilterValues, setGroupFilterValues] = useState<string[]>([]);
  const [priceListFilter, setPriceListFilter] = useState("");
  const [selectedPriceIds, setSelectedPriceIds] = useState<number[]>([]);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [detail, setDetail] = useState<OdooCustomerRecord | null>(null);
  useDialogFocus(Boolean(detail), () => setDetail(null));
  useEffect(() => { if (searchParams.get("manage") === "groups" && canGroups) setGroupsOpen(true); }, [searchParams, canGroups]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connectionRetryKey, setConnectionRetryKey] = useState(0);
  const [checkingConnection, setCheckingConnection] = useState(true);
  const [items, setItems] = useState<OdooCustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const nextOffset = useRef(0);
  const requestBusy = useRef(false);
  const loadedFilters = useRef("");
  const failedAppend = useRef(false);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const scrollRoot = useRef<HTMLElement>(null);
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
    setDebouncedQuery("");
  }

  function clearFilters() {
    clearSearch();
    setGroupFilterValues([]);
    setPriceListFilter("");
  }

  useEffect(() => {
    if (query.trim() === debouncedQuery) return;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, debouncedQuery]);

  useEffect(() => {
    if (user) {
      setConnected(true);
      setCheckingConnection(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setCheckingConnection(true);
    void getOrithosSession().then((sessionUser) => {
      if (!cancelled) setConnected(Boolean(sessionUser));
    }).catch((cause) => {
      if (!cancelled) {
        setConnected(false);
        setError(cause instanceof Error ? cause.message : "Could not check the Orithos connection.");
      }
    }).finally(() => {
      if (!cancelled) setCheckingConnection(false);
    });
    return () => { cancelled = true; };
  }, [connectionRetryKey, user]);

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

  const groupIdsParam = groupFilterValues.length ? groupFilterValues.join(",") : undefined;
  const groupOptions = [
    { value: "__none__", label: "No Group" },
    ...groups.map((group) => ({ value: String(group.id), label: group.name })),
  ];
  const priceListOptions = [
    { value: "__none__", label: "No price list" },
    ...pricelists.map((list) => ({ value: String(list.id), label: list.name })),
  ];
  const filtersActive = Boolean(debouncedQuery || groupFilterValues.length || priceListFilter);

  const loadCustomers = useCallback(async (append = false) => {
    if (connected !== true) return;
    if (append && requestBusy.current) return;
    requestBusy.current = true;
    const offset = append ? nextOffset.current : 0;
    if (!append) { setHasNext(false); nextOffset.current = 0; }
    const revision = ++requestRevision.current;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const page = await searchOdooRecords<OdooCustomerRecord>("customers", {
        query: debouncedQuery,
        limit: PAGE_SIZE,
        offset,
        groupIds: groupIdsParam,
        pricelistId: priceListFilter || undefined,
      });
      if (revision !== requestRevision.current) return;
      if (page.hasNext && !page.items.length) throw new Error("The next batch was empty. Retry to continue.");
      setItems((previous) => append ? [...previous, ...page.items.slice(0, PAGE_SIZE).filter((row) => !previous.some((item) => item.id === row.id))] : page.items.slice(0, PAGE_SIZE));
      nextOffset.current = offset + Math.min(page.items.length, PAGE_SIZE);
      setHasNext(page.hasNext ?? (page.items.length > PAGE_SIZE));
      setTotal(typeof page.total === "number" ? page.total : null);
      setLastLoadedAt(page.generatedAt ? Date.parse(page.generatedAt) : Date.now());
    } catch (cause) {
      if (revision === requestRevision.current) { failedAppend.current = append; setError(cause instanceof Error ? cause.message : "Could not load Orithos customers."); }
    } finally {
      if (revision === requestRevision.current) { requestBusy.current = false; setLoading(false); setLoadingMore(false); }
    }
  }, [connected, debouncedQuery, groupIdsParam, priceListFilter]);

  useEffect(() => {
    const filters = JSON.stringify([connected, debouncedQuery, groupFilterValues, priceListFilter]);
    if (loadedFilters.current !== filters) { setItems([]); loadedFilters.current = filters; }
    scrollRoot.current?.scrollTo({ top: 0 });
    void loadCustomers();
    return () => { requestRevision.current += 1; requestBusy.current = false; };
  }, [loadCustomers, refreshKey, connected, debouncedQuery, groupFilterValues, priceListFilter]);
  useEffect(() => {
    const node = sentinel.current; const root = scrollRoot.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && hasNext && !loading && !loadingMore && !error) {
        void loadCustomers(true);
      }
    }, { root, rootMargin: "480px 0px" });
    observer.observe(node); return () => observer.disconnect();
  }, [hasNext, loading, loadingMore, error, loadCustomers]);

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

  const groupName = (customer: OdooCustomerRecord) => {
    if (customer.category_name) return customer.category_name;
    const ids = customer.category_id;
    if (!ids?.length) return "—";
    const names = ids.map((id) => groups.find((group) => group.id === id)?.name).filter(Boolean);
    return names.length ? names.join(", ") : `${ids.length} group${ids.length === 1 ? "" : "s"}`;
  };

  const contactCell = (customer: OdooCustomerRecord) => {
    const phone = customer.phone || "";
    const email = customer.email || "";
    if (!phone && !email) return "—";
    return (
      <div className="grid gap-1 text-[var(--oh-text-secondary)]">
        {phone ? <a className="inline-flex items-center gap-1.5 rounded px-1 hover:text-[var(--sf-link-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`tel:${encodeURIComponent(phone)}`}><Phone size={14} />{phone}</a> : null}
        {email ? <a className="inline-flex max-w-full items-center gap-1.5 rounded px-1 hover:text-[var(--sf-link-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]" href={`mailto:${encodeURIComponent(email)}`}><Mail size={14} /><span className="break-all">{email}</span></a> : null}
      </div>
    );
  };

  return (
    <main ref={scrollRoot} data-testid="customer-results-scroll" className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-y-contain bg-[var(--oh-surface)] px-4 pb-4 md:px-6 md:pb-6">
      <header className="mt-4 flex shrink-0 flex-col items-stretch gap-3 md:mt-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="oh-type-title text-[var(--oh-text)]">Customers</h1>
            {canEdit && <button type="button" onClick={openCreate} disabled={connected !== true} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Add Customer</button>}
            {canGroups && <button type="button" onClick={() => setGroupsOpen(true)} className="inline-flex h-11 items-center rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Manage groups</button>}
            <button type="button" onClick={() => { clearNativeReadCache(); setRefreshKey((value) => value + 1); }} disabled={resultsBusy} aria-label="Refresh customers" title="Refresh customers" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--oh-border)] bg-white text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60 sm:w-auto sm:gap-2 sm:px-3">
              {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}<span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">
            Customer directory for this store.
            {lastLoadedAt !== null && <span className="ml-2">Last refreshed {formatStoreEpoch(lastLoadedAt, storeTimezone)}.</span>}
          </p>
        </div>
        <div className="shrink-0 text-right" aria-live="polite">
          <p className="text-3xl font-bold tabular-nums leading-none text-[var(--oh-text)]">{loading && items.length === 0 ? "—" : (total ?? items.length).toLocaleString("en-AU")}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Results</p>
        </div>
      </header>

      {connected === false ? (
        <section className="grid flex-1 place-items-center rounded-lg border border-[var(--oh-border)] bg-white p-8 text-center">
          <div className="max-w-md">
            <AlertCircle className="mx-auto text-amber-600" size={28} />
            <h2 className="mt-3 text-lg font-semibold text-[var(--oh-text)]">Sign in to view customers</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oh-muted)]">
              {error || "Your staff session is required to load the Orithos customer directory for this store."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setConnectionRetryKey((value) => value + 1)} disabled={checkingConnection} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-not-allowed disabled:opacity-60">{checkingConnection ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} {checkingConnection ? "Retrying…" : "Retry"}</button>
              <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">Sign in</Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="flex shrink-0 flex-col gap-3">
            <label className="flex h-11 w-full items-center gap-2 rounded-lg border border-[var(--oh-border)] bg-white px-3 transition-colors focus-within:border-[var(--oh-primary)] focus-within:ring-2 focus-within:ring-[var(--oh-primary)]/15">
              <Search size={17} className="text-[var(--oh-muted)]" />
              <input aria-label="Search customers by name, phone, email or customer code" aria-busy={queryPending} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Customers..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--oh-placeholder)]" />
            </label>
            <div className="grid items-end gap-3 sm:grid-cols-2 lg:max-w-3xl">
              <FilterMultiSelect
                label="Customer Group"
                placeholder="Select..."
                options={groupOptions}
                values={groupFilterValues}
                onChange={setGroupFilterValues}
              />
              <FilterSelect
                label="Price List"
                placeholder="Select..."
                options={priceListOptions}
                value={priceListFilter}
                onChange={setPriceListFilter}
              />
            </div>
            {filtersActive && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[var(--oh-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
                  <X size={14} /> Clear filters
                </button>
              </div>
            )}
          </div>
          {resultsBusy && items.length > 0 && <p role="status" aria-live="polite" className="text-sm text-[var(--oh-muted)]">{queryPending ? "Waiting to apply search…" : "Updating customer results…"} Existing rows are temporarily read-only.</p>}
          {lookupError && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">{lookupError} Group and price-list filters may be incomplete until this recovers.</div>}
          {error && <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm leading-5 text-rose-800"><span>{error}{items.length > 0 && " The list below is the last successful result and may be out of date."}</span><button type="button" onClick={() => { clearNativeReadCache(); void loadCustomers(failedAppend.current); }} disabled={resultsBusy} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-60">{resultsBusy ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Retry</button></div>}

          <section aria-busy={resultsBusy} className="shrink-0 overflow-visible rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <table aria-label="Orithos customers" className="hidden w-full min-w-[1100px] border-collapse text-left text-sm xl:table">
              <thead className="sticky top-0 z-10 bg-[var(--oh-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)] shadow-[0_1px_0_var(--oh-border)]">
                <tr>
                  <th scope="col" className="px-4 py-3">Customer</th>
                  <th scope="col" className="px-4 py-3">Group</th>
                  <th scope="col" className="px-4 py-3">Contact</th>
                  <th scope="col" className="px-4 py-3 text-center">Performance</th>
                  {canBalance && <th scope="col" className="px-4 py-3 text-right">Owing</th>}
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--oh-border)]">
                {loading && items.length === 0 ? Array.from({ length: 6 }, (_, index) => (
                  <tr key={`customer-skeleton-${index}`} aria-hidden="true">
                    <td colSpan={canBalance ? 6 : 5} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-[var(--oh-border)]" /></td>
                  </tr>
                )) : items.length === 0 ? (
                  <tr><td colSpan={canBalance ? 6 : 5} className="p-0"><CustomerEmptyState searching={filtersActive} onClear={clearFilters} /></td></tr>
                ) : items.map((customer) => {
                  const points = customer.performance_30d ?? [];
                  const units = points.reduce((sum, point) => sum + (Number(point) || 0), 0);
                  return (
                  <tr key={customer.id} className="transition-colors hover:bg-[var(--oh-surface)]/70">
                    <td className="px-4 py-3">
                      <Link href={`/customers/${customer.id}/view`} className="flex min-h-11 items-center gap-2 text-left font-medium text-[var(--oh-primary)]"><UserRound size={16} />{customer.name}</Link>
                      <span className="ml-6 block text-xs text-[var(--oh-muted)]">Orithos #{customer.id}{customer.ref ? ` · ${customer.ref}` : ""}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--oh-text-secondary)]">{groupName(customer)}</td>
                    <td className="px-4 py-3">{contactCell(customer)}</td>
                    <td className="px-4 py-3">
                      <div className="mx-auto flex min-w-[140px] max-w-[180px] flex-col items-center gap-1" title="Units sold per day over the past 30 Adelaide business days">
                        <Sparkline points={points} width={140} height={36} />
                        <span className="text-[11px] tabular-nums text-[var(--oh-muted)]">{points.length ? `${units.toLocaleString("en-AU")} units · 30d` : "Performance unavailable"}</span>
                      </div>
                    </td>
                    {canBalance && <td className="px-4 py-3 text-right font-medium text-[var(--oh-text)]">{money(customer.credit)}</td>}
                    <td className="px-4 py-3 text-right"><div className="flex justify-end gap-2"><Link href={`/customers/${customer.id}/view`} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)]">View</Link>{canEdit && <details className="relative"><summary className="inline-flex min-h-11 list-none cursor-pointer items-center gap-1 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-medium"><Ellipsis size={16} /> More</summary><div className="absolute right-0 z-20 mt-1 grid min-w-32 rounded-lg border bg-white p-1 text-left shadow-lg"><button type="button" onClick={() => openEdit(customer)} className="min-h-10 px-3 text-left text-sm hover:bg-[var(--oh-surface)]">Edit</button><button type="button" onClick={() => void archiveCustomer(customer)} className="min-h-10 px-3 text-left text-sm text-rose-800 hover:bg-rose-50">Archive</button></div></details>}</div></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="divide-y divide-[var(--oh-border)] xl:hidden">
              {loading && items.length === 0 ? (
                <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[var(--oh-muted)]"><LoaderCircle size={15} className="animate-spin" />Loading customers…</p>
              ) : items.length === 0 ? (
                <CustomerEmptyState searching={filtersActive} onClear={clearFilters} />
              ) : items.map((customer) => {
                const points = customer.performance_30d ?? [];
                const units = points.reduce((sum, point) => sum + (Number(point) || 0), 0);
                return (
                <article key={customer.id} className="px-4 py-3.5">
                  <header className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/customers/${customer.id}/view`} className="flex min-h-11 items-center break-words text-left text-sm font-semibold text-[var(--oh-primary)]">{customer.name}</Link>
                      <p className="mt-0.5 text-xs text-[var(--oh-muted)]">Orithos #{customer.id}{customer.ref ? ` · ${customer.ref}` : ""}</p>
                    </div>
                    {canBalance && <p className="shrink-0 text-sm font-semibold text-[var(--oh-text)]">{money(customer.credit)}</p>}
                  </header>
                  <div className="mt-3 grid gap-2">
                    <p className="text-sm text-[var(--oh-text-secondary)]">Group · {groupName(customer)}</p>
                    {contactCell(customer)}
                    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-[var(--oh-surface)] px-3 py-2">
                      <Sparkline points={points} width={96} height={28} />
                      <span className="text-[11px] tabular-nums text-[var(--oh-muted)]">{points.length ? `${units.toLocaleString("en-AU")} · 30d` : "No performance"}</span>
                    </div>
                  </div>
                  <footer className="mt-3 flex justify-end border-t border-[var(--oh-border)] pt-3">
                    <div className="flex gap-2"><button type="button" onClick={() => openEdit(customer)} disabled={connected !== true || rowActionsDisabled || !canEdit || archivingCustomerId !== null} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-50"><Pencil size={14} /> Edit</button><button type="button" onClick={() => void archiveCustomer(customer)} disabled={connected !== true || rowActionsDisabled || !canEdit || archivingCustomerId !== null} aria-label={`Archive ${customer.name}`} title="Archive customer" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-rose-200 text-rose-800 transition-colors hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-50">{archivingCustomerId === customer.id ? <LoaderCircle size={15} className="animate-spin" /> : <Archive size={15} />}</button></div>
                  </footer>
                </article>
                );
              })}
            </div>
          </section>

          <footer ref={sentinel} className="flex shrink-0 flex-wrap items-center justify-center gap-3 py-3 text-sm text-[var(--oh-muted)]" aria-live="polite">
            {loadingMore ? "Loading more customers…" : hasNext ? `Loaded ${items.length} of ${total ?? "more"} customers` : `${items.length} customers loaded`}

            {hasNext && <button type="button" disabled={loading || loadingMore || Boolean(error)} onClick={() => void loadCustomers(true)} className="min-h-11 rounded-md border border-[var(--oh-border)] px-3 font-semibold text-[var(--oh-primary)] disabled:opacity-60">{loadingMore ? "Loading…" : "Load more"}</button>}
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
      {groupsOpen && <ModalOverlay className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/40 p-2 sm:p-4"><section role="dialog" aria-modal="true" aria-label="Manage customer groups" className="flex max-h-[95dvh] w-full max-w-5xl flex-col overflow-y-auto rounded-xl bg-white"><OdooCustomerGroupsPage onClose={() => { setGroupsOpen(false); setRefreshKey((value) => value + 1); }} /></section></ModalOverlay>}
      {detail && <ModalOverlay className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40"><section role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" className="h-full w-full max-w-lg overflow-y-auto bg-white p-5"><header className="flex items-start justify-between gap-3"><h2 id="customer-detail-title" className="text-xl font-semibold">{detail.name}</h2><button type="button" onClick={() => setDetail(null)} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--oh-muted)] transition-colors hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button></header><dl className="mt-5 grid gap-3 text-sm">{[["Phone", detail.phone], ["Email", detail.email], ["Customer reference", detail.ref], ["Type", detail.company_type], ["Address", [detail.street, detail.city].filter(Boolean).join(", ")], ["ABN / VAT", detail.vat], ["Groups", groupName(detail)], ["Price list", Array.isArray(detail.property_product_pricelist) ? detail.property_product_pricelist[1] : "Store default"]].map(([label, value]) => <div key={String(label)}><dt className="text-[var(--oh-muted)]">{label}</dt><dd className="break-words font-medium">{value || "—"}</dd></div>)}</dl>{canBalance && <div className="mt-5 grid gap-3 rounded-lg border p-3"><p>Current receivable: {money(detail.credit)}</p><Link href={`/customers/balances?customerId=${detail.id}&q=${encodeURIComponent(detail.name)}`} className="min-h-11 text-[var(--oh-primary)] underline">Open unpaid invoices</Link></div>}<div className="mt-5 flex flex-wrap gap-2">{canEdit && <button type="button" onClick={() => { setDetail(null); openEdit(detail); }} className="min-h-11 rounded border px-3">Edit customer</button>}<OdooRecordLink model="res.partner" id={detail.id}>Open in Orithos</OdooRecordLink></div></section></ModalOverlay>}
    </main>
  );
}
