"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, CircleAlert, RefreshCw, ThumbsDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  fetchAiManagerDailyBrief,
  refreshAiManagerDailyBrief,
  sendAiManagerDailyBriefFeedback,
  type AiManagerDailyBrief,
  type AiManagerDailyBriefCard,
} from "@/lib/api";

type FeedbackStatus = "CONFIRMED" | "INVALID" | "RESOLVED";

export function ManagerDailyBriefPanel() {
  const { ready, hasPermission, user } = useAuth();
  const allowed = ready && hasPermission("ai.manager.brief.read");
  const scope = `${user?.vendorId ?? "unknown"}:${user?.outletId ?? "unknown"}`;
  const [briefState, setBriefState] = useState<{ scope: string; value: AiManagerDailyBrief } | null>(null);
  const brief = briefState?.scope === scope ? briefState.value : null;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState<{ scope: string; message: string } | null>(null);
  const error = errorState?.scope === scope ? errorState.message : null;
  const [feedbackState, setFeedbackState] = useState<{ scope: string; values: Record<string, FeedbackStatus> } | null>(null);
  const feedback = feedbackState?.scope === scope ? feedbackState.values : {};
  const chinese = typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh");

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    fetchAiManagerDailyBrief()
      .then((value) => { if (active) { setBriefState({ scope, value }); setFeedbackState({ scope, values: {} }); setErrorState(null); } })
      .catch((cause: unknown) => { if (active) setErrorState({ scope, message: cause instanceof Error ? cause.message : "Could not load the daily brief." }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [allowed, scope]);

  if (!allowed) return null;

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const next = await refreshAiManagerDailyBrief();
      setBriefState({ scope, value: next });
      setFeedbackState({ scope, values: {} });
      setErrorState(null);
    } catch (cause) {
      setErrorState({ scope, message: cause instanceof Error ? cause.message : "Could not refresh the daily brief." });
    } finally {
      setRefreshing(false);
    }
  };

  const submitFeedback = async (card: AiManagerDailyBriefCard, status: FeedbackStatus) => {
    if (!brief) return;
    try {
      await sendAiManagerDailyBriefFeedback(brief.id, card.id, status);
      setFeedbackState((current) => ({
        scope,
        values: { ...(current?.scope === scope ? current.values : {}), [card.id]: status },
      }));
      setErrorState(null);
    } catch (cause) {
      setErrorState({ scope, message: cause instanceof Error ? cause.message : "Could not save feedback." });
    }
  };

  const qualityLabel = brief?.dataQuality.status === "FRESH"
    ? (chinese ? "库存数据新鲜" : "Inventory data fresh")
    : (chinese ? "库存数据需核对" : "Inventory data needs review");

  return (
    <section aria-labelledby="manager-brief-title" className="relative z-10 mx-auto mb-6 w-full max-w-[1080px] border-b border-[var(--oh-border)] pb-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 id="manager-brief-title" className="text-lg font-semibold text-[var(--oh-text)]">
              {chinese ? "每日经营摘要" : "Daily store brief"}
            </h2>
            {brief && <span className="text-xs text-[var(--oh-muted)]">{brief.businessDate} · {brief.timezone} · v{brief.revision}</span>}
          </div>
          {brief && <p className="mt-1 text-sm text-[var(--oh-text-secondary)]">{chinese ? brief.summaryZh : brief.summaryEn}</p>}
          {brief && <p className="mt-1 text-xs text-[var(--oh-muted)]">
            {qualityLabel}
            {brief.dataQuality.productCoverage != null && ` · ${Math.round(brief.dataQuality.productCoverage * 100)}%`}
            {brief.dataAsOf && ` · ${chinese ? "最近库存更新时间" : "Latest stock update"}: ${new Intl.DateTimeFormat(chinese ? "zh-CN" : "en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: brief.timezone }).format(new Date(brief.dataAsOf))}`}
          </p>}
        </div>
        <button type="button" onClick={() => void refresh()} disabled={refreshing || loading} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[var(--oh-border)] bg-[var(--oh-surface-elevated)] px-3 text-sm font-medium text-[var(--oh-text)] hover:bg-[var(--oh-surface)] disabled:cursor-wait disabled:opacity-60">
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          {chinese ? "刷新摘要" : "Refresh brief"}
        </button>
      </header>

      {(loading || (!brief && !error)) && <p role="status" className="mt-3 text-sm text-[var(--oh-muted)]">{chinese ? "正在读取门店数据…" : "Loading store data…"}</p>}
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-rose-700"><CircleAlert size={16} className="mt-0.5 shrink-0" />{error}</p>}
      {brief && brief.cards.length === 0 && !loading && <p className="mt-4 text-sm text-[var(--oh-muted)]">{chinese ? "目前没有发现需要核对的库存或商品资料异常。" : "No inventory or catalogue exceptions need review right now."}</p>}

      {brief && brief.cards.length > 0 && <ul className="mt-4 divide-y divide-[var(--oh-border)] border-y border-[var(--oh-border)]">
        {brief.cards.map((card) => {
          const title = chinese ? card.titleZh : card.titleEn;
          const status = feedback[card.id];
          return <li key={card.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--oh-text)]">{title}{card.productName ? ` · ${card.productName}` : ""}</h3>
                {card.requiresReview && <span className="text-xs font-medium text-amber-800">{chinese ? "需人工核对" : "Review required"}</span>}
              </div>
              <p className="mt-1 text-sm leading-5 text-[var(--oh-text-secondary)]">{chinese ? card.summaryZh : card.summaryEn}</p>
              {Object.keys(card.evidence).length > 0 && <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--oh-muted)]">
                {Object.entries(card.evidence).map(([key, value]) => <div key={key} className="flex gap-1"><dt>{evidenceLabel(key, chinese)}:</dt><dd>{evidenceValue(key, value, chinese)}</dd></div>)}
              </dl>}
              <Link href={card.detailsHref} className="mt-2 inline-flex min-h-9 items-center text-sm font-medium text-[var(--oh-primary)] underline-offset-2 hover:underline">{chinese ? card.actionZh : card.actionEn}</Link>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <button type="button" aria-pressed={status === "CONFIRMED"} onClick={() => void submitFeedback(card, "CONFIRMED")} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${status === "CONFIRMED" ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-[var(--oh-border)] hover:bg-[var(--oh-surface)]"}`}><Check size={14} />{chinese ? "有效" : "Valid"}</button>
              <button type="button" aria-pressed={status === "INVALID"} onClick={() => void submitFeedback(card, "INVALID")} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${status === "INVALID" ? "border-rose-600 bg-rose-50 text-rose-900" : "border-[var(--oh-border)] hover:bg-[var(--oh-surface)]"}`}><ThumbsDown size={14} />{chinese ? "无效" : "Invalid"}</button>
              <button type="button" aria-pressed={status === "RESOLVED"} onClick={() => void submitFeedback(card, "RESOLVED")} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${status === "RESOLVED" ? "border-sky-600 bg-sky-50 text-sky-900" : "border-[var(--oh-border)] hover:bg-[var(--oh-surface)]"}`}><CheckCheck size={14} />{chinese ? "已处理" : "Resolved"}</button>
              {status && <span className="sr-only" role="status">{chinese ? "反馈已记录" : "Feedback recorded"}</span>}
            </div>
          </li>;
        })}
      </ul>}
    </section>
  );
}

function evidenceLabel(key: string, chinese: boolean): string {
  if (chinese) {
    return ({ source: "来源", onHand: "在手库存", recentSalesUnits: "近 7 天销量", status: "数据状态", expectedProducts: "应有商品", capturedProducts: "已采集商品", coverage: "覆盖率", gapDays: "缺失天数", issue: "问题" } as Record<string, string>)[key] ?? key;
  }
  return ({ source: "Source", onHand: "On hand", recentSalesUnits: "Sales, 7d", status: "Data status", expectedProducts: "Expected products", capturedProducts: "Captured products", coverage: "Coverage", gapDays: "Missing days", issue: "Issue" } as Record<string, string>)[key] ?? key;
}

function evidenceValue(key: string, value: unknown, chinese: boolean): string {
  if (key === "source") {
    if (String(value).includes("STOCK_AND_COMPLETED_SALES")) return chinese ? "Orithos 库存和已完成销售" : "Orithos stock and completed sales";
    if (String(value).includes("PRODUCT_COST")) return chinese ? "Orithos 商品成本资料" : "Orithos product cost records";
    if (String(value).includes("PRODUCT_CATALOGUE")) return chinese ? "Orithos 商品目录" : "Orithos product catalogue";
  }
  return String(value);
}
