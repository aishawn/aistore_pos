"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useApiList } from "@/hooks/useApi";
import { AsyncState } from "@/components/admin/AsyncState";
import { AlertDialog } from "@/components/admin/AlertDialog";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { EditClassificationModal } from "@/components/admin/EditClassificationModal";
import { AssignIcon, DeleteIcon, EditIcon, LineChartIcon, ViewIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
}

interface Classification {
  id: string;
  name: string;
  mdbId?: number;
}

const TYPE_LABELS: Record<string, string> = {
  brand: "Brand",
  category: "Category",
  family: "Family",
  tag: "Tag",
};

const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

/** Single-line sales chart for classification performance. */
function SalesChart() {
  const sales = [0, 45, 90, 60, 120, 95, 180, 140, 210, 160, 130, 100];
  const w = 720;
  const h = 220;
  const pad = { top: 20, right: 24, bottom: 32, left: 56 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const maxVal = 350;
  const step = innerW / (MONTHS.length - 1);

  const coords = sales.map((v, i) => [
    pad.left + i * step,
    pad.top + innerH - (v / maxVal) * innerH,
  ]);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pad.left + innerW},${pad.top + innerH} L${pad.left},${pad.top + innerH} Z`;
  const yTicks = [0, 70, 140, 210, 280, 350];

  return (
    <div className="overflow-x-auto rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white p-4 shadow-[var(--oh-shadow-card)]">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[520px]" aria-label="Sales chart">
        {yTicks.map((tick) => {
          const y = pad.top + innerH - (tick / maxVal) * innerH;
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                y1={y}
                x2={pad.left + innerW}
                y2={y}
                stroke="var(--oh-border)"
                strokeDasharray="4 4"
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-[var(--oh-muted)] text-[13px]">
                ${tick.toFixed(2)}
              </text>
            </g>
          );
        })}
        <path d={area} fill="#5cb3e0" opacity={0.12} />
        <path d={line} fill="none" stroke="#5cb3e0" strokeWidth={2} />
        {MONTHS.map((m, i) => (
          <text
            key={m}
            x={pad.left + i * step}
            y={h - 8}
            textAnchor="middle"
            className="fill-[var(--oh-muted)] text-[13px]"
          >
            {m}
          </text>
        ))}
      </svg>
      <div className="mt-2 flex justify-center text-[13px] text-[var(--oh-text-secondary)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#5cb3e0]" /> Sales
        </span>
      </div>
    </div>
  );
}

function ProductRow({ product, onView }: { product: Product; onView: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--oh-border)] px-4 py-3 last:border-b-0 odd:bg-white even:bg-[var(--oh-surface)]">
      <span className="min-w-0 flex-1 truncate text-[14px] text-[var(--oh-text)]">{product.name}</span>
      <button
        type="button"
        onClick={onView}
        className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-[var(--sf-tab-blue)]"
      >
        <ViewIcon size={16} /> View
      </button>
    </div>
  );
}

/** Classification detail view with sales chart and assigned products. */
export function ClassificationViewPage({ type, id }: { type: string; id: string }) {
  const router = useRouter();
  const typeLabel = TYPE_LABELS[type] ?? type;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [alertDialog, setAlertDialog] = useState<{ title: string; message: string } | null>(null);

  const classification = useApi<Classification>(`/api/classifications/${type}/${id}`);

  const productQuery: Record<string, string | number> = { page: 1, size: 500 };
  if (type === "brand") productQuery.brandId = id;
  else if (type === "category") productQuery.categoryId = id;
  else if (type === "family") productQuery.familyId = id;
  else if (type === "tag") productQuery.tagId = id;

  const products = useApiList<Product>("/api/products", productQuery);

  function requestDelete() {
    if (products.total > 0) {
      setAlertDialog({
        title: "Cannot Delete",
        message: `This classification is linked to ${products.total} product${products.total === 1 ? "" : "s"} and cannot be deleted. Remove the product associations first.`,
      });
      return;
    }
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    try {
      await api.del(`/api/classifications/${type}/${id}`);
      router.push("/classifications");
    } catch (e) {
      setAlertDialog({
        title: "Delete Failed",
        message: e instanceof Error ? e.message : "Failed to delete",
      });
      setDeleting(false);
    }
  }

  const title = classification.data?.name ?? "…";

  return (
    <div className="flex h-full bg-[var(--oh-surface)] font-sans">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-[var(--oh-border)] bg-[#eef1f5] px-4 py-5">
        <p className="text-[13px] font-medium text-[var(--oh-muted)]">{typeLabel}</p>
        <h1 className="mt-0.5 text-[22px] font-bold leading-tight text-[var(--oh-text)]">View {title}</h1>

        <nav className="mt-6 space-y-1">
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-[var(--oh-radius)] bg-white px-3 py-2.5 shadow-[var(--oh-shadow-card)]",
            )}
          >
            <LineChartIcon size={16} className="mt-0.5 shrink-0 text-[var(--oh-tile-blue-text)]" strokeWidth={1.75} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[var(--oh-tile-blue-text)]">Home</div>
              <div className="mt-0.5 text-[13px] leading-snug text-[var(--oh-muted)]">
                View {typeLabel.toLowerCase()} details and basic statistics
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/classifications/${type}/${id}/assign`)}
            className="flex w-full items-start gap-2.5 rounded-[var(--oh-radius)] px-3 py-2.5 text-left text-[var(--oh-text-secondary)] transition-colors hover:bg-white/70"
          >
            <AssignIcon size={16} className="mt-0.5 shrink-0" strokeWidth={1.75} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold">Assign</div>
              <div className="mt-0.5 text-[13px] leading-snug text-[var(--oh-muted)]">
                Assign products to the {typeLabel.toLowerCase()}
              </div>
            </div>
          </button>
        </nav>

        <div className="mt-auto space-y-2 pt-6">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-success)] px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-success)] transition-colors hover:bg-[var(--oh-tile-green-bg)]"
          >
            <EditIcon size={16} /> Edit
          </button>
          <button
            type="button"
            onClick={requestDelete}
            disabled={deleting}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--oh-radius)] border border-[var(--oh-danger)] px-4 py-2.5 text-[13px] font-semibold text-[var(--oh-danger)] transition-colors hover:bg-[var(--oh-tile-red-bg)] disabled:opacity-60"
          >
            <DeleteIcon size={16} /> {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto p-5 md:p-6">
        <AsyncState
          loading={classification.loading}
          error={classification.error}
          empty={false}
          onRetry={classification.reload}
        >
          <SalesChart />

          <section className="mt-6">
            <h2 className="mb-3 text-[18px] font-bold text-[var(--oh-text)]">Products</h2>
            <AsyncState
              loading={products.loading}
              error={products.error}
              empty={products.items.length === 0}
              emptyText="No products assigned yet."
              onRetry={products.reload}
            >
              <div className="overflow-hidden rounded-[var(--oh-radius)] border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
                {products.items.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onView={() => router.push(`/products/${product.id}/view`)}
                  />
                ))}
              </div>
            </AsyncState>
          </section>
        </AsyncState>
      </main>

      {editing && classification.data && (
        <EditClassificationModal
          open={editing}
          type={type}
          item={classification.data}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            classification.reload();
          }}
        />
      )}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={`Delete ${typeLabel.toLowerCase()}`}
        message={classification.data ? `Delete “${classification.data.name}”?` : "Delete this classification?"}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => { if (!deleting) setDeleteConfirmOpen(false); }}
      />
      <AlertDialog
        open={!!alertDialog}
        title={alertDialog?.title ?? ""}
        message={alertDialog?.message ?? ""}
        onClose={() => setAlertDialog(null)}
      />
    </div>
  );
}
