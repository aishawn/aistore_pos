"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Sparkles, Wine } from "lucide-react";
import { RecommendShell } from "@/components/recommend/RecommendShell";
import { useOptionalAiAssistant } from "@/lib/ai-assistant";
import { fetchAiClientConfig } from "@/lib/api";

export function RecommendHome({ showPosAssistant = false }: { showPosAssistant?: boolean }) {
  const ai = useOptionalAiAssistant();
  const mobile = showPosAssistant;
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAiClientConfig()
      .then((config) => {
        if (!cancelled) setAiEnabled(config.enabled);
      })
      .catch(() => {
        if (!cancelled) setAiEnabled(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RecommendShell
      title="Recommend"
      subtitle="Match customers to in-stock wine or grocery from this store — then add to cart."
    >
      <div className="grid gap-4">
        {aiEnabled === false ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-5 text-amber-950">
            Store AI chat is off. Catalogue matching for wine and grocery still works from stock on hand.
          </p>
        ) : null}

        <Link
          href="/sommelier"
          className="group rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] transition hover:border-[var(--oh-primary)] hover:shadow-md sm:p-6"
        >
          <div className="flex items-center gap-2 text-[var(--oh-primary)]">
            <Wine size={20} />
            <span className="text-[13px] font-semibold">Wine</span>
          </div>
          <h2 className="mt-3 text-[21px] font-semibold leading-snug text-[var(--oh-text)] sm:text-[23px]">
            Help the customer find the right bottle
          </h2>
          <p className="mt-2 text-[14px] leading-6 text-[var(--oh-muted)]">
            Guided taste questions, label identify, and sales pitch — from wines currently in stock.
          </p>
          <p className="mt-3 text-[13px] font-semibold text-[var(--oh-primary)]">
            Open Wine · Find / Identify
          </p>
        </Link>

        <Link
          href="/recommend/grocery"
          className="group rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] p-5 shadow-[var(--oh-shadow-card)] transition hover:border-[var(--oh-primary)] hover:shadow-md sm:p-6"
        >
          <div className="flex items-center gap-2 text-[var(--oh-primary)]">
            <Package size={20} />
            <span className="text-[13px] font-semibold">Grocery</span>
          </div>
          <h2 className="mt-3 text-[21px] font-semibold leading-snug text-[var(--oh-text)] sm:text-[23px]">
            Recommend beer, spirits, snacks, or soft drinks
          </h2>
          <p className="mt-2 text-[14px] leading-6 text-[var(--oh-muted)]">
            Ask category, budget, and occasion — then pick three in-stock options at different prices.
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--oh-primary)]">
            <Sparkles size={14} /> Find grocery
          </p>
        </Link>

        {showPosAssistant && mobile ? (
          <button
            type="button"
            onClick={() => ai?.openAssistant()}
            className="min-h-12 rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-4 py-3 text-left text-[14px] font-semibold text-[var(--oh-text)] shadow-[var(--oh-shadow-card)] transition hover:border-[var(--oh-primary)]"
          >
            Open POS Assistant
          </button>
        ) : null}
      </div>
    </RecommendShell>
  );
}
