"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function IntegrationsSettingsPage() {
  const { hasPermission, ready } = useAuth();
  const canImport = ready && hasPermission("settings.integrations");
  const [status, setStatus] = useState<{ job_id?: number; status?: string; phase?: string; started_at?: string; finished_at?: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canImport) return;
    void api.get<typeof status>("/api/settings/import/promote")
      .then(setStatus)
      .catch(() => undefined);
  }, [canImport]);

  useEffect(() => {
    if (!canImport || (status?.status !== "queued" && status?.status !== "running")) return;
    const timer = setInterval(() => {
      void api.get<typeof status>("/api/settings/import/promote")
        .then(setStatus)
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [canImport, status?.status]);

  async function promote() {
    if (!canImport) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post<{ job_id?: number; status?: string; phase?: string; store?: string }>("/api/settings/import/promote", { storeKey: "skr" });
      setResult(JSON.stringify(data, null, 2));
      setStatus({ job_id: data.job_id, status: data.status, phase: data.phase, started_at: new Date().toISOString() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import promote failed");
    } finally {
      setBusy(false);
    }
  }

  async function dedupe() {
    if (!canImport) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post<Record<string, unknown>>("/api/settings/import/dedupe", {});
      setResult(JSON.stringify(data, null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Catalogue dedupe failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageLayout title="Integrations" subtitle="Store data import and connection tools">
      <section className="mb-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 text-sm text-[var(--oh-text-secondary)]">
        Scheduled import updates tax rates and payment methods and adds missing register names. Company and other local settings stay in Orithos.
      </section>
      <div className="grid max-w-xl gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-5">
        <p className="text-sm text-[var(--oh-muted)]">
          Latest settings sync: {status ? `#${status.job_id ?? "—"} · ${status.status ?? "unknown"}${status.phase ? ` · ${status.phase}` : ""}` : "No sync recorded"}
        </p>
        {canImport ? (
          <>
            <button type="button" disabled={busy} onClick={() => void promote()} className="rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Working…" : "Import settings"}
            </button>
            <button type="button" disabled={busy} onClick={() => void dedupe()} className="rounded-lg border border-[var(--oh-border)] px-4 py-2 text-sm font-semibold disabled:opacity-50">
              Deduplicate tax rates &amp; payment methods
            </button>
          </>
        ) : (
          <p className="text-sm text-[var(--oh-muted)]">Integrations permission required to promote settings.</p>
        )}
        <Link href="/settings/account?tab=connection" className="text-sm font-semibold text-[var(--oh-primary)] underline">
          View connection status
        </Link>
      </div>
      {error && <pre className="mt-4 overflow-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">{error}</pre>}
      {result && <pre className="mt-4 overflow-auto rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3 text-xs">{result}</pre>}
    </AdminPageLayout>
  );
}
