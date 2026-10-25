"use client";

import { useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

/** Renders loading / error / empty placeholders consistently across data pages. */
export function AsyncState({
  loading,
  error,
  empty,
  emptyText = "No results found.",
  loadingLabel = "Loading",
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText?: string;
  loadingLabel?: string;
  onRetry?: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return <div role="status" aria-live="polite" aria-label={loadingLabel} className="py-16 text-center text-[16px] text-[var(--oh-muted)]">Loading…</div>;
  }
  if (error) {
    return (
      <div role="alert" aria-live="assertive" className="py-16 text-center text-[16px] text-[var(--brand-danger)]">
        {error}
        {onRetry ? (
          <button type="button" onClick={() => void handleRetry()} disabled={retrying} aria-busy={retrying} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-2 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)] disabled:cursor-wait disabled:opacity-60">
            {retrying ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={15} aria-hidden="true" />}
            {retrying ? "Retrying…" : "Retry"}
          </button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return <div role="status" aria-live="polite" className="py-16 text-center text-[16px] text-[var(--oh-muted)]">{emptyText}</div>;
  }
  return <>{children}</>;
}

/** Keeps dependent lookup failures visible without replacing a user's form. */
export function AsyncDependencyNotice({
  dependencies,
}: {
  dependencies: Array<{ label: string; error: string | null; loading?: boolean; onRetry: () => void }>;
}) {
  const active = dependencies.filter((dependency) => dependency.error);
  if (active.length === 0) return null;
  const retrying = active.some((dependency) => dependency.loading);

  return (
    <div role="alert" aria-live="assertive" aria-busy={retrying} className="mb-4 rounded-lg border border-[var(--brand-danger)] bg-[var(--brand-danger-tint)] px-4 py-3 text-sm text-[var(--brand-danger)]">
      <p className="font-semibold">Some lookup options could not be loaded.</p>
      <div className="mt-2 space-y-2">
        {active.map((dependency) => (
          <div key={dependency.label} className="flex flex-wrap items-center justify-between gap-2">
            <span>{dependency.label}: {dependency.error || "Retrying…"}</span>
            <button
              type="button"
              onClick={dependency.onRetry}
              disabled={dependency.loading}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--brand-danger)] bg-[var(--oh-surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--brand-danger)] hover:bg-[var(--brand-danger-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-danger)] disabled:cursor-wait disabled:opacity-60"
            >
              {dependency.loading ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}
              {dependency.loading ? "Retrying…" : "Retry"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
