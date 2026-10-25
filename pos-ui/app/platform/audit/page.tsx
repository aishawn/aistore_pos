"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, LoaderCircle, RefreshCw, Search, X } from "lucide-react";
import { AdminPageLayout, AdminSearchInput, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { Pagination } from "@/components/admin/Pagination";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type Page } from "@/lib/api";

type AuditEvent = {
  id: number;
  eventId: string;
  correlationId: string | null;
  tenantId: number | null;
  tenantName: string | null;
  tenantSlug: string | null;
  actorId: number | null;
  actorUsername: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  outcome: "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
  beforeSummary: string | null;
  afterSummary: string | null;
  errorCode: number | null;
  errorType: string | null;
  createdAt: string;
  completedAt: string | null;
};

type Filters = { q: string; tenantId: string; action: string; outcome: string; from: string; to: string };
type AppliedFilters = Omit<Filters, "from" | "to"> & { from?: string; to?: string };
const PAGE_SIZE = 50;

const ACTIONS = [
  "TENANT_STATUS_CHANGED", "TENANT_TRIAL_EXTENDED", "OWNER_RESET_ISSUED", "OWNER_REINVITED",
  "OWNER_BOOTSTRAP_ISSUED", "TRIAL_TENANT_DELETED", "ODOO_PROVISION_RETRIED", "ODOO_BINDING_CHANGED",
];

function initialDate(daysAgo: number): string {
  const value = new Date();
  value.setDate(value.getDate() - daysAgo);
  value.setSeconds(0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function iso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  const date = new Date(/(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : `${date.toLocaleString(undefined, { timeZone: "UTC" })} UTC`;
}

function label(value: string): string {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function summary(value: string | null): string {
  if (!value) return "—";
  try { return JSON.stringify(JSON.parse(value)); } catch { return value; }
}

function outcomeClass(outcome: AuditEvent["outcome"]): string {
  if (outcome === "SUCCEEDED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (outcome === "FAILED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function relatedFailureHref(correlationId: string | null): string | null {
  return correlationId ? `/platform/failures?q=${encodeURIComponent(correlationId)}` : null;
}

export default function PlatformAuditPage() {
  const { user, ready } = useAuth();
  const [filters, setFilters] = useState<Filters>({ q: "", tenantId: "", action: "", outcome: "", from: initialDate(7), to: initialDate(0) });
  const [applied, setApplied] = useState<AppliedFilters>({ q: "", tenantId: "", action: "", outcome: "", from: iso(initialDate(7)), to: iso(initialDate(0)) });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AuditEvent> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async (refresh = false) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    if (refresh) setRefreshing(true);
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<Page<AuditEvent>>("/api/admin/audit/events", {
        q: applied.q || undefined,
        tenantId: applied.tenantId || undefined,
        action: applied.action || undefined,
        outcome: applied.outcome || undefined,
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
          : "Could not load platform audit events.");
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
    setApplied({
      q: filters.q.trim(), tenantId: filters.tenantId.trim(), action: filters.action,
      outcome: filters.outcome, from: iso(filters.from), to: iso(filters.to),
    });
  }

  function clearFilters() {
    const empty: Filters = { q: "", tenantId: "", action: "", outcome: "", from: "", to: "" };
    setFilters(empty);
    setApplied({ q: "", tenantId: "", action: "", outcome: "" });
    setError(null);
    setPage(1);
  }

  const hasFilters = Boolean(applied.q || applied.tenantId || applied.action || applied.outcome || applied.from || applied.to);
  const invalidDateRange = Boolean(filters.from && filters.to && new Date(filters.from).getTime() > new Date(filters.to).getTime());

  return (
    <AdminPageLayout
      title="Platform audit"
      subtitle="Search platform administrator actions across stores. Business transactions remain in Orithos."
      count={data?.total ?? 0}
      countLabel="Events"
      fullBleed
      search={(
        <form onSubmit={applyFilters} className="grid gap-3 md:grid-cols-[minmax(15rem,1.5fr)_minmax(8rem,.6fr)_repeat(2,minmax(10rem,.8fr))] md:items-end">
          <AdminSearchInput label="Search actor, store, event or request ID" value={filters.q} onChange={(q) => setFilters((current) => ({ ...current, q }))} placeholder="Name, username, UUID…" />
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">Store ID<input inputMode="numeric" pattern="[0-9]*" value={filters.tenantId} onChange={(event) => setFilters((current) => ({ ...current, tenantId: event.target.value.replace(/\D/g, "") }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-sm outline-none focus:border-[var(--oh-primary)]" placeholder="All stores" /></label>
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">Action<select value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-sm"><option value="">All actions</option>{ACTIONS.map((action) => <option key={action} value={action}>{label(action)}</option>)}</select></label>
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">Result<select value={filters.outcome} onChange={(event) => setFilters((current) => ({ ...current, outcome: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2.5 text-sm"><option value="">All results</option><option value="IN_PROGRESS">In progress</option><option value="SUCCEEDED">Succeeded</option><option value="FAILED">Failed</option></select></label>
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">From<input type="datetime-local" value={filters.from} aria-invalid={invalidDateRange} aria-describedby={invalidDateRange ? "audit-date-range-error" : undefined} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm" /></label>
          <label className="block text-[13px] font-medium text-[var(--oh-text-secondary)]">To<input type="datetime-local" value={filters.to} aria-invalid={invalidDateRange} aria-describedby={invalidDateRange ? "audit-date-range-error" : undefined} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1 min-h-11 w-full rounded-md border border-[var(--oh-border)] bg-white px-2 text-sm" /></label>
          <div className="flex flex-wrap gap-2 md:col-span-2"><button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><Search size={16} aria-hidden="true" />Search</button><button type="button" onClick={clearFilters} disabled={!hasFilters} aria-label="Clear audit filters" title="Clear filters" className="grid size-11 place-items-center rounded-md border border-[var(--oh-border)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-40"><X size={16} aria-hidden="true" /></button></div>
        </form>
      )}
      actions={<AdminSecondaryButton onClick={() => void load(true)} disabled={loading}><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />Refresh</AdminSecondaryButton>}
    >
      {error ? <div id={invalidDateRange ? "audit-date-range-error" : undefined} role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><span className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</span><button type="button" onClick={() => void load(true)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:opacity-50"><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />Retry</button></div> : null}
      {loading && !data ? <div role="status" className="grid place-items-center border-y border-[var(--oh-border)] py-16 text-[var(--oh-muted)]"><LoaderCircle size={20} className="animate-spin" /></div> : data?.items.length === 0 ? <div role="status" className="border-y border-[var(--oh-border)] py-12 text-center text-sm text-[var(--oh-muted)]">{hasFilters ? "No audit events match these filters." : "No platform actions recorded."}</div> : data ? (
        <>
          <div className="hidden overflow-x-auto border-y border-[var(--oh-border)] bg-white md:block"><table className="w-full min-w-[920px] border-collapse text-sm"><thead className="bg-[var(--oh-surface)] text-left text-xs text-[var(--oh-text-secondary)]"><tr>{["Time", "Store", "Action / target", "Actor", "Result", "Request ID", "Details"].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{data.items.map((event) => <tr key={event.eventId} className="align-top"><td className="whitespace-nowrap px-3 py-3 text-xs text-[var(--oh-text-secondary)]">{formatDate(event.createdAt)}</td><td className="px-3 py-3">{event.tenantId ? <Link href={`/platform/stores/${event.tenantId}`} className="font-medium text-[var(--oh-primary)] hover:underline">{event.tenantName || event.tenantSlug || `Store ${event.tenantId}`}</Link> : <span className="text-[var(--oh-muted)]">Platform</span>}<div className="text-xs text-[var(--oh-muted)]">{event.tenantSlug || ""}</div></td><td className="px-3 py-3"><div className="font-medium">{label(event.action)}</div><div className="mt-0.5 text-xs text-[var(--oh-muted)]">{event.targetType}{event.targetId ? ` #${event.targetId}` : ""}</div></td><td className="px-3 py-3 text-sm">{event.actorUsername || `User ${event.actorId ?? "unknown"}`}</td><td className="px-3 py-3"><span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${outcomeClass(event.outcome)}`}>{label(event.outcome)}</span>{event.errorCode ? <div className="mt-1 text-xs text-rose-700">Code {event.errorCode}</div> : null}</td><td className="max-w-48 break-all px-3 py-3 font-mono text-[11px] text-[var(--oh-text-secondary)]">{event.correlationId ? <Link href={relatedFailureHref(event.correlationId) as string} className="text-[var(--oh-primary)] hover:underline" aria-label="View failures for this request ID">{event.correlationId}</Link> : "—"}</td><td className="min-w-48 px-3 py-3"><details><summary className="cursor-pointer text-xs font-semibold text-[var(--oh-primary)]">View</summary><dl className="mt-2 space-y-2 text-xs"><div><dt className="font-semibold">Reason</dt><dd className="break-words text-[var(--oh-text-secondary)]">{event.reason || "—"}</dd></div><div><dt className="font-semibold">Before</dt><dd className="break-all text-[var(--oh-text-secondary)]">{summary(event.beforeSummary)}</dd></div><div><dt className="font-semibold">After</dt><dd className="break-all text-[var(--oh-text-secondary)]">{summary(event.afterSummary)}</dd></div>{event.errorType ? <div><dt className="font-semibold">Error</dt><dd className="break-words text-rose-700">{event.errorType}</dd></div> : null}</dl></details></td></tr>)}</tbody></table></div>
          <div className="space-y-2 md:hidden">{data.items.map((event) => <article key={event.eventId} className="border-b border-[var(--oh-border)] bg-white py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold">{label(event.action)}</p><p className="mt-0.5 text-xs text-[var(--oh-muted)]">{formatDate(event.createdAt)}</p></div><span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${outcomeClass(event.outcome)}`}>{label(event.outcome)}</span></div><dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs"><div><dt className="text-[var(--oh-muted)]">Store</dt><dd className="mt-0.5 break-words">{event.tenantId ? <Link href={`/platform/stores/${event.tenantId}`} className="font-medium text-[var(--oh-primary)]">{event.tenantName || event.tenantSlug || `Store ${event.tenantId}`}</Link> : "Platform"}</dd></div><div><dt className="text-[var(--oh-muted)]">Actor</dt><dd className="mt-0.5 break-words">{event.actorUsername || `User ${event.actorId ?? "unknown"}`}</dd></div><div className="col-span-2"><dt className="text-[var(--oh-muted)]">Request ID</dt><dd className="mt-0.5 break-all font-mono">{event.correlationId ? <Link href={relatedFailureHref(event.correlationId) as string} className="text-[var(--oh-primary)] hover:underline" aria-label="View failures for this request ID">{event.correlationId}</Link> : "—"}</dd></div></dl><details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-[var(--oh-primary)]">View operation details</summary><dl className="mt-2 space-y-2 text-xs"><div><dt className="font-semibold">Reason</dt><dd className="break-words text-[var(--oh-text-secondary)]">{event.reason || "—"}</dd></div><div><dt className="font-semibold">Before</dt><dd className="break-all text-[var(--oh-text-secondary)]">{summary(event.beforeSummary)}</dd></div><div><dt className="font-semibold">After</dt><dd className="break-all text-[var(--oh-text-secondary)]">{summary(event.afterSummary)}</dd></div>{event.errorType ? <div><dt className="font-semibold">Error</dt><dd className="break-words text-rose-700">{event.errorType}</dd></div> : null}</dl></details></article>)}</div>
          <Pagination page={page} size={PAGE_SIZE} total={data.total} onPage={setPage} />
        </>
      ) : null}
    </AdminPageLayout>
  );
}
