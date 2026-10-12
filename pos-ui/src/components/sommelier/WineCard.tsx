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
    <article className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#f39200]">{card.badge}</p>
          <p className="mt-1 text-[28px] font-medium leading-none">{formatMoney(card.sellPrice)}</p>
          {card.onPromotion ? (
            <p className="mt-1 text-[12px] text-amber-300">
              On promotion · normally {formatMoney(card.listPrice)}
            </p>
          ) : null}
        </div>
        <div className="rounded-full bg-[#f39200]/15 px-2.5 py-1 text-[12px] font-semibold text-[#f39200]">
          Match {card.matchPct}%
        </div>
      </div>

      <h3 className="mt-3 text-[18px] font-medium leading-6">{card.name}</h3>
      <p className="mt-1 text-[13px] text-white/70">
        {[card.varietal, card.drynessLabel, card.bodyLabel].filter(Boolean).join(" · ")}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(card.aromaTags ?? []).slice(0, 4).map((tag) => (
          <span key={tag} className="rounded-full bg-white/8 px-2.5 py-1 text-[12px] text-white/85">
            {AROMA_ICON[tag] ?? "🍇"} {tag}
          </span>
        ))}
      </div>

      {(card.foodTags ?? []).length > 0 ? (
        <p className="mt-3 text-[12px] text-white/60">
          Pairing · {card.foodTags.slice(0, 3).join(" · ")}
        </p>
      ) : null}

      {card.whyUpgrade ? (
        <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-[13px] leading-5 text-white/80">
          Why upgrade? {card.whyUpgrade}
        </p>
      ) : null}

      <p className="mt-3 text-[13px] leading-5 text-white/80">{card.pitch}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={addToCart}
          className="rounded-xl bg-[#f39200] px-3 py-2.5 text-[13px] font-semibold text-[#1a1020] transition hover:bg-[#e08500]"
        >
          Add to cart
        </button>
        <button
          type="button"
          onClick={() => (onHelp ? onHelp() : router.push(`/sommelier/wine/${card.productId}`))}
          className="rounded-xl border border-white/15 px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-white/8"
        >
          Help me sell
        </button>
      </div>
      <p className="mt-2 text-[11px] text-white/40">In stock: {card.stockQuantity}</p>
    </article>
  );
}
