"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertCircle, Lightbulb, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { askAssistant, type AssistantResponse } from "@/lib/api";

type DashboardInsightData = {
  company: string;
  currency: string;
  rangeLabel: string;
  periodBounds: string;
  revenue: number;
  transactions: number;
  refunds: number;
  refundTransactions: number;
  itemsSold: number;
  tax: number;
  openRegisters: number;
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  byCategory: Array<{ name: string; revenue: number; share: number }>;
  compare: {
    revenueDeltaPct: number | null;
    transactionsDeltaPct: number | null;
    itemsSoldDeltaPct: number | null;
    averageSaleDeltaPct: number | null;
  };
  lowStockCount?: number;
};

function compactNumber(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function buildQuestion(data: DashboardInsightData, language: "en" | "zh") {
  const snapshot = {
    store: data.company,
    currency: data.currency,
    period: `${data.rangeLabel}; ${data.periodBounds}`,
    sales: {
      // Shelf/report revenue is tax-inclusive (Shopfront Sales report basis).
      revenueIncludingTax: compactNumber(data.revenue),
      transactions: data.transactions,
      averageSale: compactNumber(data.transactions ? data.revenue / data.transactions : 0),
      itemsSold: data.itemsSold,
      tax: compactNumber(data.tax),
      refunds: compactNumber(data.refunds),
      refundTransactions: data.refundTransactions,
      openRegisters: data.openRegisters,
    },
    changeVsPreviousPeriod: data.compare,
    topProducts: data.topProducts.slice(0, 5).map((item) => ({
      product: item.name,
      units: compactNumber(item.qty),
      revenue: compactNumber(item.revenue),
    })),
    categories: data.byCategory.slice(0, 6).map((item) => ({
      category: item.name,
      revenue: compactNumber(item.revenue),
      share: compactNumber(item.share),
    })),
    lowStockCount: data.lowStockCount ?? null,
  };
  const languageInstruction = language === "zh" ? "用简体中文回答。" : "Answer in English.";
  return `You are analysing the current Orithos POS dashboard for a store manager. ${languageInstruction}
Use only the supplied dashboard snapshot and do not invent missing figures. Give a concise executive readout in this exact structure:
1. Key finding: one sentence.
2. Dimensions: 3-5 bullets covering sales trend/comparison, customer basket or refunds, product/category mix, and inventory when available.
3. Recommended actions: 2-4 specific actions ordered by impact.
4. Data caveat: mention any missing or insufficient data.
Keep currency and percentages explicit. This is read-only analysis; never propose an automatic write or transaction.

Dashboard snapshot (JSON): ${JSON.stringify(snapshot)}`;
}

export function DashboardInsightsPanel({ data }: { data: DashboardInsightData | null }) {
  const [result, setResult] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const language = useMemo<"en" | "zh">(() => {
    if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")) return "zh";
    return "en";
  }, []);

  const analyse = useCallback(async () => {
    if (!data || loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await askAssistant(buildQuestion(data, language), null, undefined, "reports-dashboard"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI insights are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }, [data, language, loading]);

  return (
    <section id="ai-insights" aria-label="AI insights" className="shrink-0 overflow-hidden rounded-lg border border-[var(--oh-border)] bg-white shadow-[var(--oh-shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--oh-border)] px-3 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--oh-orange-light)] text-[var(--oh-primary)]"><Sparkles size={17} aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 className="oh-type-label font-semibold text-[var(--oh-text)]">AI Insights</h2>
            <p className="oh-type-meta mt-0.5 text-[var(--oh-muted)]">Analyse this Dashboard period across sales, products, refunds and stock.</p>
          </div>
        </div>
        <button type="button" onClick={() => void analyse()} disabled={!data || loading} className="oh-type-meta inline-flex min-h-10 items-center gap-1.5 rounded-md bg-[var(--oh-primary)] px-3 font-semibold text-white hover:bg-[var(--oh-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? <LoaderCircle size={15} className="animate-spin" /> : result ? <RefreshCw size={15} /> : <Lightbulb size={15} />}
          {loading ? "Analysing…" : result ? "Refresh insights" : "Analyse dashboard"}
        </button>
      </div>
      <div className="px-3 py-3">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            <span className="flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</span>
            <button type="button" onClick={() => void analyse()} disabled={loading} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 text-xs font-semibold text-red-800 disabled:opacity-60"><RefreshCw size={13} /> Retry</button>
          </div>
        ) : result ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.4fr)]">
            <div className="whitespace-pre-wrap text-sm leading-6 text-[var(--oh-text)]">{result.answer}</div>
            <aside className="rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface)] p-3">
              <p className="oh-type-meta font-semibold uppercase tracking-[.08em] text-[var(--oh-muted)]">Analysis context</p>
              <p className="oh-type-label mt-2 text-[var(--oh-text)]">{data?.rangeLabel}</p>
              <p className="oh-type-meta mt-1 text-[var(--oh-muted)]">{data?.periodBounds}</p>
              <p className="oh-type-meta mt-3 flex items-start gap-1.5 text-[var(--oh-muted)]"><Lightbulb size={14} className="mt-0.5 shrink-0 text-[var(--oh-primary)]" />Read-only suggestions. Confirm actions in the relevant Orithos workflow.</p>
            </aside>
          </div>
        ) : (
          <p className="oh-type-meta flex items-center gap-2 text-[var(--oh-muted)]"><Lightbulb size={15} className="text-[var(--oh-primary)]" />Generate a focused readout and next-step recommendations for the selected period.</p>
        )}
      </div>
    </section>
  );
}
