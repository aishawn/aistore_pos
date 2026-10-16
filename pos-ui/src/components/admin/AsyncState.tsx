"use client";

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
  onRetry?: () => void;
  children: React.ReactNode;
}) {
  if (loading) {
    return <div role="status" aria-label={loadingLabel} className="py-16 text-center text-[16px] text-neutral-400">Loading…</div>;
  }
  if (error) {
    return (
      <div role="alert" className="py-16 text-center text-[16px] text-[#e2231a]">
        {error}
        <div className="mt-1 text-[13px] text-neutral-400">
          Is the backend running? API requests go to{" "}
          {typeof window !== "undefined" ? `${window.location.origin}/api` : "/api"}.
        </div>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="mt-4 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  if (empty) {
    return <div className="py-16 text-center text-[16px] text-neutral-500">{emptyText}</div>;
  }
  return <>{children}</>;
}
