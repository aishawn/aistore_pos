"use client";

import { useRouter } from "next/navigation";
import { useOptionalSellScreen } from "@/lib/sell-screen";
import type { SommelierRecommendCard } from "@/lib/api";

const AROMA_ICON: Record<string, string> = {
  Plum: "🍓",
  Berry: "🍓",
  Cherry: "🍒",
  Spice: "🌿",
  Oak: "🪵",
  Vanilla: "🪵",
  Blackcurrant: "🍇",
  Citrus: "🍋",
  Floral: "🌸",
  Earth: "🌿",
};

export function formatMoney(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return `$${v.toFixed(2).replace(/\.00$/, "")}`;
}

export function WineCard({
  card,
  onHelp,
}: {
  card: SommelierRecommendCard;
  onHelp?: () => void;
}) {
  const sell = useOptionalSellScreen();
  const router = useRouter();

  function addToCart() {
    sell?.addProduct({
      id: String(card.productId),
      name: card.name,
      unitPrice: Number(card.sellPrice),
      caseQuantity: card.caseQuantity && card.caseQuantity > 0 ? Number(card.caseQuantity) : undefined,
    });
    router.push("/");
  }

  return (
    <article className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-4 shadow-[var(--oh-shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-[var(--oh-primary)]">{card.badge}</p>
          <p className="mt-1 text-[26px] font-semibold leading-none text-[var(--oh-text)]">A${formatMoney(card.sellPrice).slice(1)}</p>
          <p className="mt-1 text-xs text-[var(--oh-muted)]">Per unit · AUD · GST included</p>
          {card.onPromotion ? (
            <p className="mt-1 text-[13px] text-amber-700">
              On promotion · normally A${formatMoney(card.listPrice).slice(1)}
            </p>
          ) : null}
          {card.onPromotion ? <p className="text-xs text-[var(--oh-muted)]">{card.promotionEndsAt ? `Offer ends ${card.promotionEndsAt}` : "Promotion end date unverified"}</p> : null}
        </div>
        <div className="rounded-full bg-blue-50 px-2.5 py-1 text-[13px] font-semibold text-blue-800">
          Match {card.matchPct}%
        </div>
      </div>

      <h3 className="mt-3 text-[18px] font-semibold leading-6 text-[var(--oh-text)]">{card.name}</h3>
      <p className="mt-1 text-[13px] text-[var(--oh-muted)]">
        {[card.varietal, card.drynessLabel, card.bodyLabel].filter(Boolean).join(" · ")}
      </p>
      {card.inferred ? <p className="mt-1 text-[12px] font-medium text-amber-800">Estimated profile</p> : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(card.aromaTags ?? []).slice(0, 4).map((tag) => (
          <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-[13px] text-slate-700">
            {AROMA_ICON[tag] ?? "🍇"} {tag}
          </span>
        ))}
      </div>

      {(card.foodTags ?? []).length > 0 ? (
        <p className="mt-3 text-[13px] text-[var(--oh-muted)]">
          Pairing · {card.foodTags.slice(0, 3).join(" · ")}
        </p>
      ) : null}

      {card.whyUpgrade ? (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-[13px] leading-5 text-slate-700">
          Why upgrade? {card.whyUpgrade}
        </p>
      ) : null}

      <p className="mt-3 text-[14px] leading-6 text-[var(--oh-text-secondary)]">{card.pitch}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={addToCart}
          className="min-h-11 rounded-lg bg-[var(--oh-primary)] px-3 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[var(--oh-primary-hover)]"
        >
          Add to cart
        </button>
        <button
          type="button"
          onClick={() => (onHelp ? onHelp() : router.push(`/sommelier/wine/${card.productId}`))}
          className="min-h-11 rounded-lg border border-[var(--oh-border)] px-3 py-2.5 text-[14px] font-semibold text-[var(--oh-text)] transition hover:bg-slate-50"
        >
          Help me sell
        </button>
      </div>
      <p className="mt-2 text-[13px] text-[var(--oh-muted)]">
        In stock: {card.stockQuantity} units
        {Number(card.caseQuantity) > 1 ? ` · Case pack: ${Number(card.caseQuantity).toLocaleString("en-AU")} units` : ""}
      </p>
    </article>
  );
}
