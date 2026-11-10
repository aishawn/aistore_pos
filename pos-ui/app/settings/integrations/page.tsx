"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StoreSettingsPage as AdminPageLayout } from "@/components/admin/StoreSettingsPage";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function IntegrationsSettingsPage() {
  const { hasPermission, ready } = useAuth();
  const canImport = ready && hasPermission("settings.integrations");
  const [storeKey, setStoreKey] = useState("skr");
  const [status, setStatus] = useState<{ last_store_key?: string; last_at?: string }>({});
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.get<{ last_store_key?: string; last_at?: string }>("/api/settings/import/status")
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  async function promote() {
    if (!canImport) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.post<Record<string, unknown>>("/api/settings/import/promote", { storeKey });
      setResult(JSON.stringify(data, null, 2));
      setStatus({
        last_store_key: String(data.store_key ?? storeKey),
        last_at: new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import promote failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageLayout title="Integrations" subtitle="Shopfront import and connection tools">
      <section className="mb-4 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3 text-sm text-[var(--oh-text-secondary)]">
        Orithos owns settings after import. Re-import only fills empty / unowned values — it never overwrites values you saved in Orithos.
      </section>
      <div className="grid max-w-xl gap-3 rounded-xl border border-[var(--oh-border)] bg-white p-5">
        <p className="text-sm text-[var(--oh-muted)]">
          Last promote: {status.last_store_key || "—"} {status.last_at ? `at ${status.last_at}` : ""}
        </p>
        <label className="grid gap-1 text-sm font-medium">Store key
          <input className="h-10 rounded-lg border px-3" value={storeKey} onChange={(e) => setStoreKey(e.target.value)} disabled={!canImport || busy} />
        </label>
        {canImport ? (
          <button type="button" disabled={busy} onClick={() => void promote()} className="rounded-lg bg-[var(--oh-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Importing…" : "Re-import settings from staged Shopfront data"}
          </button>
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
