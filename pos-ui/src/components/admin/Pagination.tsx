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
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);

  if (total === 0) return null;

  return (
    <nav aria-label="Pagination" className="mt-3 flex items-center justify-between font-sans text-[13px] text-neutral-600">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-neutral-300 px-3 outline-none hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:opacity-40"
        >
          <ChevronRightIcon size={14} className="rotate-180" /> Prev
        </button>
        <span className="px-1.5">
          Page {page} / {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className="flex min-h-11 items-center justify-center gap-1 rounded-md border border-neutral-300 px-3 outline-none hover:bg-[var(--oh-surface)] focus-visible:ring-2 focus-visible:ring-[var(--oh-primary)] disabled:opacity-40"
        >
          Next <ChevronRightIcon size={14} />
        </button>
      </div>
    </nav>
  );
}
