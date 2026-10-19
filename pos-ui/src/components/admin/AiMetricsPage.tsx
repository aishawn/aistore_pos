"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Clock3, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { apiFailureMessage, fetchAiReportMetrics, type AiReportMetrics } from "@/lib/api";

const windows = [
  { hours: 24, label: "Last 24 hours" },
  { hours: 72, label: "Last 3 days" },
  { hours: 168, label: "Last 7 days" },
];

export function AiMetricsPage() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<AiReportMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await fetchAiReportMetrics(hours));
    } catch (cause) {
      setError(apiFailureMessage(cause, "Could not load AI metrics.", "Please sign in again."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hours]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return <main aria-label="Loading AI metrics" className="grid h-full place-items-center bg-[var(--oh-surface)]"><LoaderCircle className="animate-spin text-[var(--oh-primary)]" /></main>;
  }

  return (
    <main className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="oh-type-meta font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Orithos AI · Admin</p>
          <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">Report query metrics</h1>
          <p className="oh-type-label mt-1 max-w-2xl text-[var(--oh-muted)]">Read-only report audit metrics for this store. Questions and generated SQL are intentionally excluded.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="ai-metrics-window">Metrics window</label>
          <select id="ai-metrics-window" value={hours} onChange={(event) => setHours(Number(event.target.value))} className="h-11 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm text-[var(--oh-text)]">
            {windows.map((item) => <option key={item.hours} value={item.hours}>{item.label}</option>)}
          </select>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-white px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-paper)] disabled:opacity-60">
            {refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </button>
        </div>
      </header>

      {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900"><span className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</span><button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-300 bg-white px-3 font-semibold text-red-900 disabled:opacity-60"><RefreshCw size={14} /> Retry</button></div> : null}

      {data ? <>
        <section aria-label="AI report summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric title="Report requests" value={data.summary.requests.toLocaleString()} detail={`${data.summary.allowed} allowed · ${data.summary.rejected} rejected`} />
          <Metric title="Allowed rate" value={`${data.summary.allowedRate.toFixed(1)}%`} detail="Report guard passed" />
          <Metric title="Average latency" value={`${Math.round(data.summary.averageLatencyMs)} ms`} detail={`p50 ${data.summary.p50LatencyMs ?? "—"} · p95 ${data.summary.p95LatencyMs ?? "—"}`} icon={<Clock3 size={17} />} />
          <Metric title="Estimated tokens" value={data.summary.estimatedTokens.toLocaleString()} detail="Prompt/SQL estimate only" />
          <Metric title="Tenant scope" value="Current store" detail="Vendor-scoped and admin-only" icon={<ShieldCheck size={17} />} />
        </section>

        <section className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
          <div className="border-b border-[var(--oh-border)] px-4 py-4 md:px-5"><h2 className="oh-type-title text-[var(--oh-text)]">By report path</h2><p className="oh-type-meta mt-1 text-[var(--oh-muted)]">Only aggregate counts and latency are shown.</p></div>
          {data.byPath.length ? <div className="overflow-x-auto"><table className="min-w-[720px] w-full text-left text-sm"><thead className="bg-[var(--oh-surface)] text-xs uppercase tracking-wide text-[var(--oh-muted)]"><tr><th className="px-4 py-3 font-semibold md:px-5">Path</th><th className="px-4 py-3 font-semibold">Requests</th><th className="px-4 py-3 font-semibold">Allowed</th><th className="px-4 py-3 font-semibold">Rate</th><th className="px-4 py-3 font-semibold">Avg latency</th><th className="px-4 py-3 font-semibold">Est. tokens</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{data.byPath.map((item) => <tr key={item.path}><td className="px-4 py-3 font-medium text-[var(--oh-text)] md:px-5">{item.path}</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.requests}</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.allowed}</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.allowedRate.toFixed(1)}%</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{Math.round(item.averageLatencyMs)} ms</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.estimatedTokens.toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No report audit events in this period.</p>}
        </section>
        <p className="oh-type-meta inline-flex items-start gap-2 text-[var(--oh-muted)]"><ShieldCheck size={14} className="mt-0.5 shrink-0" />Generated {new Date(data.generatedAt).toLocaleString()} · Estimated tokens are calculated from stored prompt/SQL character counts and are not provider billing usage.</p>
      </> : null}
    </main>
  );
}

function Metric({ title, value, detail, icon }: { title: string; value: string; detail: string; icon?: React.ReactNode }) {
  return <article className="rounded-lg border border-[var(--oh-border)] bg-white p-3.5 shadow-[var(--oh-shadow-card)]"><div className="flex items-center justify-between gap-2"><p className="oh-type-label text-[var(--oh-muted)]">{title}</p>{icon ? <span className="text-[var(--oh-primary)]">{icon}</span> : null}</div><p className="oh-type-kpi mt-3 text-[var(--oh-text)]">{value}</p><p className="oh-type-meta mt-1 text-[var(--oh-muted)]">{detail}</p></article>;
}
