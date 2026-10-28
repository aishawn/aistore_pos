"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Clock3, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { apiFailureMessage, fetchAiReportMetrics, type AiReportMetrics } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const windows = [
  { hours: 24, label: "Last 24 hours" },
  { hours: 72, label: "Last 3 days" },
  { hours: 168, label: "Last 7 days" },
];

export function AiMetricsPage() {
  const { user, ready } = useAuth();
  const isAdmin = Boolean(user?.isAdmin);
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<AiReportMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!isAdmin) return;
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
  }, [hours, isAdmin]);

  useEffect(() => {
    if (!ready) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void load();
  }, [load, ready, isAdmin]);

  if (!ready || (loading && !data && isAdmin)) {
    return <main aria-label="Loading AI metrics" className="grid h-full place-items-center bg-[var(--oh-surface)]"><LoaderCircle className="animate-spin text-[var(--oh-primary)]" /></main>;
  }

  if (!isAdmin) {
    return (
      <main className="grid h-full place-items-center bg-[var(--oh-surface)] p-6">
        <div className="max-w-md rounded-lg border border-[var(--brand-warning)] bg-[var(--brand-warning-tint)] px-4 py-3 text-sm text-[var(--brand-warning)]">
          Only store administrators can view AI query health (volume, latency, and guard rates). This is an ops dashboard — not a Q&amp;A quality review.
        </div>
      </main>
    );
  }

  return (
    <main aria-busy={loading || refreshing} className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[var(--oh-surface)] p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="oh-type-meta font-semibold uppercase tracking-[.12em] text-[var(--oh-muted)]">Setup · Store admin</p>
          <h1 className="oh-type-title mt-1 text-[var(--oh-text)]">AI Query Health</h1>
          <p className="oh-type-label mt-1 max-w-2xl text-[var(--oh-muted)]">
            Ops view for this store: request volume, AI guard pass/reject rate, latency, and estimated tokens.
            Not a Q&amp;A quality scorecard — questions, answers, and generated SQL are never shown.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="ai-metrics-window">Metrics window</label>
          <select id="ai-metrics-window" value={hours} onChange={(event) => setHours(Number(event.target.value))} className="h-11 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm text-[var(--oh-text)]">
            {windows.map((item) => <option key={item.hours} value={item.hours}>{item.label}</option>)}
          </select>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface-muted)] disabled:opacity-60">
            {refreshing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
          </button>
        </div>
      </header>

      {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--brand-danger)] bg-[var(--brand-danger-tint)] px-3 py-2.5 text-sm text-[var(--brand-danger)]"><span className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</span><button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--brand-danger)] bg-[var(--oh-surface-elevated)] px-3 font-semibold text-[var(--brand-danger)] disabled:opacity-60"><RefreshCw size={14} /> Retry</button></div> : null}

      {data ? <>
        <section aria-label="AI summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric title="AI requests" value={data.summary.requests.toLocaleString()} detail={`${data.summary.allowed} allowed · ${data.summary.rejected} rejected`} />
          <Metric title="Allowed rate" value={`${data.summary.allowedRate.toFixed(1)}%`} detail="AI guard passed" />
          <Metric title="Average latency" value={`${Math.round(data.summary.averageLatencyMs)} ms`} detail={`p50 ${data.summary.p50LatencyMs ?? "—"} · p95 ${data.summary.p95LatencyMs ?? "—"}`} icon={<Clock3 size={17} />} />
          <Metric title="Estimated tokens" value={data.summary.estimatedTokens.toLocaleString()} detail="Character-based estimate only" />
          <Metric title="Tenant scope" value="Current store" detail="Vendor-scoped and admin-only" icon={<ShieldCheck size={17} />} />
        </section>

        {data.highlights ? (
          <section aria-label="AI ops highlights" className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Metric
              title="Last 24h requests"
              value={data.highlights.last24hRequests.toLocaleString()}
              detail={`${data.highlights.last24hRejected} rejected · ${data.highlights.last24hRejectedRate.toFixed(1)}% fail`}
            />
            <article className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-3.5 shadow-[var(--oh-shadow-card)] md:col-span-2">
              <p className="oh-type-label text-[var(--oh-muted)]">Top intents / paths</p>
              {data.highlights.topIntents.length ? (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {data.highlights.topIntents.map((item) => (
                    <li key={item.path} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-medium text-[var(--oh-text)]">{item.path}</span>
                      <span className="shrink-0 tabular-nums text-[var(--oh-muted)]">
                        {item.requests} · {item.allowedRate.toFixed(0)}% ok · {Math.round(item.averageLatencyMs)}ms
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="oh-type-meta mt-3 text-[var(--oh-muted)]">No intent activity in this window.</p>
              )}
            </article>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] shadow-[var(--oh-shadow-card)]">
          <div className="border-b border-[var(--oh-border)] px-4 py-4 md:px-5"><h2 className="oh-type-title text-[var(--oh-text)]">By AI path</h2><p className="oh-type-meta mt-1 text-[var(--oh-muted)]">Assistant intents and report paths are aggregate only.</p></div>
          <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><caption className="sr-only">AI requests grouped by assistant intent and report path</caption><thead className="bg-[var(--oh-surface)] text-xs uppercase tracking-wide text-[var(--oh-muted)]"><tr><th scope="col" className="px-4 py-3 font-semibold md:px-5">Path</th><th scope="col" className="px-4 py-3 font-semibold">Requests</th><th scope="col" className="px-4 py-3 font-semibold">Allowed</th><th scope="col" className="px-4 py-3 font-semibold">Rate</th><th scope="col" className="px-4 py-3 font-semibold">Avg latency</th><th scope="col" className="px-4 py-3 font-semibold">P50</th><th scope="col" className="px-4 py-3 font-semibold">P95</th><th scope="col" className="px-4 py-3 font-semibold">Est. tokens</th></tr></thead><tbody className="divide-y divide-[var(--oh-border)]">{data.byPath.length ? data.byPath.map((item) => <tr key={item.path}><td className="px-4 py-3 font-medium text-[var(--oh-text)] md:px-5">{item.path}</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.requests}</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.allowed}</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.allowedRate.toFixed(1)}%</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{Math.round(item.averageLatencyMs)} ms</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.p50LatencyMs ?? "—"} ms</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.p95LatencyMs ?? "—"} ms</td><td className="px-4 py-3 tabular-nums text-[var(--oh-text-secondary)]">{item.estimatedTokens.toLocaleString()}</td></tr>) : <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--oh-muted)]">No AI audit events in this period.</td></tr>}</tbody></table></div>
        </section>
        <p className="oh-type-meta inline-flex items-start gap-2 text-[var(--oh-muted)]"><ShieldCheck size={14} className="mt-0.5 shrink-0" />Generated {new Date(data.generatedAt).toLocaleString()} · Estimated tokens use character counts and are not provider billing usage.</p>
      </> : null}
    </main>
  );
}

function Metric({ title, value, detail, icon }: { title: string; value: string; detail: string; icon?: React.ReactNode }) {
  return <article className="rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-3.5 shadow-[var(--oh-shadow-card)]"><div className="flex items-center justify-between gap-2"><p className="oh-type-label text-[var(--oh-muted)]">{title}</p>{icon ? <span className="text-[var(--oh-primary)]">{icon}</span> : null}</div><p className="oh-type-kpi mt-3 text-[var(--oh-text)]">{value}</p><p className="oh-type-meta mt-1 text-[var(--oh-muted)]">{detail}</p></article>;
}
