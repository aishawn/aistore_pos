"use client";

import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api";
import { Sparkline } from "@/components/admin/Sparkline";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { AssignIcon, EditIcon, ViewIcon } from "@/components/icons";
import type { ClassificationTypeValue } from "@/components/admin/ClassificationTypeMultiSelect";

type Row = {
  id: number;
  name: string;
  type: ClassificationTypeValue;
  productCount: number;
  performance30d: number[];
};

type Product = { id: number | string; name: string };

const TYPE_LABELS: Record<ClassificationTypeValue, string> = {
  brand: "Brand",
  category: "Category",
  family: "Family",
  tag: "Tag",
};

/** Nested view dialog for a classification row. */
export function ClassificationViewDialog({
  row,
  onClose,
  onEdit,
  onAssign,
}: {
  row: Row;
  onClose: () => void;
  onEdit: () => void;
  onAssign: () => void;
}) {
  const titleId = useId();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useDialogFocus(true, onClose, "classification-view");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const query: Record<string, string | number> = { page: 1, size: 40, status: "ACTIVE" };
    if (row.type === "brand") query.brandId = row.id;
    else if (row.type === "category") query.categoryId = row.id;
    else if (row.type === "family") query.familyId = row.id;
    else query.tagId = row.id;
    void api
      .get<{ items: Product[] }>("/api/products", query)
      .then((page) => {
        if (!cancelled) setProducts(page.items || []);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load products.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--oh-border)] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--oh-muted)]">{TYPE_LABELS[row.type]}</p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold text-[var(--oh-text)]">{row.name}</h2>
            <p className="mt-1 text-sm text-[var(--oh-muted)]">{row.productCount.toLocaleString("en-AU")} products</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-10 rounded-lg border border-[var(--oh-border)] px-3 text-sm font-semibold">
            Close
          </button>
        </div>
        <div className="space-y-4 overflow-auto px-5 py-4">
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--oh-text)]">Performance (30 days)</p>
            <Sparkline points={row.performance30d} width={280} height={56} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-emerald-700 hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">
              <EditIcon size={15} /> Edit
            </button>
            <button type="button" onClick={onAssign} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--oh-border)] bg-white px-3 text-sm font-semibold text-[var(--oh-primary)] hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">
              <AssignIcon size={15} /> Assign products
            </button>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--oh-text)]">Assigned products</p>
            {loading && <p className="text-sm text-[var(--oh-muted)]">Loading…</p>}
            {error && <p className="text-sm text-red-700">{error}</p>}
            {!loading && !error && !products.length && <p className="text-sm text-[var(--oh-muted)]">No products assigned.</p>}
            <ul className="divide-y rounded-lg border border-[var(--oh-border)]">
              {products.map((product) => (
                <li key={String(product.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--oh-text)]">
                  <ViewIcon size={14} className="text-[var(--oh-muted)]" />
                  <span className="truncate">{product.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
