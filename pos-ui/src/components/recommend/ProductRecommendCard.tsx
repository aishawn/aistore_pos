"use client";

import Link from "next/link";
import type { GroceryRecommendCard } from "@/lib/api";
import { formatMoney } from "@/components/sommelier/WineCard";

const CATEGORY_LABEL: Record<string, string> = {
  beer: "Beer",
  spirits: "Spirits",
  soft_drinks: "Soft drinks",
  snacks: "Snacks",
  other: "Other",
};

export function ProductRecommendCard({ card }: { card: GroceryRecommendCard }) {
  const saleQuantity = Number(card.saleQuantity ?? 1);
  const isPack = saleQuantity > 1;

  return (
    <article className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[var(--oh-primary)]">{card.badge}</p>
          <p className="mt-1 text-[26px] font-semibold leading-none text-[var(--oh-text)]">
            A${formatMoney(card.sellPrice).slice(1)}
          </p>
          {card.promotionName && <p className="mt-1 text-sm font-medium text-emerald-700">{card.promotionName}</p>}
          {card.promotionEndsAt && <p className="text-xs text-[var(--oh-muted)]">Offer ends {card.promotionEndsAt}</p>}
          <p className="text-xs text-[var(--oh-muted)]">AUD · GST included</p>
          {isPack && <p className="mt-1 text-sm text-[var(--oh-muted)]">Per pack of {saleQuantity}</p>}
        </div>
        <div className="rounded-full bg-blue-50 px-2.5 py-1 text-[13px] font-semibold text-blue-800">
          Match {card.matchPct}%
        </div>
      </div>

      <h3 className="mt-3 text-[18px] font-semibold leading-6 text-[var(--oh-text)]">{card.name}</h3>
      <p className="mt-1 text-[13px] text-[var(--oh-muted)]">
        {(card.category ? CATEGORY_LABEL[card.category] : null) ?? card.category ?? "In stock"}
      </p>

      <p className="mt-3 text-[14px] leading-6 text-[var(--oh-text-secondary)]">{card.reason}</p>

      <div className="mt-4">
        <Link
          href={`/products/${card.productId}/view`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--oh-primary)] px-3 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[var(--oh-primary-hover)]"
        >View product</Link>
      </div>
      <p className="mt-2 text-[13px] text-[var(--oh-muted)]">In stock: {card.stockQuantity} {isPack ? "packs" : "units"}</p>
    </article>
  );
}
