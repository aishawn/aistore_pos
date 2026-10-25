"use client";

import { Pencil, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { OdooProductRecord } from "@/lib/odoo-api";
import { friendlyProductName } from "@/lib/product-display-name";
import { productIssues } from "@/lib/product-catalogue";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { ProductImage } from "@/components/ProductImage";

const money = (value: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);

export function CataloguePrice({ product }: { product: OdooProductRecord }) {
  const taxKnown = typeof product.price_included === "number" && Number.isFinite(product.price_included);
  return <span className="inline-flex flex-col tabular-nums">
    <span className={product.list_price === 0 ? "font-semibold text-red-700" : "font-semibold"}>{money(taxKnown ? product.price_included! : product.list_price)}</span>
    <span className="mt-0.5 text-[11px] font-normal text-[var(--oh-muted)]">{taxKnown ? "Incl. GST" : "Tax unconfirmed"}</span>
  </span>;
}

export function CatalogueIssues({ product }: { product: OdooProductRecord }) {
  const issues = productIssues(product);
  if (!issues.length) return null;
  return <span className="mt-1.5 flex flex-wrap gap-1">{issues.map((issue) => <span key={issue} className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">{issue}</span>)}</span>;
}

export function CatalogueProductDetails({ product, categories, onClose, onEdit }: {
  product: OdooProductRecord;
  categories: Map<number, string>;
  onClose: () => void;
  onEdit: () => void;
}) {
  useDialogFocus(true, onClose);
  const name = friendlyProductName(product.display_name || product.name);
  const unit = product.uom_id ? product.uom_id[1] : "Unit not provided";
  const rows = [
    ["SKU", product.default_code || "Not provided"],
    ["Barcode", product.barcode || "Not provided"],
    ["POS categories", product.pos_categ_ids.map((id) => categories.get(id) || `Category #${id}`).join(", ") || "Uncategorised"],
    ["Stock on hand", `${product.qty_available} · ${unit}`],
    ["Available stock", Number.isFinite(product.free_qty) ? `${product.free_qty} · ${unit}` : "Not provided"],
    ["POS visibility", product.available_in_pos ? "Available in POS" : "Hidden from POS"],
  ];
  return createPortal(<div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
<section role="dialog" aria-modal="true" aria-labelledby="catalogue-detail-title" className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-2xl sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-[var(--oh-muted)]">Product details</p><h2 id="catalogue-detail-title" className="mt-1 break-words text-lg font-semibold text-[var(--oh-text)]">{name}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close product details" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-[var(--oh-surface)] focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]"><X size={18} /></button>
      </header>
      <div className="my-5 flex items-center gap-4 rounded-lg bg-[var(--oh-surface)] p-4">
<ProductImage productId={product.id} name={name} className="h-20 w-20 shrink-0 border border-[var(--oh-border)] bg-[var(--oh-surface-muted)]" />
        <div className="min-w-0"><p className="mb-1 text-xs text-[var(--oh-muted)]">Standard sale price · AUD</p><CataloguePrice product={product} /><CatalogueIssues product={product} /></div>
      </div>
      <dl className="divide-y divide-[var(--oh-border)]">{rows.map(([label, value]) => <div key={label} className="grid grid-cols-1 gap-1 py-3 text-sm sm:grid-cols-[140px_1fr]"><dt className="text-[var(--oh-muted)]">{label}</dt><dd className="break-words font-medium text-[var(--oh-text)]">{value}</dd></div>)}</dl>
      <p className="mt-4 rounded-lg bg-[var(--oh-surface)] p-3 text-xs leading-5 text-[var(--oh-muted)]">Stock uses the active inventory context. Count stock to review physical quantities. Customer price lists and promotions may change the final checkout price.</p>
      <footer className="mt-5 flex justify-end gap-2 border-t border-[var(--oh-border)] pt-4">
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-[var(--oh-border)] px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--oh-primary)]">Close</button>
        <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--oh-primary)] px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--oh-primary)]"><Pencil size={15} /> Edit product</button>
      </footer>
    </section>
  </div>, document.body);
}
