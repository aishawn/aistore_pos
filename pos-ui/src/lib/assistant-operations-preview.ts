import type { AssistantResponse, AssistantCard } from "./api";
import {
  awaitOperationsPreviewInflight,
  prefetchOperationsPreviews as prefetchSnapshots,
  registerOperationsPreviewInflight,
  staleOperationsPreviewSnapshot,
  storeOperationsPreviewSnapshot,
  warmOperationsPreviewSnapshot,
} from "./assistant-operations-snapshot-cache.ts";
import { OPERATIONS_PREVIEW_CANONICAL, type OperationsPreview } from "./assistant-operations-constants.ts";

export type { OperationsPreview } from "./assistant-operations-constants.ts";

/** Complete catalogue/history reads have a different latency budget from a model reply. */
export function assistantRequestTimeoutMs(question: string): number {
  const intent = operationsPreviewIntent(question);
  return intent === "replenishment" || intent === "opportunities" ? 120_000 : 45_000;
}

export function assistantTimeoutMessage(question: string): string {
  const intent = operationsPreviewIntent(question);
  if (intent === "replenishment") {
    return "The store's replenishment data took too long to load. No quantities were generated and no purchase order was created. Open Replenishment to review the full plan, or retry.";
  }
  if (intent === "sales_week") {
    return "This week's sales data took too long to load. No figures were generated. Open the sales dashboard or retry.";
  }
  if (intent === "opportunities") {
    return "Store opportunities data took too long to load. Open the dashboard or replenishment page to review, or retry.";
  }
  return "The assistant timed out. Please retry, or open the relevant business page to check the data.";
}

/** Deliberately bounded: modified parameters, follow-ups and writes go to the normal workflow. */
export function operationsPreviewIntent(question: string): OperationsPreview | null {
  const text = question.trim().toLowerCase().replace(/[?？。.!！]+$/, "").replace(/\s+/g, " ");
  if (["analyse low stock items and suggest what to reorder", "analyze low stock items and suggest what to reorder",
    "what should i restock", "哪些商品需要补货", "低库存补货建议"].includes(text)) return "replenishment";
  if (["show me this week's sales performance", "show me this week’s sales performance",
    "this week's sales", "本周销售额", "查看本周销售表现"].includes(text)) return "sales_week";
  if (["suggest ways to grow my store", "how can i grow my store", "store growth opportunities",
    "怎么把店做好", "如何把店做好", "增长机会", "店铺增长建议"].includes(text)) return "opportunities";
  return null;
}

type Product = {
  productId: number; name: string; unit?: string; suggestedQuantity: number; daysOfStock?: number | null;
  leadTimeDays?: number | null; caseQuantity?: number | null;
};
export function replenishmentExpectedArrivalDate(
  dataAsOf: string | null | undefined,
  leadTimeDays: number | null | undefined,
  timeZone: string,
): string | null {
  if (!dataAsOf || typeof leadTimeDays !== "number" || !Number.isInteger(leadTimeDays) || leadTimeDays < 0) return null;
  const timestamp = new Date(dataAsOf);
  if (!Number.isFinite(timestamp.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(timestamp);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    if (![year, month, day].every(Number.isInteger)) return null;
    const arrival = new Date(Date.UTC(year, month - 1, day + leadTimeDays));
    return arrival.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function replenishmentItemLabel(
  item: Product,
  chinese: boolean,
  coverageDays: number,
  dataAsOf: string | null | undefined,
  timeZone: string,
): string {
  const quantity = chinese
    ? `建议 ${item.suggestedQuantity} ${item.unit === "units" ? "件" : item.unit ?? "件"}`
    : `suggested ${item.suggestedQuantity} ${item.unit ?? "units"}`;
  const parts = [`${item.name} — ${quantity}`];
  if (finite(item.caseQuantity) && item.caseQuantity > 1) {
    const cases = item.suggestedQuantity / item.caseQuantity;
    const caseSize = new Intl.NumberFormat(chinese ? "zh-CN" : "en-AU", { maximumFractionDigits: 3 })
      .format(item.caseQuantity);
    if (Math.abs(cases - Math.round(cases)) < 0.000001) {
      const roundedCases = Math.round(cases);
      const caseCount = new Intl.NumberFormat(chinese ? "zh-CN" : "en-AU").format(roundedCases);
      parts.push(chinese
        ? `${caseCount} 箱 × 每箱 ${caseSize} 件`
        : `${caseCount} ${roundedCases === 1 ? "case" : "cases"} x ${caseSize} units/case`);
    } else {
      parts.push(chinese ? `箱规每箱 ${caseSize} 件` : `case size ${caseSize} units`);
    }
  }
  if (finite(item.daysOfStock)) {
    const days = new Intl.NumberFormat(chinese ? "zh-CN" : "en-AU", { maximumFractionDigits: 1 })
      .format(item.daysOfStock);
    parts.push(chinese ? `现货约可售 ${days} 天` : `about ${days} days of stock on hand`);
  }
  if (finite(item.leadTimeDays) && item.leadTimeDays > coverageDays) {
    parts.push(chinese ? `按 ${item.leadTimeDays} 天供应商交期计算` : `covers a ${item.leadTimeDays}-day supplier lead time`);
  }
  const leadTimeDays = item.leadTimeDays;
  if (typeof leadTimeDays !== "number" || !Number.isInteger(leadTimeDays) || leadTimeDays < 0) {
    parts.push(chinese ? "供应商交期未记录，到货日未知" : "supplier lead time not recorded; arrival date unknown");
  } else {
    const arrivalDate = replenishmentExpectedArrivalDate(dataAsOf, leadTimeDays, timeZone);
    parts.push(arrivalDate
      ? chinese ? `预计到货 ${arrivalDate}` : `estimated arrival ${arrivalDate}`
      : chinese ? "数据时间或门店时区不可用，到货日未知" : "data timestamp or store timezone unavailable; arrival date unknown");
  }
  return parts.join(" · ");
}
type Plan = {
  top: Product[]; itemsNeedingOrder: number; dataGapCount: number; dataGaps: string[];
  coverageDays: number; dataAsOf?: string | null; dataSource: string; storeScope: string;
  reportPeriodFrom: string; reportPeriodTo: string; reportTimeZone: string; reportDataStatus: string;
  inventoryGapCount?: number; supplierGapCount?: number; costGapCount?: number; actionableItemCount?: number;
};
type OpportunitiesBrief = {
  dataSource: string; storeScope: string; reportPeriodFrom: string; reportPeriodTo: string;
  reportTimeZone: string; reportDataStatus: string; dataAsOf?: string | null;
  sales: { revenue?: string | null; transactions: number; currency: string; reportDataStatus: string; dataAsOf?: string | null };
  replenishment: {
    coverageDays: number; itemsNeedingOrder: number; actionableItemCount: number;
    dataGapCount: number; inventoryGapCount: number; supplierGapCount: number; costGapCount?: number;
    top: Product[]; reportDataStatus: string; dataAsOf?: string | null;
    reportPeriodFrom?: string; reportPeriodTo?: string; reportTimeZone?: string;
  };
};
type Sales = {
  period: string; revenue: number; transactions: number; currency: string;
  from: string; to: string; timezone: string; dataSource: string; dataAsOf?: string | null;
  storeScope: string; reportDataStatus: string;
};

class PreviewReadError extends Error {
  readonly retryable: boolean;
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.retryable = status !== 401 && status !== 403;
  }
}

function finite(value: unknown): value is number {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed);
  }
  return false;
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}


function purchaseCostGapDetails(count: number | undefined, chinese: boolean): string {
  if (!count || count < 1) return "";
  if (chinese) return `另有 ${count} 个商品缺少有效采购成本。`;
  return count === 1
    ? " 1 product lacks a recorded purchase cost."
    : ` ${count} products lack a recorded purchase cost.`;
}

async function readReplenishmentPlan(fetcher: typeof fetch, signal?: AbortSignal): Promise<Plan> {
  const response = await fetcher("/api/ai/assistant/replenishment-report", {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new PreviewReadError("Business data unavailable", response.status);
  const body = await response.json() as {
    code?: number;
    message?: string;
    data?: {
      top?: Product[];
      itemsNeedingOrder?: number;
      dataGapCount?: number;
      dataGaps?: string[];
      inventoryGapCount?: number;
      supplierGapCount?: number;
      costGapCount?: number;
      coverageDays?: number;
      dataAsOf?: string | null;
      dataSource?: string;
      storeScope?: string;
      reportPeriodFrom?: string;
      reportPeriodTo?: string;
      reportTimeZone?: string;
      reportDataStatus?: string;
      actionableItemCount?: number;
    };
  };
  if (body.code != null && body.code !== 0) {
    const status = response.status === 401 || response.status === 403
      ? response.status
      : body.code === 40300 || body.code === 40310 ? 403
        : body.code >= 50000 ? 503 : response.status;
    throw new PreviewReadError(body.message ?? "Business data unavailable", status);
  }
  const plan = body.data;
  if (!plan || !Array.isArray(plan.top) || !finite(plan.itemsNeedingOrder) || !finite(plan.dataGapCount)
    || !finite(plan.coverageDays) || !plan.dataSource || !plan.reportPeriodFrom
    || !plan.reportPeriodTo || !plan.reportTimeZone || !plan.reportDataStatus || !Array.isArray(plan.dataGaps)) {
    throw new Error("Incomplete replenishment response");
  }
  return {
    ...plan,
    itemsNeedingOrder: asNumber(plan.itemsNeedingOrder),
    dataGapCount: asNumber(plan.dataGapCount),
    coverageDays: asNumber(plan.coverageDays),
    storeScope: plan.storeScope ?? "current_authenticated_store",
    actionableItemCount: finite(plan.actionableItemCount) ? asNumber(plan.actionableItemCount) : asNumber(plan.itemsNeedingOrder),
  } as Plan;
}

async function readStoreOpportunitiesBrief(fetcher: typeof fetch, signal?: AbortSignal): Promise<OpportunitiesBrief> {
  const response = await fetcher("/api/ai/assistant/store-opportunities-brief", {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new PreviewReadError("Business data unavailable", response.status);
  const body = await response.json() as { code?: number; message?: string; data?: OpportunitiesBrief };
  if (body.code != null && body.code !== 0) {
    const status = response.status === 401 || response.status === 403
      ? response.status
      : body.code === 40300 || body.code === 40310 ? 403
        : body.code >= 50000 ? 503 : response.status;
    throw new PreviewReadError(body.message ?? "Business data unavailable", status);
  }
  const brief = body.data;
  if (!brief?.sales || !brief.replenishment || !brief.dataSource || !brief.reportPeriodFrom
    || !brief.reportPeriodTo || !brief.reportTimeZone || !brief.reportDataStatus) {
    throw new Error("Incomplete opportunities response");
  }
  return {
    ...brief,
    storeScope: brief.storeScope ?? "current_authenticated_store",
    replenishment: {
      ...brief.replenishment,
      top: Array.isArray(brief.replenishment.top) ? brief.replenishment.top : [],
    },
  };
}

function parseCurrencyAmount(revenue: string | number | null | undefined): number | null {
  if (revenue == null) return null;
  if (typeof revenue === "number" && Number.isFinite(revenue)) return revenue;
  const digits = String(revenue).replace(/[^0-9.-]+/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readWeekSales(fetcher: typeof fetch, signal?: AbortSignal): Promise<Sales> {
  const response = await fetcher("/api/reports/native-overview?period=this_week", {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new PreviewReadError("Business data unavailable", response.status);
  const body = await response.json() as {
    data?: {
      source?: string; revenue?: unknown; transactions?: unknown; from?: string; to?: string;
      timeZone?: string; dataAsOf?: string | null; dataSource?: string; storeScope?: string;
      reportPeriodFrom?: string; reportPeriodTo?: string; reportTimeZone?: string; reportDataStatus?: string;
    };
  };
  const row = body.data;
  const dataSource = row?.dataSource ?? row?.source;
  const reportPeriodFrom = row?.reportPeriodFrom ?? row?.from;
  const reportPeriodTo = row?.reportPeriodTo ?? row?.to;
  const reportTimeZone = row?.reportTimeZone ?? row?.timeZone;
  const reportDataStatus = row?.reportDataStatus;
  if (!row || dataSource !== "orithos_ledger" || !finite(row.revenue) || !finite(row.transactions)
    || !reportPeriodFrom || !reportPeriodTo || !reportTimeZone || !reportDataStatus) {
    throw new Error("Incomplete sales response");
  }
  return {
    period: "this_week",
    revenue: asNumber(row.revenue),
    transactions: asNumber(row.transactions),
    currency: "AUD",
    from: reportPeriodFrom,
    to: reportPeriodTo,
    timezone: reportTimeZone,
    dataSource,
    storeScope: row.storeScope ?? "current_authenticated_store",
    reportDataStatus,
    dataAsOf: row.dataAsOf,
  };
}

function previewUnavailableSummary(
  intent: OperationsPreview,
  error: unknown,
  chinese: boolean,
): string {
  if (error instanceof PreviewReadError && error.status === 401) {
    return chinese
      ? intent === "sales_week"
        ? "登录已过期，请重新登录后再查看销售数据。"
        : "登录已过期，请重新登录后再查看补货数据。"
      : intent === "sales_week"
        ? "Your session has expired. Sign in again to view sales data."
        : "Your session has expired. Sign in again to view replenishment data.";
  }
  if (error instanceof PreviewReadError && error.status === 403) {
    return chinese
      ? intent === "sales_week"
        ? "当前账号没有权限查看销售报表，请联系管理员检查门店权限。"
        : "当前账号没有权限查看补货数据，请联系管理员检查门店权限。"
      : intent === "sales_week"
        ? "You do not have permission to view sales reports. Ask an administrator to check store access."
        : "You do not have permission to view replenishment data. Ask an administrator to check store access.";
  }
  if (intent === "opportunities") {
    return chinese
      ? "门店机会数据暂时不可用。请稍后重试，或打开仪表盘和补货页面核对。"
      : "The store opportunities service is temporarily unavailable. Retry shortly or open the dashboard and replenishment pages to check.";
  }
  return chinese
    ? intent === "sales_week"
      ? "销售查询服务暂时不可用，未生成金额。请稍后重试或打开销售报表核查。"
      : "补货查询服务暂时不可用，未生成数量或金额。请稍后重试或打开补货页面核查。"
    : intent === "sales_week"
      ? "The sales query service is temporarily unavailable. No figures were generated. Retry shortly or open the sales dashboard to check."
      : "The replenishment query service is temporarily unavailable. No figures were generated. Retry shortly or open Replenishment to check.";
}

function withThreadId(response: AssistantResponse, threadId?: string | null): AssistantResponse {
  return threadId ? { ...response, threadId } : response;
}

function backgroundRefreshOperationsPreview(
  question: string,
  threadId: string | null | undefined,
  fetcher: typeof fetch,
) {
  const intent = operationsPreviewIntent(question);
  if (!intent) return;
  const task = buildLiveOperationsPreview(question, threadId, undefined, fetcher).then((result) => {
    storeOperationsPreviewSnapshot(intent, result);
    return result;
  });
  registerOperationsPreviewInflight(intent, task);
}

/** Warms replenishment and sales-week snapshots for the authenticated store session. */
export function prefetchOperationsPreviewSnapshots(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  prefetchSnapshots(
    (question, prefetchSignal) => buildLiveOperationsPreview(question, null, prefetchSignal ?? signal, fetcher),
    signal,
  );
}

/** Uses the same tenant/session-scoped read endpoints as the business pages. Never sends a write. */
async function buildLiveOperationsPreview(
  question: string, threadId?: string | null, signal?: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<AssistantResponse> {
  const intent = operationsPreviewIntent(question);
  if (!intent) throw new Error("preview intent required");
  const chinese = /[\u3400-\u9fff]/.test(question);
  if (intent === "opportunities") {
    try {
      const brief = await readStoreOpportunitiesBrief(fetcher, signal);
      const revenueAmount = parseCurrencyAmount(brief.sales.revenue);
      const revenueText = revenueAmount == null
        ? (brief.sales.revenue ?? (chinese ? "暂无" : "n/a"))
        : new Intl.NumberFormat(chinese ? "zh-CN" : "en-AU", {
          style: "currency", currency: brief.sales.currency || "AUD",
        }).format(revenueAmount);
      const eligible = brief.replenishment.top.filter((item) => finite(item.suggestedQuantity) && item.suggestedQuantity > 0);
      const gapDetails = (chinese
        ? `${brief.replenishment.inventoryGapCount} 个商品的库存需核对，${brief.replenishment.supplierGapCount} 个商品缺少供应商资料。`
        : `${brief.replenishment.inventoryGapCount} products need inventory review; ${brief.replenishment.supplierGapCount} lack supplier details.`) + purchaseCostGapDetails(brief.replenishment.costGapCount, chinese);
      const salesCard: AssistantCard = {
        type: "sales",
        title: chinese ? "本周销售" : "This week's sales",
        ctaRoute: "/reports/dashboard",
        ctaLabel: chinese ? "打开销售报表" : "Open sales dashboard",
        status: brief.sales.reportDataStatus === "no_data" ? "empty"
          : brief.sales.reportDataStatus === "incomplete" ? "partial" : "ready",
        summary: chinese
          ? `本周净销售额 ${revenueText}，${brief.sales.transactions} 笔交易（Orithos 账本）。`
          : `Net sales ${revenueText} from ${brief.sales.transactions} transactions (Orithos ledger).`,
        dataSource: brief.dataSource,
        storeScope: brief.storeScope,
        reportPeriodFrom: brief.reportPeriodFrom,
        reportPeriodTo: brief.reportPeriodTo,
        reportTimeZone: brief.reportTimeZone,
        reportDataStatus: brief.sales.reportDataStatus,
        dataAsOf: brief.sales.dataAsOf ?? undefined,
      };
      const replenishmentStatus = brief.replenishment.reportDataStatus === "no_data" ? "unavailable"
        : brief.replenishment.dataGapCount > 0 ? "partial"
          : eligible.length ? "ready" : "empty";
      const replenishmentTimeZone = brief.replenishment.reportTimeZone ?? brief.reportTimeZone;
      const topSummary = eligible.slice(0, 3).map((item) => `• ${replenishmentItemLabel(
        item, chinese, brief.replenishment.coverageDays, brief.replenishment.dataAsOf, replenishmentTimeZone,
      )}`).join("\n");
      const replenishmentCard: AssistantCard = {
        type: "replenishment",
        title: chinese ? "补货机会" : "Restock opportunities",
        ctaRoute: "/purchases?tab=replenishment",
        ctaLabel: chinese ? "查看补货" : "Review replenishment",
        status: replenishmentStatus,
        supplierGapCount: brief.replenishment.supplierGapCount,
        inventoryGapCount: brief.replenishment.inventoryGapCount,
        actionableItemCount: brief.replenishment.actionableItemCount,
        summary: chinese
          ? `${topSummary ? `优先补货：\n${topSummary}\n\n` : ""}全店扫描：${brief.replenishment.actionableItemCount} 个 SKU 有建议量（${brief.replenishment.dataGapCount} 个需核对资料，暂未纳入）。${gapDetails}`
          : `${topSummary ? `Top restock picks:\n${topSummary}\n\n` : ""}Store-wide scan: ${brief.replenishment.actionableItemCount} SKUs have suggested order (${brief.replenishment.dataGapCount} excluded for data review). ${gapDetails}`,
        items: eligible.slice(0, 3).map((item) => ({
          id: item.productId,
          label: replenishmentItemLabel(
            item, chinese, brief.replenishment.coverageDays, brief.replenishment.dataAsOf, replenishmentTimeZone,
          ),
        })),
        dataSource: brief.dataSource,
        storeScope: brief.storeScope,
        reportPeriodFrom: brief.replenishment.reportPeriodFrom,
        reportPeriodTo: brief.replenishment.reportPeriodTo,
        reportTimeZone: brief.replenishment.reportTimeZone,
        reportDataStatus: brief.replenishment.reportDataStatus,
        dataAsOf: brief.replenishment.dataAsOf ?? undefined,
      };
      const overviewCard: AssistantCard = {
        type: "opportunities",
        title: chinese ? "门店增长建议" : "Store growth opportunities",
        ctaRoute: "/dashboard",
        ctaLabel: chinese ? "打开仪表盘" : "Open dashboard",
        status: brief.reportDataStatus === "no_data" ? "empty"
          : brief.reportDataStatus === "incomplete" ? "partial" : "ready",
        summary: chinese
          ? "基于本周销售与补货预览：先巩固畅销品补货，再在仪表盘查看品类表现与定价复核。"
          : "Based on this week's sales and replenishment preview: restock top movers first, then review category performance and pricing on the dashboard.",
        dataSource: brief.dataSource,
        storeScope: brief.storeScope,
        reportPeriodFrom: brief.reportPeriodFrom,
        reportPeriodTo: brief.reportPeriodTo,
        reportTimeZone: brief.reportTimeZone,
        reportDataStatus: brief.reportDataStatus,
        dataAsOf: brief.dataAsOf ?? undefined,
      };
      const restockFrom = brief.replenishment.reportPeriodFrom;
      const restockTo = brief.replenishment.reportPeriodTo;
      const restockZone = brief.replenishment.reportTimeZone;
      const period = restockFrom && restockTo && restockZone
        ? chinese
          ? `补货分析期间：${restockFrom} 至 ${restockTo}（${restockZone}）。`
          : `Replenishment period: ${restockFrom} to ${restockTo} (${restockZone}). `
        : "";
      const answer = chinese
        ? `本周销售 ${revenueText}（${brief.sales.transactions} 笔）；${brief.replenishment.actionableItemCount} 个 SKU 有补货建议。${period}打开下方卡片继续核对。`
        : `This week: net sales ${revenueText} (${brief.sales.transactions} transactions); ${brief.replenishment.actionableItemCount} SKUs have replenishment suggestions. ${period}Use the cards below to review.`;
      return {
        threadId: threadId ?? "",
        intent: "navigate",
        intentSummary: overviewCard.title,
        answer,
        slots: {},
        ui: null,
        cards: [overviewCard, salesCard, replenishmentCard],
        writeRequests: [],
        source: "deterministic",
        llmFallback: false,
        dataSource: brief.dataSource,
        storeScope: brief.storeScope,
        fastPathId: "operations_opportunities",
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      const retryable = error instanceof PreviewReadError ? error.retryable : true;
      const fallback: AssistantCard = {
        type: "opportunities",
        title: chinese ? "门店增长建议" : "Store growth opportunities",
        status: "unavailable",
        retryable,
        summary: previewUnavailableSummary("opportunities", error, chinese),
        ctaRoute: "/dashboard",
        ctaLabel: chinese ? "打开仪表盘" : "Open dashboard",
      };
      return {
        threadId: threadId ?? "",
        intent: "navigate",
        intentSummary: fallback.title,
        answer: fallback.summary ?? "",
        slots: {},
        ui: null,
        cards: [fallback],
        writeRequests: [],
        source: "deterministic",
        llmFallback: false,
        fastPathId: "operations_opportunities",
      };
    }
  }
  const route = intent === "replenishment" ? "/purchases?tab=replenishment" : "/reports/dashboard";
  const title = intent === "replenishment" ? "Replenishment suggestions" : "This week's sales";
  const card: AssistantCard = {
    type: intent === "replenishment" ? "replenishment" : "sales",
    title, ctaRoute: route,
    ctaLabel: intent === "replenishment" ? "Review replenishment" : "Open sales dashboard",
    status: "ready",
  };
  let dataAsOf: string | undefined;
  let dataSource: string | undefined;
  let storeScope: string | undefined;
  let reportPeriodFrom: string | undefined;
  let reportPeriodTo: string | undefined;
  let reportTimeZone: string | undefined;
  let reportDataStatus: string | undefined;
  try {
    if (intent === "replenishment") {
      const plan = await readReplenishmentPlan(fetcher, signal);
      dataAsOf = plan.dataAsOf ?? undefined;
      dataSource = plan.dataSource;
      storeScope = plan.storeScope;
      reportPeriodFrom = plan.reportPeriodFrom;
      reportPeriodTo = plan.reportPeriodTo;
      reportTimeZone = plan.reportTimeZone;
      reportDataStatus = plan.reportDataStatus;
      card.source = plan.dataSource;
      card.dataSource = plan.dataSource;
      card.storeScope = plan.storeScope;
      card.reportPeriodFrom = plan.reportPeriodFrom;
      card.reportPeriodTo = plan.reportPeriodTo;
      card.reportTimeZone = plan.reportTimeZone;
      card.reportDataStatus = plan.reportDataStatus;
      card.dataAsOf = plan.dataAsOf ?? undefined;
      card.generatedAt = plan.dataAsOf ?? undefined;
      const eligible = plan.top.filter((item) => finite(item.suggestedQuantity) && item.suggestedQuantity > 0);
      const hasNoData = plan.reportDataStatus === "no_data";
      card.status = hasNoData ? "unavailable"
        : plan.dataGapCount > 0 ? "partial" : eligible.length ? "ready" : "empty";
      if (hasNoData) card.retryable = false;
      const analysisPeriod = `${plan.reportPeriodFrom} to ${plan.reportPeriodTo} (${plan.reportTimeZone})`;
      card.supplierGapCount = plan.supplierGapCount;
      card.inventoryGapCount = plan.inventoryGapCount;
      card.actionableItemCount = plan.actionableItemCount ?? plan.itemsNeedingOrder;
      const gapDetails = (plan.inventoryGapCount != null || plan.supplierGapCount != null
        ? chinese
          ? `${plan.inventoryGapCount ?? 0} 个商品的库存需核对，${plan.supplierGapCount ?? 0} 个商品缺少供应商资料。`
          : `${plan.inventoryGapCount ?? 0} products need inventory review; ${plan.supplierGapCount ?? 0} lack supplier details.`
        : chinese
          ? `${plan.dataGapCount} 个商品因资料不完整被排除。`
          : `${plan.dataGapCount} products were excluded for incomplete data.`) + purchaseCostGapDetails(plan.costGapCount, chinese);
      const topSummary = eligible.slice(0, 3).map((item) => `• ${replenishmentItemLabel(
        item, chinese, plan.coverageDays, plan.dataAsOf, plan.reportTimeZone,
      )}`).join("\n");
      const scanLine = chinese
        ? `全店扫描（销售期间 ${analysisPeriod}）：${plan.actionableItemCount ?? plan.itemsNeedingOrder} 个 SKU 有建议量（覆盖 ${plan.coverageDays} 天）${plan.dataGapCount > 0 ? `；${plan.dataGapCount} 个需核对资料，暂未纳入` : ""}。`
        : `Store-wide scan (sales period ${analysisPeriod}): ${plan.actionableItemCount ?? plan.itemsNeedingOrder} SKUs have suggested order (${plan.coverageDays}d cover)${plan.dataGapCount > 0 ? `; ${plan.dataGapCount} excluded for data review` : ""}.`;
      card.summary = chinese
        ? hasNoData
          ? `所选销售期间 ${analysisPeriod} 没有可验证的销售历史，未生成补货数量。`
          : plan.dataGapCount > 0 && topSummary
            ? `优先补货：\n${topSummary}\n\n${scanLine}\n${gapDetails}`
            : `${analysisPeriod} 销售数据对应的补货预览：${scanLine} ${gapDetails}`
        : hasNoData
          ? `No verifiable sales history is available for ${analysisPeriod}; no replenishment quantities were generated.`
          : plan.dataGapCount > 0 && topSummary
            ? `Top restock picks:\n${topSummary}\n\n${scanLine} ${gapDetails}`
            : `Replenishment preview for ${analysisPeriod}: ${scanLine} ${gapDetails}`;
      if (plan.reportDataStatus === "incomplete" && !plan.dataGapCount) {
        card.summary += chinese ? " 报表数据不完整，请人工复核。" : " Report data is incomplete; review manually.";
      }
      const negativeStockSuffix = ": negative stock; stock reconciliation needed";
      const negativeStockExamples = plan.dataGaps
        .filter((gap) => gap.endsWith(negativeStockSuffix))
        .slice(0, 3)
        .map((gap) => gap.slice(0, -negativeStockSuffix.length));
      if (negativeStockExamples.length > 0) {
        card.summary += chinese
          ? "\n负库存优先复核：" + negativeStockExamples.join("、")
          : "\nNegative stock to review: " + negativeStockExamples.join(", ");
      }
      if (!eligible.length && plan.dataGapCount > 0 && !hasNoData) {
        card.summary += chinese ? " 暂无可用数量，不能据此判断无需补货。" : " No eligible quantities are available; this does not mean no replenishment is needed.";
      }
      card.items = eligible.slice(0, 3).map((item) => ({
        id: item.productId,
        label: replenishmentItemLabel(item, chinese, plan.coverageDays, plan.dataAsOf, plan.reportTimeZone),
      }));
    } else {
      const sales = await readWeekSales(fetcher, signal);
      if (sales.period !== "this_week" || !finite(sales.revenue) || !finite(sales.transactions)
        || !sales.from || !sales.to || !sales.timezone || !sales.dataSource || !sales.currency) {
        throw new Error("Incomplete sales response");
      }
      dataAsOf = sales.dataAsOf ?? undefined;
      dataSource = sales.dataSource;
      storeScope = sales.storeScope;
      reportPeriodFrom = sales.from.slice(0, 10);
      reportPeriodTo = sales.to.slice(0, 10);
      reportTimeZone = sales.timezone;
      reportDataStatus = sales.reportDataStatus;
      card.source = sales.dataSource;
      card.dataSource = sales.dataSource;
      card.storeScope = sales.storeScope;
      card.reportPeriodFrom = sales.from.slice(0, 10);
      card.reportPeriodTo = sales.to.slice(0, 10);
      card.reportTimeZone = sales.timezone;
      card.reportDataStatus = sales.reportDataStatus;
      card.dataAsOf = sales.dataAsOf ?? undefined;
      card.generatedAt = sales.dataAsOf ?? undefined;
      if (sales.reportDataStatus === "no_data") {
        card.status = "empty";
        card.emptyReason = "No sales rows returned for this period";
        card.summary = chinese
          ? `報表期间 ${sales.from} 至 ${sales.to} 没有销售记录；不显示金额。`
          : `No sales rows were returned for ${sales.from} to ${sales.to}; no amount is shown.`;
        return {
          threadId: threadId ?? "", intent: "report_sales", intentSummary: title,
          answer: card.summary, slots: {}, ui: null, cards: [card], writeRequests: [],
          source: "deterministic", llmFallback: false, dataAsOf, dataSource,
          storeScope: sales.storeScope, reportPeriodFrom, reportPeriodTo, reportTimeZone, reportDataStatus,
          fastPathId: `operations_${intent}`,
        };
      }
      const date = (value: string) => new Intl.DateTimeFormat(chinese ? "zh-CN" : "en-AU", {
        timeZone: "UTC", day: "numeric", month: "short", year: "numeric",
      }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
      const amount = new Intl.NumberFormat(chinese ? "zh-CN" : "en-AU", { style: "currency", currency: sales.currency }).format(sales.revenue);
      card.summary = chinese
        ? `Orithos：本周净销售额 ${amount}，${sales.transactions} 笔销售。包含已退销售金额，含适用 GST。\n${date(sales.from)} 至 ${date(sales.to)}（${sales.timezone}）。`
        : `Orithos: net sales ${amount} from ${sales.transactions} sales. Net sales include refunds and applicable GST.\n${date(sales.from)} – ${date(sales.to)} (${sales.timezone}).`;
      card.status = sales.reportDataStatus === "incomplete" ? "partial" : "ready";
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    card.status = "unavailable";
    const retryable = error instanceof PreviewReadError ? error.retryable : true;
    card.retryable ??= retryable;
    card.summary ??= previewUnavailableSummary(intent, error, chinese);
  }
  return {
    threadId: threadId ?? "", intent: intent === "sales_week" ? "report_sales" : "navigate",
    intentSummary: title, answer: card.summary ?? title, slots: {}, ui: null, cards: [card],
    writeRequests: [], source: "deterministic", dataAsOf, dataSource,
    storeScope, reportPeriodFrom, reportPeriodTo, reportTimeZone, reportDataStatus,
    fastPathId: `operations_${intent}`, llmFallback: false,
  };
}

/** Uses the same tenant/session-scoped read endpoints as the business pages. Never sends a write. */
export async function readOperationsPreview(
  question: string, threadId?: string | null, signal?: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<AssistantResponse | null> {
  const intent = operationsPreviewIntent(question);
  if (!intent) return null;
  const chinese = /[\u3400-\u9fff]/.test(question);
  const warm = warmOperationsPreviewSnapshot(intent);
  if (warm && !signal?.aborted) {
    backgroundRefreshOperationsPreview(OPERATIONS_PREVIEW_CANONICAL[intent], threadId, fetcher);
    return withThreadId(warm, threadId);
  }
  await awaitOperationsPreviewInflight(intent);
  const live = await buildLiveOperationsPreview(question, threadId, signal, fetcher);
  if (live.cards?.[0]?.status !== "unavailable") {
    storeOperationsPreviewSnapshot(intent, live);
    return live;
  }
  const stale = staleOperationsPreviewSnapshot(intent, chinese);
  return stale ? withThreadId(stale, threadId) : live;
}

export function operationsPreviewCanonicalQuestion(intent: OperationsPreview): string {
  return OPERATIONS_PREVIEW_CANONICAL[intent];
}
