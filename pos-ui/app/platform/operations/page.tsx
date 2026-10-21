"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, LoaderCircle, RefreshCw } from "lucide-react";
import { AdminPageLayout, AdminSecondaryButton } from "@/components/admin/AdminPageLayout";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

type DependencyStatus = {
  name: "database" | "redis" | "odoo" | "ai";
  status: "UP" | "DOWN" | "DISABLED" | "NOT_CONFIGURED" | "CONFIGURED_UNVERIFIED" | "MISCONFIGURED";
  durationMs: number | null;
  note: string;
};

type BuildIdentity = {
  service: string;
  commit: string | null;
  builtAt: string | null;
};

type OperationsHealth = {
  checkedAt: string;
  environment: string;
  backend: BuildIdentity | null;
  dependencies: DependencyStatus[];
};

type PublicVersion = {
  frontend?: BuildIdentity | null;
};

const SERVICE_LABELS: Record<DependencyStatus["name"], string> = {
  database: "MySQL",
  redis: "Redis",
  odoo: "Odoo",
  ai: "AI provider",
};

const STATUS_LABELS: Record<DependencyStatus["status"], string> = {
  UP: "Available",
  DOWN: "Unavailable",
  DISABLED: "Disabled",
  NOT_CONFIGURED: "Not configured",
  CONFIGURED_UNVERIFIED: "Configured · not checked",
  MISCONFIGURED: "Configuration incomplete",
};

function statusClass(status: DependencyStatus["status"]): string {
  if (status === "UP") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "DOWN" || status === "MISCONFIGURED") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "DISABLED") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function dateTime(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unknown" : parsed.toLocaleString();
}

type RuntimeIdentityState = "VERIFIED" | "MISMATCH" | "UNKNOWN";

function runtimeIdentityState(frontend: BuildIdentity | null, backend: BuildIdentity | null): RuntimeIdentityState {
  const frontendCommit = frontend?.commit?.trim() || null;
  const backendCommit = backend?.commit?.trim() || null;
  if (!frontendCommit || !backendCommit) return "UNKNOWN";
  return frontendCommit === backendCommit ? "VERIFIED" : "MISMATCH";
}

function RuntimeIdentityNotice({ frontend, backend }: { frontend: BuildIdentity | null; backend: BuildIdentity | null }) {
  const state = runtimeIdentityState(frontend, backend);
  if (state === "VERIFIED") {
    return (
      <div role="status" className="mb-5 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
        <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span><strong>Runtime identity verified.</strong> Frontend and backend report the same commit.</span>
      </div>
    );
  }
  if (state === "MISMATCH") {
    return (
      <div role="alert" className="mb-5 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span><strong>Runtime identity mismatch.</strong> Frontend and backend report different commits; do not treat this deployment as verified.</span>
      </div>
    );
  }
  return (
    <div role="status" className="mb-5 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
      <HelpCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span><strong>Runtime identity unknown.</strong> A missing frontend or backend commit prevents source-to-runtime verification.</span>
    </div>
  );
}

function BuildRow({ label, identity }: { label: string; identity: BuildIdentity | null | undefined }) {
  return (
    <tr className="border-b border-[var(--oh-border)] last:border-0">
      <th scope="row" className="w-40 px-3 py-3 text-left font-medium text-[var(--oh-text)]">{label}</th>
      <td className="px-3 py-3">
        <code className="break-all font-mono text-xs text-[var(--oh-text-secondary)]">{identity?.commit || "Unknown"}</code>
        <p className="mt-1 text-xs text-[var(--oh-muted)]">Built {dateTime(identity?.builtAt)}</p>
      </td>
    </tr>
  );
}

export default function PlatformOperationsPage() {
  const { user, ready } = useAuth();
  const [health, setHealth] = useState<OperationsHealth | null>(null);
  const [frontend, setFrontend] = useState<BuildIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
      setError(null);
    }
    const [healthResult, versionResult] = await Promise.allSettled([
      api.get<OperationsHealth>("/api/admin/operations/health"),
      fetch("/api/public/version", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error("Frontend version is unavailable");
        return response.json() as Promise<PublicVersion>;
      }),
    ]);

    if (healthResult.status === "fulfilled") setHealth(healthResult.value);
    else setError(healthResult.reason instanceof ApiError
      ? `${healthResult.reason.message}${healthResult.reason.correlationId ? ` · Request ID ${healthResult.reason.correlationId}` : ""}`
      : "Could not read dependency health.");
    setFrontend(versionResult.status === "fulfilled" ? versionResult.value.frontend ?? null : null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (ready && user?.platformOperator) {
      void Promise.resolve().then(() => load());
    }
  }, [ready, user, load]);

  if (!ready || !user?.platformOperator) return null;

  return (
    <AdminPageLayout
      title="Operations"
      subtitle="Runtime identity and dependency checks for the platform services."
      fullBleed
      actions={(
        <AdminSecondaryButton onClick={() => void load(true)} disabled={refreshing || loading}>
          {refreshing || loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh
        </AdminSecondaryButton>
      )}
    >
      <div className="mx-auto max-w-5xl">
        {error ? (
          <div role="alert" className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
            <span className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</span>
            <button type="button" onClick={() => void load(true)} disabled={refreshing || loading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 font-semibold disabled:opacity-50">
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} aria-hidden="true" />Retry
            </button>
          </div>
        ) : null}

        <RuntimeIdentityNotice frontend={frontend} backend={health?.backend ?? null} />

        <section aria-labelledby="runtime-heading" className="mb-7">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="runtime-heading" className="text-base font-semibold text-[var(--oh-text)]">Runtime versions</h2>
            <p className="text-xs text-[var(--oh-muted)]">Environment {health?.environment || "Unknown"} · checked {health ? dateTime(health.checkedAt) : "not checked"}</p>
          </div>
          <div className="overflow-x-auto rounded-md border border-[var(--oh-border)] bg-white">
            <table className="w-full min-w-[320px] text-sm">
              <tbody>
                <BuildRow label="Frontend" identity={frontend} />
                <BuildRow label="Backend" identity={health?.backend} />
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="dependencies-heading">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="dependencies-heading" className="text-base font-semibold text-[var(--oh-text)]">Dependencies</h2>
            <p className="text-xs text-[var(--oh-muted)]">Unknown and unverified states are kept explicit.</p>
          </div>
          {loading && !health ? (
            <div role="status" className="grid place-items-center border-y border-[var(--oh-border)] py-12 text-[var(--oh-muted)]">
              <LoaderCircle size={20} className="animate-spin" />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--oh-border)] border-y border-[var(--oh-border)] bg-white">
              {(health?.dependencies ?? []).map((item) => (
                <li key={item.name} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(10rem,1fr)_minmax(10rem,auto)_minmax(7rem,auto)] sm:items-center">
                  <div>
                    <h3 className="text-sm font-medium text-[var(--oh-text)]">{SERVICE_LABELS[item.name]}</h3>
                    <p className="mt-0.5 text-xs text-[var(--oh-muted)]">{item.note}</p>
                  </div>
                  <span className={`inline-flex w-fit rounded border px-2 py-1 text-xs font-medium ${statusClass(item.status)}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                  <span className="text-xs text-[var(--oh-muted)] sm:text-right">
                    {item.durationMs == null ? "No probe" : `${item.durationMs} ms`}
                  </span>
                </li>
              ))}
              {health && health.dependencies.length === 0 ? <li className="px-3 py-6 text-sm text-[var(--oh-muted)]">No dependency results returned.</li> : null}
              {!health && !loading ? <li className="px-3 py-6 text-sm text-[var(--oh-muted)]">Health data is unavailable.</li> : null}
            </ul>
          )}
        </section>
      </div>
    </AdminPageLayout>
  );
}
