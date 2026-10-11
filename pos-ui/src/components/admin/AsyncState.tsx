"use client";

/** Renders loading / error / empty placeholders consistently across data pages. */
export function AsyncState({
  loading,
  error,
  empty,
  emptyText = "No results found.",
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText?: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return <div className="py-16 text-center text-[16px] text-neutral-400">Loading…</div>;
  }
  if (error) {
    return (
      <div className="py-16 text-center text-[16px] text-[#e2231a]">
        {error}
        <div className="mt-1 text-[13px] text-neutral-400">
          Is the backend running? API requests go to{" "}
          {typeof window !== "undefined" ? `${window.location.origin}/api` : "/api"}.
        </div>
      </div>
    );
  }
  if (empty) {
    return <div className="py-16 text-center text-[16px] text-neutral-500">{emptyText}</div>;
  }
  return <>{children}</>;
}
