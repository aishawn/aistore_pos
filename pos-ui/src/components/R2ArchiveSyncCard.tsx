"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Database, LoaderCircle, RefreshCw } from "lucide-react";
import { api, apiFailureMessage } from "@/lib/api";

type ArchiveFile = { name: string; sizeBytes: number; sha256: string };
type ArchiveStatus = {
  configured?: boolean;
  state?: "not_configured" | "waiting" | "syncing" | "success" | "error" | "status_unavailable" | string;
  reason?: string;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  nextRunAt?: string;
  nextAttemptAt?: string | null;
  timezone?: string;
  scheduleTime?: string;
  snapshotId?: string;
  lastErrorCode?: string | null;
  snapshot?: {
    syncedAt?: string;
    manifestSha256?: string;
    databaseIntegrity?: string;
    files?: ArchiveFile[];
  };
};

function formatDate(value?: string) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function stateLabel(status: ArchiveStatus | null) {
  if (!status?.configured || status.state === "not_configured") return "Setup required";
  if (status.state === "syncing") return "Syncing";
  if (status.state === "success") return "Up to date";
  if (status.state === "error" || status.state === "status_unavailable") return "Needs attention";
  return "Waiting for schedule";
}

export function R2ArchiveSyncCard() {
  const [status, setStatus] = useState<ArchiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<ArchiveStatus>("/api/r2-archive/status");
      setStatus(data);
    } catch (error) {
      setMessage(apiFailureMessage(error, "Could not read the R2 sync status.", "Sign in again to view integration status."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (status?.state !== "syncing") return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh, status?.state]);

  async function syncNow() {
    if (busy || !status?.configured) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/api/r2-archive/sync");
      setMessage("A private archive sync has been queued.");
      await refresh();
    } catch (error) {
      setMessage(apiFailureMessage(error, "Could not queue the archive sync.", "Sign in again to start a sync."));
    } finally {
      setBusy(false);
    }
  }

  const files = status?.snapshot?.files ?? [];
  const badgeClass = status?.state === "success"
    ? "bg-emerald-50 text-emerald-800"
    : status?.state === "error" || status?.state === "status_unavailable"
      ? "bg-red-50 text-red-800"
      : "bg-amber-50 text-amber-900";

  return (
    <section className="rounded-xl border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-[var(--oh-text)]">Shopfront archive mirror</h2>
            {!loading && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
                {status?.state === "success" ? <CheckCircle2 size={14} /> : status?.state === "error" ? <AlertCircle size={14} /> : <Database size={14} />}
                {stateLabel(status)}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--oh-muted)]">
            A private, read-only copy of the daily Shopfront archive. It is kept separate from Odoo products, stock and sales.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refresh()} disabled={loading || busy} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-60">
            {loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refresh
          </button>
          <button type="button" onClick={() => void syncNow()} disabled={busy || loading || !status?.configured || status.state === "syncing"} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50">
            {busy || status?.state === "syncing" ? <LoaderCircle size={15} className="animate-spin" /> : <Clock3 size={15} />} Sync now
          </button>
        </div>
      </div>

      {loading ? (
        <p className="mt-5 flex items-center gap-2 text-sm text-[var(--oh-muted)]"><LoaderCircle size={16} className="animate-spin" /> Loading sync status…</p>
      ) : (
        <div className="mt-5 grid gap-4">
          {!status?.configured && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              Add the R2 endpoint, bucket and rotated read-only credentials to Dokploy, then deploy. The sync worker stays idle until they are configured.
            </p>
          )}
          <dl className="grid gap-3 rounded-lg bg-[var(--oh-surface)] p-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-[var(--oh-muted)]">Last successful sync</dt><dd className="mt-1 text-sm font-semibold text-[var(--oh-text)]">{formatDate(status?.lastSuccessAt)}</dd></div>
            <div><dt className="text-xs text-[var(--oh-muted)]">Next scheduled run</dt><dd className="mt-1 text-sm font-semibold text-[var(--oh-text)]">{formatDate(status?.nextRunAt)}</dd></div>
            <div><dt className="text-xs text-[var(--oh-muted)]">Daily schedule</dt><dd className="mt-1 text-sm font-semibold text-[var(--oh-text)]">{status?.scheduleTime || "03:30"} · {status?.timezone || "Australia/Adelaide"}</dd></div>
            <div><dt className="text-xs text-[var(--oh-muted)]">SQLite integrity</dt><dd className="mt-1 text-sm font-semibold text-[var(--oh-text)]">{status?.snapshot?.databaseIntegrity || "Not checked"}</dd></div>
          </dl>
          {status?.lastErrorCode && <p role="status" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">Last sync failed: {status.lastErrorCode}. The previous verified snapshot is retained.{status.nextAttemptAt ? ` Automatic retry: ${formatDate(status.nextAttemptAt)}.` : " No automatic retry is scheduled; check the worker configuration."}</p>}
          {files.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-[var(--oh-border)]">
              <div className="border-b border-[var(--oh-border)] px-4 py-3 text-sm font-semibold text-[var(--oh-text)]">Verified snapshot files</div>
              <div className="divide-y divide-[var(--oh-border)]">
                {files.map((file) => (
                  <div key={`${file.name}-${file.sha256}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0"><p className="break-all text-sm font-medium text-[var(--oh-text)]">{file.name}</p><p className="mt-0.5 break-all font-mono text-[11px] text-[var(--oh-muted)]">SHA-256 {file.sha256}</p></div>
                    <span className="shrink-0 text-xs text-[var(--oh-muted)]">{formatSize(file.sizeBytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {status?.snapshot?.syncedAt && <p className="text-xs text-[var(--oh-muted)]">Snapshot created {formatDate(status.snapshot.syncedAt)} · {files.length} files · private archive only</p>}
        </div>
      )}
      {message && <p role="status" className="mt-4 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] px-3 py-2 text-sm text-[var(--oh-text-secondary)]">{message}</p>}
    </section>
  );
}
