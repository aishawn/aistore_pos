"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Download, FileUp, LoaderCircle, Trash2 } from "lucide-react";
import { SettingsScaffold } from "@/components/admin/SettingsScaffold";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type SampleDataStatus = {
  dummyDataRequested: boolean;
  sampleDataClearedAt: string | null;
  state: "never_seeded" | "active" | "cleared" | string;
  demoProductCount: number;
  demoCustomerCount: number;
  demoOrderCount: number;
  nonDemoPaidOrderCount: number;
  canPurge: boolean;
  archiveOnly: boolean;
  confirmPhrase: string;
};

type PurgeResult = {
  state: string;
  archiveOnly: boolean;
  productsArchived: number;
  customersArchived: number;
  sessionsClosed: number;
  demoOrderCount: number;
  sampleDataClearedAt: string | null;
  message?: string;
  idempotent?: boolean;
};

function stateLabel(state: string) {
  if (state === "active") return "Sample data is active";
  if (state === "cleared") return "Sample data removed";
  if (state === "unavailable") return "Sample data is unavailable until Odoo is ready";
  return "No sample data";
}

export default function SettingsDataPage() {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const [status, setStatus] = useState<SampleDataStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [purging, setPurging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<SampleDataStatus>("/api/tenant/sample-data/status");
      setStatus(data);
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof ApiError ? cause.message : "Could not load sample data status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function purge() {
    if (!status?.canPurge || !isAdmin) return;
    setPurging(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<PurgeResult>("/api/tenant/sample-data/purge", {
        confirmation: confirm,
      });
      setConfirm("");
      setNotice(result.message
        || `Archived ${result.productsArchived} DEMO products and ${result.customersArchived} DEMO customers.`);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove sample data.");
    } finally {
      setPurging(false);
    }
  }

  async function exportProducts() {
    setExportBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/odoo/products/export", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || `Export failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      anchor.href = url;
      anchor.download = match?.[1] || "products.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export products.");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <SettingsScaffold title="Data" showSubSectionTitle={false} showSearch={false} showSave={false}>
      <div className="grid max-w-3xl gap-6">
        {error && (
          <div role="alert" className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
            <span className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</span>
            <button type="button" onClick={() => void load()} className="rounded-md border border-red-300 bg-white px-3 py-1.5 font-semibold">Retry</button>
          </div>
        )}
        {notice && (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950">
            {notice}
          </div>
        )}

        <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
          <h2 className="text-base font-semibold text-[var(--oh-text)]">Sample data</h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">
            Remove DEMO catalogue, customers, and open demo registers. Company, outlets, registers, and tax stay in place.
            Demo seed orders stay in Odoo but are excluded from live Overview metrics after removal.
          </p>
          {loading ? (
            <p className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--oh-muted)]">
              <LoaderCircle size={16} className="animate-spin" /> Checking sample data…
            </p>
          ) : status ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--oh-text)]">{stateLabel(status.state)}</p>
              {status.state === "unavailable" && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Odoo is still provisioning this store, or provisioning failed. Sample data cleanup becomes available after the store is connected.
                </p>
              )}
              <ul className="grid gap-1 text-sm text-[var(--oh-text-secondary)] sm:grid-cols-2">
                <li>DEMO products: {status.demoProductCount}</li>
                <li>DEMO customers: {status.demoCustomerCount}</li>
                <li>Demo seed orders: {status.demoOrderCount}</li>
                <li>Real paid orders: {status.nonDemoPaidOrderCount}</li>
              </ul>
              {status.sampleDataClearedAt && (
                <p className="text-xs text-[var(--oh-muted)]">Cleared at {status.sampleDataClearedAt} (UTC).</p>
              )}
              {status.archiveOnly && status.canPurge && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  This store already has real sales. Removal archives DEMO products and customers only; live metrics will exclude demo seed orders.
                </p>
              )}
              {status.canPurge && isAdmin ? (
                <div className="space-y-2 border-t border-[var(--oh-border)] pt-3">
                  <label className="block text-sm text-[var(--oh-text)]">
                    Type <span className="font-semibold">{status.confirmPhrase}</span> to confirm
                    <input
                      value={confirm}
                      onChange={(event) => setConfirm(event.target.value)}
                      className="mt-1 h-11 w-full rounded-md border border-[var(--oh-border)] px-3 text-sm outline-none focus:border-[var(--oh-primary)]"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void purge()}
                    disabled={purging || confirm.trim().toUpperCase() !== status.confirmPhrase}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {purging ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    Remove sample data
                  </button>
                </div>
              ) : status.canPurge && !isAdmin ? (
                <p className="text-sm text-[var(--oh-muted)]">Only a store admin can remove sample data.</p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
          <h2 className="text-base font-semibold text-[var(--oh-text)]">Catalogue</h2>
          <p className="mt-1 text-sm text-[var(--oh-muted)]">
            Import or export Odoo products as CSV. Import does not set on-hand stock — use receive or stock adjustment afterward.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/products/odoo?import=1"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--oh-primary-hover)]"
            >
              <FileUp size={16} /> Import products
            </Link>
            <button
              type="button"
              onClick={() => void exportProducts()}
              disabled={exportBusy}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:opacity-50"
            >
              {exportBusy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
              Export products
            </button>
            <a
              href="/product-import-template.csv"
              download
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-4 text-sm font-semibold text-[var(--oh-text)] hover:bg-[var(--oh-surface)]"
            >
              Download template
            </a>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
          <h2 className="text-base font-semibold text-[var(--oh-text)]">Next steps</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--oh-text-secondary)]">
            <li>Load opening stock with an Odoo receipt or stock adjustment after import.</li>
            <li>Create customers in Customers as needed (CSV import for partners comes later).</li>
            <li>Trial teardown from the platform console deletes the store host; it does not wipe the Odoo company rows.</li>
          </ul>
        </section>
      </div>
    </SettingsScaffold>
  );
}
