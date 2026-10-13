"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  MergeIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "@/components/icons";
import { AsyncState } from "@/components/admin/AsyncState";
import { Pagination } from "@/components/admin/Pagination";
import { useApiList, useDebouncedValue } from "@/hooks/useApi";
import { api } from "@/lib/api";

interface ProductListItem {
  id: string;
  name: string;
  categoryName?: string;
  status?: string;
}

const PAGE_SIZE = 10;

function ProductPickerModal({
  open,
  onClose,
  onSelect,
  excludeIds,
  title,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (product: ProductListItem) => void;
  excludeIds: Set<string>;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const { items, total, loading, error } = useApiList<ProductListItem>("/api/products", {
    name: debouncedSearch.trim() || undefined,
    page,
    size: PAGE_SIZE,
  });

  const available = items.filter((p) => !excludeIds.has(p.id));

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 font-sans backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-[580px] flex-col overflow-hidden rounded-[var(--oh-radius)] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--oh-border)] bg-[var(--oh-tile-blue-bg)] px-5 py-4">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--oh-text)]">{title}</h2>
            <p className="mt-0.5 text-[13px] text-[var(--oh-muted)]">Search by product name</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--oh-radius)] text-[var(--oh-muted)] hover:bg-white/60"
            aria-label="Close"
          >
            <XIcon size={20} />
          </button>
        </div>

        <div className="border-b border-[var(--oh-border)] px-5 py-4">
          <div className="relative">
            <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--oh-muted)]" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search products…"
              autoFocus
              className="h-11 w-full rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white pl-10 pr-3 text-[14px] shadow-sm outline-none focus:border-[var(--oh-orange)] focus:ring-2 focus:ring-[var(--oh-orange-muted)]"
            />
          </div>
        </div>

        <div className="min-h-[280px] flex-1 overflow-auto px-3 py-2">
          <AsyncState loading={loading} error={error} empty={available.length === 0}>
            <ul className="space-y-1">
              {available.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(p);
                      onClose();
                    }}
                    className="flex w-full items-start gap-3 rounded-[var(--oh-radius)] px-3 py-3 text-left transition-colors hover:bg-[var(--oh-surface)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-[var(--oh-text)]">{p.name}</span>
                      {p.categoryName && (
                        <span className="mt-0.5 block text-[13px] text-[var(--oh-muted)]">{p.categoryName}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </AsyncState>
        </div>

        <div className="border-t border-[var(--oh-border)] bg-[var(--oh-surface)] px-5 py-3">
          <Pagination page={page} size={PAGE_SIZE} total={total} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}

/** Product merge workspace: pick a target product and merge others into it. */
export function ProductMergePage() {
  const router = useRouter();
  const [target, setTarget] = useState<ProductListItem | null>(null);
  const [sources, setSources] = useState<ProductListItem[]>([]);
  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excludeIds = useMemo(() => {
    const ids = new Set(sources.map((s) => s.id));
    if (target) ids.add(target.id);
    return ids;
  }, [target, sources]);

  async function completeMerge() {
    if (!target) {
      setError("Select the product to keep (target).");
      return;
    }
    if (sources.length === 0) {
      setError("Add at least one product to merge into the target.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/products/${target.id}/merge`, {
        sourceIds: sources.map((s) => Number(s.id)),
      });
      router.push("/products");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--oh-surface)] font-sans">
      <div className="shrink-0 border-b border-[var(--oh-border)] bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => router.push("/products")}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--oh-radius)] border border-[var(--oh-border)] text-[var(--oh-muted)] transition-colors hover:border-[var(--oh-border-strong)] hover:bg-[var(--oh-surface)] hover:text-[var(--oh-text)]"
            aria-label="Back to products"
          >
            <ArrowLeftIcon size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[var(--oh-radius)] bg-[var(--oh-orange-light)] text-[var(--oh-orange)]">
                <MergeIcon size={20} />
              </div>
              <div>
                <h1 className="text-[24px] font-bold tracking-tight text-[var(--oh-text)]">Product Merge</h1>
                <p className="mt-0.5 text-[14px] text-[var(--oh-muted)]">
                  Choose the product to keep, then merge duplicate products into it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-[720px] space-y-6">
          <section className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
            <h2 className="text-[16px] font-semibold text-[var(--oh-text)]">Target product (keep)</h2>
            <p className="mt-1 text-[13px] text-[var(--oh-muted)]">
              Sales history, barcodes, and inventory references will move to this product.
            </p>
            <div className="mt-4">
              {target ? (
                <div className="flex items-center justify-between rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-[var(--oh-surface)] px-4 py-3">
                  <div>
                    <p className="text-[14px] font-semibold text-[var(--oh-text)]">{target.name}</p>
                    {target.categoryName && (
                      <p className="text-[13px] text-[var(--oh-muted)]">{target.categoryName}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setTarget(null)}
                    className="text-[13px] font-medium text-[var(--oh-orange)] hover:underline"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setTargetPickerOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] border border-dashed border-[var(--oh-border-strong)] px-4 py-6 text-[14px] font-medium text-[var(--oh-orange)] transition-colors hover:border-[var(--oh-orange)] hover:bg-[var(--oh-orange-light)]"
                >
                  <PlusIcon size={16} />
                  Select target product
                </button>
              )}
            </div>
          </section>

          <section className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-5 shadow-[var(--oh-shadow-card)]">
            <h2 className="text-[16px] font-semibold text-[var(--oh-text)]">Products to merge (remove)</h2>
            <p className="mt-1 text-[13px] text-[var(--oh-muted)]">
              These products will be merged into the target and then deactivated.
            </p>
            <ul className="mt-4 space-y-2">
              {sources.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-[var(--oh-radius)] border border-[var(--oh-border)] px-4 py-3"
                >
                  <div>
                    <p className="text-[14px] font-medium text-[var(--oh-text)]">{p.name}</p>
                    {p.categoryName && (
                      <p className="text-[13px] text-[var(--oh-muted)]">{p.categoryName}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSources((prev) => prev.filter((s) => s.id !== p.id))}
                    className="text-[13px] text-[var(--oh-muted)] hover:text-[var(--oh-danger)]"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setSourcePickerOpen(true)}
              disabled={!target}
              className="mt-4 flex items-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-border)] px-4 py-2 text-[14px] font-medium text-[var(--oh-text)] transition-colors hover:bg-[var(--oh-surface)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlusIcon size={16} />
              Add product to merge
            </button>
          </section>

          {error && (
            <p className="rounded-[var(--oh-radius)] bg-[var(--oh-danger)]/10 px-4 py-3 text-[14px] text-[var(--oh-danger)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push("/products")}
              disabled={busy}
              className="rounded-[var(--oh-radius)] border border-[var(--oh-border)] px-5 py-2.5 text-[14px] font-medium text-[var(--oh-text)] hover:bg-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void completeMerge()}
              disabled={busy || !target || sources.length === 0}
              className="flex items-center gap-2 rounded-[var(--oh-radius)] bg-[var(--oh-primary)] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MergeIcon size={16} />
              {busy ? "Merging…" : "Complete Merge"}
            </button>
          </div>
        </div>
      </div>

      <ProductPickerModal
        open={targetPickerOpen}
        onClose={() => setTargetPickerOpen(false)}
        onSelect={setTarget}
        excludeIds={excludeIds}
        title="Select target product"
      />
      <ProductPickerModal
        open={sourcePickerOpen}
        onClose={() => setSourcePickerOpen(false)}
        onSelect={(p) => setSources((prev) => [...prev, p])}
        excludeIds={excludeIds}
        title="Add product to merge"
      />
    </div>
  );
}
