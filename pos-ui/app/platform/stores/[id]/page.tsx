"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AdminPageLayout,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

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

type ConfirmAction =
  | { kind: "status"; status: string; title: string; message: string }
  | { kind: "trial"; days: number; title: string; message: string }
  | { kind: "reset"; title: string; message: string }
  | { kind: "reinvite"; title: string; message: string }
  | { kind: "delete"; title: string; message: string }
  | { kind: "odoo"; title: string; message: string };

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

  const load = useCallback(async () => {
    if (!Number.isSafeInteger(id) || id < 1) {
      setError("Invalid store id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<StoreDetail>(`/api/admin/tenants/${id}`);
      setStore(data);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to load store");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (ready && user) void load();
  }, [ready, user, load]);

  async function runConfirm() {
    if (!confirm || !store || busy) return;
    setBusy(true);
    setError(null);
    setLinkResult(null);
    try {
      if (confirm.kind === "status") {
        setStore(await api.patch<StoreDetail>(`/api/admin/tenants/${store.id}/status`, { status: confirm.status }));
      } else if (confirm.kind === "trial") {
        setStore(await api.patch<StoreDetail>(`/api/admin/tenants/${store.id}/trial`, { days: confirm.days }));
      } else if (confirm.kind === "reset") {
        const result = await api.post<{ resetUrl?: string; emailSent?: boolean }>(`/api/admin/tenants/${store.id}/owner/reset-password`);
        setLinkResult(result.resetUrl || "Reset issued.");
      } else if (confirm.kind === "reinvite") {
        const result = await api.post<{ inviteUrl?: string; resetUrl?: string }>(`/api/admin/tenants/${store.id}/owner/reinvite`);
        setLinkResult(result.inviteUrl || result.resetUrl || "Invite issued.");
      } else if (confirm.kind === "delete") {
        setStore(await api.del<StoreDetail>(`/api/admin/tenants/${store.id}`));
      } else if (confirm.kind === "odoo") {
        setStore(await api.post<StoreDetail>(`/api/admin/tenants/${store.id}/odoo-provision`));
      }
      setConfirm(null);
      if (confirm.kind === "status" || confirm.kind === "trial" || confirm.kind === "odoo") await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user) return null;

  return (
    <AdminPageLayout
      title={store?.name || "Store"}
      subtitle="Platform lifecycle, owner recovery, and Odoo binding"
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/platform/stores" className="inline-flex h-10 items-center rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]">
            All stores
          </Link>
          <AdminSecondaryButton onClick={() => void load()}>Refresh</AdminSecondaryButton>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-[var(--oh-muted)]">Loading store…</p>
      ) : error && !store ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>
      ) : store ? (
        <div className="mx-auto max-w-3xl space-y-5">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}
          {linkResult && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
              <p className="font-semibold">Copy this link</p>
              <p className="mt-1 break-all font-mono text-xs">{linkResult}</p>
            </div>
          )}

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
                <button type="button" className="min-h-10 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => setConfirm({ kind: "status", status: "suspended", title: "Suspend store?", message: "Store staff cannot use this subdomain until reactivated." })}>Suspend</button>
                <button type="button" className="min-h-10 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => setConfirm({ kind: "status", status: "active", title: "Activate store?", message: "Restores access for this store URL." })}>Activate</button>
                <button type="button" className="min-h-10 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => setConfirm({ kind: "status", status: "expired", title: "Mark expired?", message: "Marks the store as expired; login should be blocked." })}>Mark expired</button>
                <button type="button" className="min-h-10 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => setConfirm({ kind: "trial", days: 14, title: "Extend trial by 14 days?", message: "Extends trial by 14 days from now." })}>Extend trial 14d</button>
                {store.owner ? (
                  <>
                    <button type="button" className="min-h-10 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => setConfirm({ kind: "reset", title: "Reset owner password?", message: "Issues a reset link for the store origin host." })}>Reset owner password</button>
                    <button type="button" className="min-h-10 rounded-md border border-[var(--oh-border-strong)] px-3 text-sm font-semibold" onClick={() => setConfirm({ kind: "reinvite", title: "Re-invite owner?", message: "Re-issues invite or reset link without creating a second user." })}>Re-invite owner</button>
                  </>
                ) : null}
                <button type="button" className="min-h-10 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white" onClick={() => setConfirm({ kind: "odoo", title: "Retry Odoo provision?", message: "Creates or refreshes the Odoo company / POS config mapping for this store." })}>Retry Odoo provision</button>
                {store.status.toLowerCase() === "trial" ? (
                  <button type="button" className="min-h-10 rounded-md border border-rose-300 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={() => setConfirm({ kind: "delete", title: "Delete trial store?", message: "This permanently removes tenant access and owner accounts. Odoo sales and audit history are retained." })}>Delete trial store</button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ""}
        message={confirm?.message || ""}
        confirmLabel={confirm?.kind === "delete" ? "Delete trial store" : "Confirm"}
        busy={busy}
        variant={(confirm?.kind === "status" && confirm.status === "suspended") || confirm?.kind === "delete" ? "danger" : "default"}
        onCancel={() => !busy && setConfirm(null)}
        onConfirm={() => void runConfirm()}
      />
    </AdminPageLayout>
  );
}
