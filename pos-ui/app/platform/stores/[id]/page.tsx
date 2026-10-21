"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, Copy, LoaderCircle, RefreshCw } from "lucide-react";
import {
  AdminPageLayout,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { api, ApiError, fetchPlatformStoreAiKpi, type PlatformStoreAiKpi } from "@/lib/api";

interface StoreDetail {
  id: number;
  name: string;
  subdomain: string;
  status: string;
  contactName?: string | null;
  storeUrl?: string | null;
  trialEndsAt?: string | null;
  createdAt?: string | null;
  platformOperator?: boolean;
  outletId?: number | null;
  odooCompanyId?: number | null;
  odooProvisionStatus?: string | null;
  owner?: {
    id: number;
    username: string;
    name?: string | null;
    email?: string | null;
    isAdmin?: boolean;
  } | null;
  odooBinding?: {
    odooCompanyId?: number | null;
    odooPosConfigId?: number | null;
    odooProvisionStatus?: string | null;
    odooProvisionError?: string | null;
    r2Prefix?: string | null;
  } | null;
}

interface PlatformAuditEvent {
  id: number;
  eventId: string;
  tenantId: number;
  actorId: number | null;
  actorUsername: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  outcome: "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | string;
  beforeSummary: string | null;
  afterSummary: string | null;
  errorCode: number | null;
  errorType: string | null;
  correlationId: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface ProvisionStep {
  stepId: string;
  stepName: string;
  outcome: "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | string;
  resourceRef: string | null;
  errorType: string | null;
  errorSummary: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface ProvisionAttempt {
  attemptId: string;
  tenantId: number;
  tenantName: string | null;
  tenantSlug: string | null;
  triggerType: string;
  actorId: number | null;
  actorUsername: string | null;
  correlationId: string | null;
  outcome: "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | string;
  currentStep: string | null;
  errorType: string | null;
  errorSummary: string | null;
  startedAt: string;
  completedAt: string | null;
  steps: ProvisionStep[];
}

type ConfirmAction = { title: string; message: string; reason: string } & (
  | { kind: "status"; status: string }
  | { kind: "trial"; days: number }
  | { kind: "reset" }
  | { kind: "reinvite" }
  | { kind: "delete" }
  | { kind: "odoo" }
);
type ConfirmRequest = ConfirmAction extends infer Action
  ? Action extends ConfirmAction
    ? Omit<Action, "reason">
    : never
  : never;

const ACTION_LABELS: Record<string, string> = {
  TENANT_STATUS_CHANGED: "Store status changed",
  TENANT_TRIAL_EXTENDED: "Trial extended",
  TRIAL_TENANT_DELETED: "Trial store deleted",
  OWNER_RESET_ISSUED: "Owner reset issued",
  OWNER_REINVITED: "Owner re-invited",
  OWNER_BOOTSTRAP_ISSUED: "Owner sign-in link issued",
  ODOO_PROVISION_RETRIED: "Odoo provisioning retried",
  ODOO_BINDING_CHANGED: "Odoo binding changed",
};

function utcDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
  const milliseconds = date.getTime();
  return Number.isNaN(milliseconds) ? null : milliseconds;
}

function formatAuditSummary(value: string | null): string {
  if (!value) return "—";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).map(([key, item]) => `${key}: ${String(item ?? "—")}`).join(" · ");
  } catch {
    return "Recorded";
  }
}

function statusTone(status: string | null | undefined): string {
  const value = (status || "").toLowerCase();
  if (value === "active") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (value === "trial") return "bg-sky-50 text-sky-800 border-sky-200";
  if (value === "suspended" || value === "expired") return "bg-red-50 text-red-800 border-red-200";
  if (value === "deleted") return "bg-slate-100 text-slate-600 border-slate-300";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PlatformStoreDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { user, ready } = useAuth();
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [linkResult, setLinkResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [aiKpi, setAiKpi] = useState<PlatformStoreAiKpi | null>(null);
  const [audit, setAudit] = useState<PlatformAuditEvent[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [provisionAttempts, setProvisionAttempts] = useState<ProvisionAttempt[]>([]);
  const [provisionTotal, setProvisionTotal] = useState(0);
  const [provisionPage, setProvisionPage] = useState(1);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionLoading, setProvisionLoading] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!Number.isSafeInteger(id) || id < 1) {
      setError("Invalid store id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<StoreDetail>(`/api/admin/tenants/${id}`);
      if (sequence === requestSequence.current) setStore(data);
      try {
        const kpi = await fetchPlatformStoreAiKpi(id, 24);
        if (sequence === requestSequence.current) setAiKpi(kpi);
      } catch {
        if (sequence === requestSequence.current) setAiKpi(null);
      }
      setAuditLoading(true);
      try {
        const result = await api.get<{ items: PlatformAuditEvent[]; total: number }>(
          `/api/admin/tenants/${id}/audit`, { page: auditPage, size: 20 },
        );
        if (sequence === requestSequence.current) {
          setAudit(result.items);
          setAuditTotal(result.total);
          setAuditError(null);
        }
      } catch (cause) {
        if (sequence === requestSequence.current) {
          setAuditError(cause instanceof ApiError
            ? `${cause.message}${cause.correlationId ? ` · Request ID ${cause.correlationId}` : ""}`
            : "Could not load operation history.");
        }
      } finally {
        if (sequence === requestSequence.current) setAuditLoading(false);
      }
      setProvisionLoading(true);
      try {
        const result = await api.get<{ items: ProvisionAttempt[]; total: number }>(
          `/api/admin/tenants/${id}/provision-attempts`, { page: provisionPage, size: 10 },
        );
        if (sequence === requestSequence.current) {
          setProvisionAttempts(result.items);
          setProvisionTotal(result.total);
          setProvisionError(null);
        }
      } catch (cause) {
        if (sequence === requestSequence.current) {
          setProvisionError(cause instanceof ApiError
            ? `${cause.message}${cause.correlationId ? ` · Request ID ${cause.correlationId}` : ""}`
            : "Could not load provisioning attempts.");
        }
      } finally {
        if (sequence === requestSequence.current) setProvisionLoading(false);
      }
    } catch (cause) {
      if (sequence === requestSequence.current) {
        setError(cause instanceof ApiError ? cause.message : "Failed to load store");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [id, auditPage, provisionPage]);

  useEffect(() => {
    if (ready && user) void load();
  }, [ready, user, load]);

  async function runConfirm() {
    if (!confirm || !store || busy) return;
    setBusy(true);
    setError(null);
    setLinkResult(null);
    setCopied(false);
    try {
      if (confirm.kind === "status") {
        setStore(await api.patch<StoreDetail>(`/api/admin/tenants/${store.id}/status`, { status: confirm.status, reason: confirm.reason }));
      } else if (confirm.kind === "trial") {
        setStore(await api.patch<StoreDetail>(`/api/admin/tenants/${store.id}/trial`, { days: confirm.days, reason: confirm.reason }));
      } else if (confirm.kind === "reset") {
        const result = await api.post<{ resetUrl?: string; emailSent?: boolean }>(`/api/admin/tenants/${store.id}/owner/reset-password`, { reason: confirm.reason });
        setLinkResult(result.resetUrl || "Reset issued.");
      } else if (confirm.kind === "reinvite") {
        const result = await api.post<{ inviteUrl?: string; resetUrl?: string }>(`/api/admin/tenants/${store.id}/owner/reinvite`, { reason: confirm.reason });
        setLinkResult(result.inviteUrl || result.resetUrl || "Invite issued.");
      } else if (confirm.kind === "delete") {
        setStore(await api.del<StoreDetail>(`/api/admin/tenants/${store.id}`, { reason: confirm.reason }));
      } else if (confirm.kind === "odoo") {
        setStore(await api.post<StoreDetail>(`/api/admin/tenants/${store.id}/odoo-provision`, { reason: confirm.reason }));
      }
      setConfirm(null);
      const resetHistoryPages = auditPage !== 1 || provisionPage !== 1;
      if (auditPage !== 1) setAuditPage(1);
      if (provisionPage !== 1) setProvisionPage(1);
      if (!resetHistoryPages) await load();
    } catch (cause) {
      setError(cause instanceof ApiError
        ? `${cause.message}${cause.correlationId ? ` · Request ID ${cause.correlationId}` : ""}`
        : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function askConfirm(action: ConfirmRequest) {
    setConfirm({ ...action, reason: "" });
  }

  async function copyLink() {
    if (!linkResult || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(linkResult);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the link. Select and copy it manually.");
    }
  }

  if (!ready || !user) return null;

  const status = (store?.status || "").toLowerCase();

  return (
    <AdminPageLayout
      title={store?.name || "Store"}
      subtitle="Platform lifecycle, owner recovery, and Odoo binding"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/platform/stores" className="inline-flex min-h-11 items-center rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]">
            All stores
          </Link>
          <AdminSecondaryButton onClick={() => void load()} disabled={loading}>
            {loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            {loading ? "Refreshing…" : "Refresh"}
          </AdminSecondaryButton>
        </div>
      }
    >
      {loading ? (
        <div role="status" aria-label="Loading store" className="space-y-4">
          <div className="h-24 animate-pulse rounded-xl border border-[var(--oh-border)] bg-white" />
          <div className="h-40 animate-pulse rounded-xl border border-[var(--oh-border)] bg-white" />
          <div className="h-32 animate-pulse rounded-xl border border-[var(--oh-border)] bg-white" />
        </div>
      ) : error && !store ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold text-rose-900 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-800">
            Try again
          </button>
        </div>
      ) : store ? (
        <div className="mx-auto max-w-3xl space-y-5">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}
          {linkResult && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">Owner link issued</p>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-sky-300 bg-white px-3 font-semibold text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={copied ? "Owner link copied" : "Copy owner link"}
                >
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
              <p className="mt-1 break-all font-mono text-xs">{linkResult}</p>
            </div>
          )}

          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--oh-muted)]">AI usage (24h)</h2>
              <Link href="/platform/usage" className="text-xs font-semibold text-[var(--oh-primary)] hover:underline">
                All stores
              </Link>
            </div>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-[var(--oh-muted)]">Requests</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-[var(--oh-text)]">
                  {aiKpi ? aiKpi.requests.toLocaleString() : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--oh-muted)]">Allow rate</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-[var(--oh-text)]">
                  {aiKpi ? `${aiKpi.allowedRate.toFixed(1)}%` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--oh-muted)]">P95 latency</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-[var(--oh-text)]">
                  {aiKpi?.p95LatencyMs != null ? `${aiKpi.p95LatencyMs} ms` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--oh-muted)]">Last seen</dt>
                <dd className="mt-0.5 text-[var(--oh-text)]">{formatDate(aiKpi?.lastSeenAt)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-[var(--oh-muted)]">
              Aggregates from AI audit events. Chat transcripts are not available on the control plane.
            </p>
          </section>

          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Identity</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-[var(--oh-muted)]">Name</dt><dd className="mt-0.5 font-medium text-[var(--oh-text)]">{store.name}</dd></div>
              <div><dt className="text-[var(--oh-muted)]">Subdomain</dt><dd className="mt-0.5 font-mono text-[var(--oh-text)]">{store.subdomain}</dd></div>
              <div><dt className="text-[var(--oh-muted)]">Status</dt><dd className="mt-0.5"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusTone(store.status)}`}>{store.status}</span></dd></div>
              <div><dt className="text-[var(--oh-muted)]">Trial ends</dt><dd className="mt-0.5 text-[var(--oh-text)]">{formatDate(store.trialEndsAt)}</dd></div>
              <div><dt className="text-[var(--oh-muted)]">Created</dt><dd className="mt-0.5 text-[var(--oh-text)]">{formatDate(store.createdAt)}</dd></div>
              <div><dt className="text-[var(--oh-muted)]">Store URL</dt><dd className="mt-0.5">{store.storeUrl ? <a href={`${store.storeUrl.replace(/\/$/, "")}/login`} target="_blank" rel="noreferrer" className="font-semibold text-[var(--oh-primary)] hover:underline">{store.storeUrl}</a> : "—"}</dd></div>
            </dl>
          </section>

          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Owner</h2>
            {store.owner ? (
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-[var(--oh-muted)]">Username</dt><dd className="mt-0.5 text-[var(--oh-text)]">{store.owner.username}</dd></div>
                <div><dt className="text-[var(--oh-muted)]">Name</dt><dd className="mt-0.5 text-[var(--oh-text)]">{store.owner.name || "—"}</dd></div>
                <div><dt className="text-[var(--oh-muted)]">Email</dt><dd className="mt-0.5 text-[var(--oh-text)]">{store.owner.email || "—"}</dd></div>
                <div><dt className="text-[var(--oh-muted)]">Admin</dt><dd className="mt-0.5 text-[var(--oh-text)]">{store.owner.isAdmin ? "Yes" : "No"}</dd></div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-[var(--oh-muted)]">No owner user is linked to this store.</p>
            )}
          </section>

          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Outlet & Odoo</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-[var(--oh-muted)]">Outlet id</dt><dd className="mt-0.5 text-[var(--oh-text)]">{store.outletId ?? "—"}</dd></div>
              <div><dt className="text-[var(--oh-muted)]">Odoo company</dt><dd className="mt-0.5 text-[var(--oh-text)]">{store.odooBinding?.odooCompanyId ?? store.odooCompanyId ?? "—"}</dd></div>
              <div><dt className="text-[var(--oh-muted)]">POS config</dt><dd className="mt-0.5 text-[var(--oh-text)]">{store.odooBinding?.odooPosConfigId ?? "—"}</dd></div>
              <div><dt className="text-[var(--oh-muted)]">Provision</dt><dd className="mt-0.5 capitalize text-[var(--oh-text)]">{store.odooBinding?.odooProvisionStatus || store.odooProvisionStatus || "unmapped"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-[var(--oh-muted)]">R2 prefix</dt><dd className="mt-0.5 font-mono text-xs text-[var(--oh-text)]">{store.odooBinding?.r2Prefix || "—"}</dd></div>
              {store.odooBinding?.odooProvisionError ? (
                <div className="sm:col-span-2"><dt className="text-[var(--oh-muted)]">Provision error</dt><dd className="mt-0.5 text-sm text-rose-800">{store.odooBinding.odooProvisionError}</dd></div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--oh-muted)]">Actions</h2>
            {store.platformOperator ? (
              <p className="mt-3 text-sm text-[var(--oh-muted)]">Lifecycle changes are blocked on the platform operator store.</p>
            ) : store.status.toLowerCase() === "deleted" ? (
              <p className="mt-3 text-sm text-[var(--oh-muted)]">Tenant access is deleted. Odoo sales and audit history are retained.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {(status === "active" || status === "trial") && <button type="button" className="min-h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => askConfirm({ kind: "status", status: "suspended", title: "Suspend store?", message: "Store staff cannot use this subdomain until reactivated." })}>Suspend</button>}
                {(status === "suspended" || status === "expired" || status === "trial") && <button type="button" className="min-h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => askConfirm({ kind: "status", status: "active", title: "Activate store?", message: "Restores access for this store URL." })}>Activate</button>}
                {(status === "active" || status === "trial") && <button type="button" className="min-h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => askConfirm({ kind: "status", status: "expired", title: "Mark expired?", message: "Marks the store as expired; login should be blocked." })}>Mark expired</button>}
                <button type="button" className="min-h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => askConfirm({ kind: "trial", days: 14, title: "Extend trial by 14 days?", message: "Extends trial by 14 days from now." })}>Extend trial 14d</button>
                {store.owner ? (
                  <>
                    <button type="button" className="min-h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => askConfirm({ kind: "reset", title: "Reset owner password?", message: "Issues a reset link for the store origin host." })}>Reset owner password</button>
                    <button type="button" className="min-h-11 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => askConfirm({ kind: "reinvite", title: "Re-invite owner?", message: "Re-issues invite or reset link without creating a second user." })}>Re-invite owner</button>
                  </>
                ) : null}
                <button type="button" className="min-h-11 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white" onClick={() => askConfirm({ kind: "odoo", title: "Retry Odoo provision?", message: "Creates or refreshes the Odoo company / POS config mapping for this store." })}>Retry Odoo provision</button>
                {store.status.toLowerCase() === "trial" ? (
                  <button type="button" className="min-h-11 rounded-md border border-rose-300 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={() => askConfirm({ kind: "delete", title: "Delete trial store?", message: "This permanently removes tenant access and owner accounts. Odoo sales and audit history are retained." })}>Delete trial store</button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {store ? <section className="mx-auto mb-6 max-w-3xl rounded-lg border border-[var(--oh-border)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold text-[var(--oh-text)]">Operation history</h2><p className="mt-1 text-xs text-[var(--oh-muted)]">Platform actions for this store, newest first · timestamps in UTC</p></div>
          <button type="button" onClick={() => void load()} disabled={auditLoading} aria-label="Refresh operation history" title="Refresh operation history" className="grid size-11 place-items-center rounded-md border border-[var(--oh-border)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><RefreshCw size={16} className={auditLoading ? "animate-spin" : ""} aria-hidden="true" /></button>
        </div>
        {auditError ? <p role="alert" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{auditError}</p> : null}
        {auditLoading && audit.length === 0 ? <p role="status" className="py-8 text-center text-sm text-[var(--oh-muted)]">Loading operation history…</p> : audit.length === 0 ? <p className="py-8 text-center text-sm text-[var(--oh-muted)]">{auditError ? "Operation history is unavailable." : "No platform actions recorded for this store."}</p> : <ol className="mt-4 divide-y divide-[var(--oh-border)]">
          {audit.map((event) => <li key={event.eventId} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-[var(--oh-text)]">{ACTION_LABELS[event.action] || event.action}</h3><span className={`rounded border px-2 py-0.5 text-xs font-medium ${event.outcome === "SUCCEEDED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : event.outcome === "FAILED" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{event.outcome}</span></div>
              <p className="mt-1 break-words text-sm text-[var(--oh-text-secondary)]">Reason: {event.reason}</p>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-[var(--oh-muted)] sm:grid-cols-2"><div><dt className="inline font-medium">Actor: </dt><dd className="inline">{event.actorUsername || `User ${event.actorId ?? "unknown"}`}</dd></div><div><dt className="inline font-medium">Target: </dt><dd className="inline">{event.targetType}{event.targetId ? ` #${event.targetId}` : ""}</dd></div><div><dt className="inline font-medium">Before: </dt><dd className="inline break-words">{formatAuditSummary(event.beforeSummary)}</dd></div><div><dt className="inline font-medium">After: </dt><dd className="inline break-words">{formatAuditSummary(event.afterSummary)}</dd></div>{event.errorType ? <div><dt className="inline font-medium">Error: </dt><dd className="inline">{event.errorType}{event.errorCode ? ` · ${event.errorCode}` : ""}</dd></div> : null}{event.correlationId ? <div className="sm:col-span-2"><dt className="inline font-medium">Request ID: </dt><dd className="inline break-all font-mono">{event.correlationId}</dd></div> : null}</dl>
            </div><time className="text-xs text-[var(--oh-muted)] sm:text-right" dateTime={`${event.createdAt}Z`}>{utcDate(event.createdAt)}</time>
          </li>)}
        </ol>}
        {auditTotal > 20 ? <div className="mt-3 flex items-center justify-between border-t border-[var(--oh-border)] pt-3 text-sm"><span className="text-xs text-[var(--oh-muted)]">{auditTotal} events</span><div className="flex gap-2"><button type="button" onClick={() => setAuditPage((page) => Math.max(1, page - 1))} disabled={auditPage <= 1 || auditLoading} className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 disabled:opacity-40">Previous</button><span className="flex min-h-10 items-center text-xs text-[var(--oh-muted)]">{auditPage} / {Math.ceil(auditTotal / 20)}</span><button type="button" onClick={() => setAuditPage((page) => page + 1)} disabled={auditPage >= Math.ceil(auditTotal / 20) || auditLoading} className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 disabled:opacity-40">Next</button></div></div> : null}
      </section> : null}
      {store ? <section className="mx-auto mb-6 max-w-3xl rounded-lg border border-[var(--oh-border)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-base font-semibold text-[var(--oh-text)]">Odoo setup attempts</h2><p className="mt-1 text-xs text-[var(--oh-muted)]">Each retry is retained with stage results and request identity.</p></div>
          <button type="button" onClick={() => void load()} disabled={provisionLoading} aria-label="Refresh Odoo setup attempts" title="Refresh setup attempts" className="grid size-11 place-items-center rounded-md border border-[var(--oh-border)] text-[var(--oh-text-secondary)] hover:bg-[var(--oh-surface)] disabled:opacity-50"><RefreshCw size={16} className={provisionLoading ? "animate-spin" : ""} aria-hidden="true" /></button>
        </div>
        {provisionError ? <p role="alert" className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{provisionError}</p> : null}
        {provisionLoading && provisionAttempts.length === 0 ? <p role="status" className="py-8 text-center text-sm text-[var(--oh-muted)]">Loading setup attempts…</p> : provisionAttempts.length === 0 ? <p className="py-8 text-center text-sm text-[var(--oh-muted)]">{provisionError ? "Setup attempt history is unavailable." : "No setup attempts recorded."}</p> : <ol className="mt-4 divide-y divide-[var(--oh-border)]">
          {provisionAttempts.map((attempt) => <li key={attempt.attemptId} className="py-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-[var(--oh-text)]">{attempt.triggerType === "SIGNUP" ? "Signup setup" : "Platform retry"}</h3><span className={`rounded border px-2 py-0.5 text-xs font-medium ${attempt.outcome === "SUCCEEDED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : attempt.outcome === "FAILED" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{attempt.outcome}</span></div><p className="mt-1 text-xs text-[var(--oh-muted)]">Started {utcDate(attempt.startedAt)}{attempt.actorUsername ? ` · ${attempt.actorUsername}` : " · System-triggered"}{attempt.currentStep ? ` · Current step: ${attempt.currentStep}` : ""}</p></div><code className="max-w-full break-all font-mono text-[11px] text-[var(--oh-muted)]">{attempt.attemptId}</code></div>
            {attempt.correlationId ? <p className="mt-2 break-all text-xs text-[var(--oh-text-secondary)]">Request ID: <code className="font-mono">{attempt.correlationId}</code></p> : null}
            {attempt.errorSummary ? <p role="alert" className="mt-2 break-words rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{attempt.errorType ? `${attempt.errorType}: ` : ""}{attempt.errorSummary}</p> : null}
            {attempt.steps.length ? <ol className="mt-3 border-l border-[var(--oh-border)] pl-3">{attempt.steps.map((step) => {
              const startedMs = timestampMs(step.startedAt);
              const completedMs = timestampMs(step.completedAt);
              const durationMs = startedMs != null && completedMs != null ? completedMs - startedMs : null;
              return <li key={step.stepId} className="relative pb-3 last:pb-0"><span className={`absolute -left-[17px] top-1 size-2 rounded-full ${step.outcome === "SUCCEEDED" ? "bg-emerald-500" : step.outcome === "FAILED" ? "bg-rose-500" : "bg-amber-500"}`} aria-hidden="true" /><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><span className="text-xs font-medium text-[var(--oh-text)]">{step.stepName.replaceAll("_", " ")}</span><span className="text-[11px] text-[var(--oh-muted)]">{step.outcome}{durationMs != null && durationMs >= 0 ? ` · ${durationMs} ms` : " · in progress"}</span></div>{step.resourceRef ? <p className="mt-0.5 break-all font-mono text-[10px] text-[var(--oh-muted)]">{step.resourceRef}</p> : null}{step.errorSummary ? <p className="mt-1 break-words text-xs text-rose-800">{step.errorType ? `${step.errorType}: ` : ""}{step.errorSummary}</p> : null}</li>;
            })}</ol> : <p className="mt-3 text-xs text-[var(--oh-muted)]">No stages recorded yet.</p>}
          </li>)}
        </ol>}
        {provisionTotal > 10 ? <div className="mt-3 flex items-center justify-between border-t border-[var(--oh-border)] pt-3 text-sm"><span className="text-xs text-[var(--oh-muted)]">{provisionTotal} attempts</span><div className="flex gap-2"><button type="button" onClick={() => setProvisionPage((page) => Math.max(1, page - 1))} disabled={provisionPage <= 1 || provisionLoading} className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 disabled:opacity-40">Previous</button><span className="flex min-h-10 items-center text-xs text-[var(--oh-muted)]">{provisionPage} / {Math.ceil(provisionTotal / 10)}</span><button type="button" onClick={() => setProvisionPage((page) => page + 1)} disabled={provisionPage >= Math.ceil(provisionTotal / 10) || provisionLoading} className="min-h-10 rounded-md border border-[var(--oh-border)] px-3 disabled:opacity-40">Next</button></div></div> : null}
      </section> : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ""}
        message={confirm?.message || ""}
        confirmLabel={confirm?.kind === "delete" ? "Delete trial store" : "Confirm"}
        busy={busy}
        reason={confirm?.reason || ""}
        reasonLabel="Reason for this operation"
        reasonRequired
        onReasonChange={(reason) => setConfirm((current) => current ? { ...current, reason } : null)}
        variant={(confirm?.kind === "status" && confirm.status === "suspended") || confirm?.kind === "delete" ? "danger" : "default"}
        onCancel={() => !busy && setConfirm(null)}
        onConfirm={() => void runConfirm()}
      />
    </AdminPageLayout>
  );
}
