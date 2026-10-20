"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import {
  AdminPageLayout,
  AdminSecondaryButton,
} from "@/components/admin/AdminPageLayout";
import { useAuth } from "@/lib/auth";
import {
  apiFailureMessage,
  fetchPlatformAiUsage,
  type PlatformAiUsageMetrics,
} from "@/lib/api";

const windows = [
  { hours: 24, label: "Last 24 hours" },
  { hours: 72, label: "Last 3 days" },
  { hours: 168, label: "Last 7 days" },
];

export default function PlatformAiUsagePage() {
  const { user, ready } = useAuth();
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<PlatformAiUsageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await fetchPlatformAiUsage(hours));
    } catch (cause) {
      setError(apiFailureMessage(cause, "Could not load platform AI usage.", "Please sign in again."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hours]);

  useEffect(() => {
    if (ready && user?.platformOperator) void load();
  }, [ready, user, load]);

  if (!ready || !user) return null;

  return (
    <AdminPageLayout
      title="AI usage"
      subtitle="Cross-store assistant and report aggregates. Chat text is never shown here."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="platform-ai-window">Window</label>
          <select
            id="platform-ai-window"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm"
          >
            {windows.map((w) => (
              <option key={w.hours} value={w.hours}>{w.label}</option>
            ))}
          </select>
          <AdminSecondaryButton onClick={() => void load(true)} disabled={refreshing || loading}>
            {refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </AdminSecondaryButton>
        </div>
      }
    >
      {error ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="grid place-items-center py-16">
          <LoaderCircle className="animate-spin text-[var(--oh-primary)]" />
        </div>
      ) : data ? (
        <div className="space-y-4">
          <section aria-label="Platform AI summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric title="Active stores" value={String(data.summary.storesWithActivity)} detail="With AI audit events" />
            <Metric title="AI requests" value={data.summary.requests.toLocaleString()} detail={`${data.summary.allowed} allowed · ${data.summary.rejected} rejected`} />
            <Metric title="Allowed rate" value={`${data.summary.allowedRate.toFixed(1)}%`} detail={`p95 ${data.summary.p95LatencyMs ?? "—"} ms`} />
            <Metric title="Est. tokens" value={data.summary.estimatedTokens.toLocaleString()} detail="Character-based estimate" />
          </section>

          <section className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
            <div className="border-b border-[var(--oh-border)] px-4 py-4">
              <h2 className="text-base font-semibold text-[var(--oh-text)]">By store</h2>
              <p className="mt-1 text-xs text-[var(--oh-muted)]">Aggregates only — no questions or answers.</p>
            </div>
            {data.byStore.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <caption className="sr-only">AI usage by store</caption>
                  <thead className="bg-[var(--oh-surface)] text-xs uppercase tracking-wide text-[var(--oh-muted)]">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Store</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Requests</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Allow %</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Avg latency</th>
                      <th scope="col" className="px-4 py-3 font-semibold">P95</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--oh-border)]">
                    {data.byStore.map((row) => (
                      <tr key={row.vendorId}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/platform/stores/${row.vendorId}`}
                            className="font-medium text-[var(--oh-primary)] hover:underline"
                          >
                            {row.storeName}
                          </Link>
                          <span className="mt-0.5 block font-mono text-xs text-[var(--oh-muted)]">{row.subdomain}</span>
                        </td>
                        <td className="px-4 py-3 capitalize text-[var(--oh-text-secondary)]">{row.status || "—"}</td>
                        <td className="px-4 py-3 tabular-nums">{row.requests}</td>
                        <td className="px-4 py-3 tabular-nums">{row.allowedRate.toFixed(1)}%</td>
                        <td className="px-4 py-3 tabular-nums">{Math.round(row.averageLatencyMs)} ms</td>
                        <td className="px-4 py-3 tabular-nums">{row.p95LatencyMs ?? "—"} ms</td>
                        <td className="px-4 py-3 text-[var(--oh-muted)]">
                          {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No AI activity in this window.</p>
            )}
          </section>
        </div>
      ) : null}
    </AdminPageLayout>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-lg border border-[var(--oh-border)] bg-white p-3.5 shadow-[var(--oh-shadow-card)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">{title}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--oh-text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--oh-muted)]">{detail}</p>
    </article>
  );
}
