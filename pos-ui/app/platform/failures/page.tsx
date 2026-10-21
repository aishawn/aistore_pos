"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { AdminPageLayout, AdminSearchInput, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { Pagination } from "@/components/admin/Pagination";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type Page } from "@/lib/api";

type FailureGroup = {
  fingerprint: string;
  environment: string;
  service: string;
  tenantId: number | null;
  tenantName: string | null;
  tenantSlug: string | null;
  httpMethod: string;
  requestPath: string;
  httpStatus: number;
  errorCode: number | null;
  errorType: string;
  errorSummary: string | null;
  occurrences: number;
  latestDurationMs: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  latestCorrelationId: string | null;
  runtimeCommit: string | null;
};

type Filters = { q: string; tenantId: string; httpStatus: string; errorCode: string; from: string; to: string };
type Applied = Omit<Filters, "from" | "to"> & { from?: string; to?: string };
const PAGE_SIZE = 50;

function localDate(daysAgo: number): string {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  value.setSeconds(0, 0);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function dateTime(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = new Date(/(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? value : `${parsed.toLocaleString(undefined, { timeZone: "UTC" })} UTC`;
}

export default function PlatformFailuresPage() {
  const { user, ready } = useAuth();
  const [filters, setFilters] = useState<Filters>({ q: "", tenantId: "", httpStatus: "", errorCode: "", from: localDate(7), to: localDate(0) });
  const [applied, setApplied] = useState<Applied>({ q: "", tenantId: "", httpStatus: "", errorCode: "", from: toIso(localDate(7)), to: toIso(localDate(0)) });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<FailureGroup> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    if (refresh) setRefreshing(true);
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<Page<FailureGroup>>("/api/admin/failures/events", {
        q: applied.q || undefined,
        tenantId: applied.tenantId || undefined,
        httpStatus: applied.httpStatus || undefined,
        errorCode: applied.errorCode || undefined,
        from: applied.from,
        to: applied.to,
        page,
        size: PAGE_SIZE,
      });
      if (sequence === requestSequence.current) setData(result);
    } catch (cause) {
      if (sequence === requestSequence.current) {
        setError(cause instanceof ApiError
          ? `${cause.message}${cause.correlationId ? ` · Request ID ${cause.correlationId}` : ""}`
          : "Could not load platform failures.");
      }
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [applied, page]);

  useEffect(() => {
    if (ready && user?.platformOperator) void load();
  }, [ready, user, load]);

  if (!ready || !user?.platformOperator) return null;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filters.from && filters.to && new Date(filters.from).getTime() > new Date(filters.to).getTime()) {
      setError("The start of the date range must be before the end.");
      return;
    }
    setPage(1);
    setApplied({ ...filters, q: filters.q.trim(), from: toIso(filters.from), to: toIso(filters.to) });
  }

  function clearFilters() {
    const cleared: Filters = { q: "", tenantId: "", httpStatus: "", errorCode: "", from: "", to: "" };
    setFilters(cleared);
    setApplied({ q: "", tenantId: "", httpStatus: "", errorCode: "" });
    setError(null);
    setPage(1);
  }

  const hasFilters = Boolean(applied.q || applied.tenantId || applied.httpStatus || applied.errorCode || applied.from || applied.to);
  const invalidDateRange = Boolean(filters.from && filters.to && new Date(filters.from).getTime() > new Date(filters.to).getTime());
  const group = (item: FailureGroup, compact = false) => (
    <article key={item.fingerprint} className={compact ? "border-b border-[var(--oh-border)] py-4" : "min-w-0"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">HTTP {item.httpStatus}</span>
        <span className="text-xs font-semibold text-[var(--oh-text)]">{item.errorType}</span>
        <span className="rounded border border-[var(--oh-border)] px-2 py-0.5 text-xs text-[var(--oh-text-secondary)]">{item.occurrences} occurrences</span>
      </div>
      <p className="mt-2 break-all font-mono text-xs text-[var(--oh-text-secondary)]">{item.httpMethod} {item.requestPath}</p>
      <p className="mt-1 text-xs text-[var(--oh-muted)]">
        {item.tenantId ? <Link href={`/platform/stores/${item.tenantId}`} className="font-medium text-[var(--oh-primary)] hover:underline">{item.tenantName || item.tenantSlug || `Store ${item.tenantId}`}</Link> : "Platform service"}
        {item.tenantSlug ? ` · ${item.tenantSlug}` : ""} · {item.environment} · {item.service}
      </p>
      {item.errorCode != null ? <p className="mt-1 text-xs text-rose-700">Application code {item.errorCode}</p> : null}
      {item.errorSummary ? <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-[var(--oh-primary)]">Sanitized error summary</summary><p className="mt-1 break-words text-xs text-[var(--oh-text-secondary)]">{item.errorSummary}</p></details> : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div><dt className="text-[var(--oh-muted)]">First seen</dt><dd className="mt-0.5">{dateTime(item.firstSeenAt)}</dd></div>
        <div><dt className="text-[var(--oh-muted)]">Last seen</dt><dd className="mt-0.5">{dateTime(item.lastSeenAt)}</dd></div>
        <div><dt className="text-[var(--oh-muted)]">Latest duration</dt><dd className="mt-0.5">{item.latestDurationMs == null ? "Unknown" : `${item.latestDurationMs} ms`}</dd></div>
        <div className="col-span-2"><dt className="text-[var(--oh-muted)]">Latest request ID</dt><dd className="mt-0.5 break-all font-mono">{item.latestCorrelationId || "Unknown"}</dd></div>
        <div className="col-span-2"><dt className="text-[var(--oh-muted)]">Runtime SHA</dt><dd className="mt-0.5 break-all font-mono">{item.runtimeCommit || "Unknown"}</dd></div>
      </dl>
    </article>
  );

  return (
    <AdminPageLayout
      title="Platform failures"
      subtitle="Unexpected server failures grouped by store, route, error and runtime version."
      count={data?.total ?? 0}
      countLabel="Failure groups"
      fullBleed
      search={(
        <form onSubmit={applyFilters} className="grid gap-3 md:grid-cols-3 xl:grid-cols-6 xl:items-end">
          <AdminSearchInput label="Search store, route, error or request ID" value={filters.q} onChange={(q) => setFilters((current) => ({ ...current, q }))} placeholder="Name, path, UUID…" />
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">Store ID<input inputMode="numeric" value={filters.tenantId} onChange={(event) => setFilters((current) => ({ ...current, tenantId: event.target.value.replace(/\D/g, "") }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-sm" placeholder="All stores" /></label>
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">HTTP status<select value={filters.httpStatus} onChange={(event) => setFilters((current) => ({ ...current, httpStatus: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-sm"><option value="">All failures</option><option value="200">API error envelope (200)</option>{[500, 502, 503, 504].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">App error code<input inputMode="numeric" value={filters.errorCode} onChange={(event) => setFilters((current) => ({ ...current, errorCode: event.target.value.replace(/\D/g, "").slice(0, 9) }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-sm" placeholder="Any" /></label>
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">From<input type="datetime-local" value={filters.from} aria-invalid={invalidDateRange} aria-describedby={invalidDateRange ? "failures-date-range-error" : undefined} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2" /></label>
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">To<input type="datetime-local" value={filters.to} aria-invalid={invalidDateRange} aria-describedby={invalidDateRange ? "failures-date-range-error" : undefined} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2" /></label>
          <div className="flex gap-2 xl:col-span-2"><button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white"><Search size={16} aria-hidden="true" />Search</button><button type="button" onClick={clearFilters} disabled={!hasFilters} aria-label="Clear failure filters" title="Clear filters" className="grid size-11 place-items-center rounded-md border border-[var(--oh-border)] text-[var(--oh-text-secondary)] disabled:opacity-40"><X size={16} aria-hidden="true" /></button></div>
        </form>
      )}
      actions={<AdminSecondaryButton onClick={() => void load(true)} disabled={loading}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />Refresh</AdminSecondaryButton>}
    >
      {error ? <div id={invalidDateRange ? "failures-date-range-error" : undefined} role="alert" className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><span className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</span><button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold disabled:opacity-50"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />Retry</button></div> : null}
      {loading && !data ? <div role="status" className="grid place-items-center border-y border-[var(--oh-border)] py-16 text-[var(--oh-muted)]"><LoaderCircle size={20} className="animate-spin" /></div> : data?.items.length === 0 ? <div role="status" className="border-y border-[var(--oh-border)] py-12 text-center text-sm text-[var(--oh-muted)]">{hasFilters ? "No failures match these filters." : "No server failures recorded."}</div> : data ? <>
        <div className="hidden overflow-x-auto border-y border-[var(--oh-border)] bg-white md:block"><table className="w-full min-w-[1120px] border-collapse text-sm"><thead className="bg-[var(--oh-surface)] text-left text-xs text-[var(--oh-text-secondary)]"><tr>{["Failure", "Store", "Occurrences", "First seen", "Last seen", "Last duration", "Latest request ID", "Runtime SHA"].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{data.items.map((item) => <tr key={`${item.fingerprint}-${item.tenantId ?? "platform"}`} className="align-top"><td className="min-w-64 px-3 py-3"><div className="flex flex-wrap items-center gap-2"><span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-800">HTTP {item.httpStatus}</span><span className="text-xs font-semibold">{item.errorType}</span>{item.errorCode != null ? <span className="text-xs text-rose-700">Code {item.errorCode}</span> : null}</div><p className="mt-2 break-all font-mono text-xs text-[var(--oh-text-secondary)]">{item.httpMethod} {item.requestPath}</p><p className="mt-1 text-xs text-[var(--oh-muted)]">{item.environment} · {item.service}</p>{item.errorSummary ? <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-[var(--oh-primary)]">Sanitized summary</summary><p className="mt-1 break-words text-xs text-[var(--oh-text-secondary)]">{item.errorSummary}</p></details> : null}</td><td className="px-3 py-3">{item.tenantId ? <Link href={`/platform/stores/${item.tenantId}`} className="font-medium text-[var(--oh-primary)] hover:underline">{item.tenantName || item.tenantSlug || `Store ${item.tenantId}`}</Link> : "Platform"}<div className="text-xs text-[var(--oh-muted)]">{item.tenantSlug || ""}</div></td><td className="px-3 py-3 tabular-nums">{item.occurrences}</td><td className="whitespace-nowrap px-3 py-3 text-xs">{dateTime(item.firstSeenAt)}</td><td className="whitespace-nowrap px-3 py-3 text-xs">{dateTime(item.lastSeenAt)}</td><td className="whitespace-nowrap px-3 py-3 text-xs">{item.latestDurationMs == null ? "Unknown" : `${item.latestDurationMs} ms`}</td><td className="max-w-44 break-all px-3 py-3 font-mono text-[11px]">{item.latestCorrelationId || "Unknown"}</td><td className="max-w-44 break-all px-3 py-3 font-mono text-[11px]">{item.runtimeCommit || "Unknown"}</td></tr>)}</tbody></table></div>
        <div className="divide-y divide-[var(--oh-border)] md:hidden">{data.items.map((item) => group(item, true))}</div>
        <Pagination page={page} size={PAGE_SIZE} total={data.total} onPage={setPage} />
      </> : null}
    </AdminPageLayout>
  );
}
