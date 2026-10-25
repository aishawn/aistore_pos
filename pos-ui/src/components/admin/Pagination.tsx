"use client";

import { ChevronRightIcon } from "@/components/icons";

/** Server-side pagination control: "Showing X–Y of N" + Prev / Next. */
export function Pagination({
  page,
  size,
  total,
  onPage,
}: {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(Math.max(page, 1), pages);
  const outOfRange = page !== currentPage;
  const from = total === 0 ? 0 : (currentPage - 1) * size + 1;
  const to = Math.min(total, currentPage * size);

  if (total === 0) return null;

  return (
<nav aria-label="Pagination" className="mt-3 flex flex-col gap-3 font-sans text-[13px] text-[var(--oh-text-secondary)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-live="polite">Showing {from}–{to} of {total}</span>
        {outOfRange && (
          <button type="button" onClick={() => onPage(currentPage)} className="font-semibold text-[var(--oh-primary)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]">
            Go to page {currentPage}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 self-stretch sm:self-auto">
        <button
          type="button"
          disabled={currentPage <= 1}
          aria-label="Go to previous page"
          onClick={() => onPage(currentPage - 1)}
className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[var(--oh-text)] outline-none hover:bg-[var(--oh-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:opacity-40 sm:flex-none"
        >
          <ChevronRightIcon size={14} className="rotate-180" /> Prev
        </button>
        <span aria-current="page" className="min-w-24 px-1.5 text-center">
          Page {currentPage} / {pages}
        </span>
        <button
          type="button"
          disabled={currentPage >= pages}
          aria-label="Go to next page"
          onClick={() => onPage(currentPage + 1)}
className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-[var(--oh-text)] outline-none hover:bg-[var(--oh-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:opacity-40 sm:flex-none"
        >
          Next <ChevronRightIcon size={14} />
        </button>
      </div>
    </nav>
  );
}
