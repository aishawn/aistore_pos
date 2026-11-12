import type { AssistantResponse, AssistantCard } from "./api";
import { storeWeekStart } from "./assistant-business-period.ts";

export type OperationsPreview = "replenishment" | "sales_week";

/** Complete catalogue/history reads have a different latency budget from a model reply. */
export function assistantRequestTimeoutMs(question: string): number {
  return operationsPreviewIntent(question) === "replenishment" ? 120_000 : 45_000;
}

export function assistantTimeoutMessage(question: string): string {
  if (operationsPreviewIntent(question) === "replenishment") {
    return "The store's replenishment data took too long to load. No quantities were generated and no purchase order was created. Open Replenishment to review the full plan, or retry.";
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
  return null;
}

type Product = {
  productId: number; name: string; unit?: string; suggestedQuantity: number; daysOfStock?: number | null;
};
type Plan = {
  top: Product[]; itemsNeedingOrder: number; dataGapCount: number; dataGaps: string[];
  coverageDays: number; dataAsOf?: string | null; dataSource: string; storeScope: string;
  reportPeriodFrom: string; reportPeriodTo: string; reportTimeZone: string; reportDataStatus: string;
};
type Sales = {
  period: string; revenue: number; transactions: number; currency: string;
  from: string; to: string; timezone: string; dataSource: string; dataAsOf?: string | null;
  storeScope: string; reportDataStatus: string;
};

class PreviewReadError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function storeDay(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function readReplenishmentPlan(fetcher: typeof fetch, signal?: AbortSignal): Promise<Plan> {
  const response = await fetcher("/api/ai/assistant/replenishment-report", {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new PreviewReadError("Business data unavailable", response.status !== 401 && response.status !== 403);
  const body = await response.json() as {
    data?: {
      top?: Product[];
      itemsNeedingOrder?: number;
      dataGapCount?: number;
      dataGaps?: string[];
      coverageDays?: number;
      dataAsOf?: string | null;
      dataSource?: string;
      storeScope?: string;
      reportPeriodFrom?: string;
      reportPeriodTo?: string;
      reportTimeZone?: string;
      reportDataStatus?: string;
    };
  };
  const plan = body.data;
  if (!plan || !Array.isArray(plan.top) || !finite(plan.itemsNeedingOrder) || !finite(plan.dataGapCount)
    || !finite(plan.coverageDays) || !plan.dataSource || !plan.storeScope || !plan.reportPeriodFrom
    || !plan.reportPeriodTo || !plan.reportTimeZone || !plan.reportDataStatus || !Array.isArray(plan.dataGaps)) {
    throw new Error("Incomplete replenishment response");
  }
  return plan as Plan;
}

async function readWeekSales(fetcher: typeof fetch, signal?: AbortSignal): Promise<Sales> {
  const timezone = "Australia/Adelaide";
  const today = storeDay(timezone);
  const weekStart = storeWeekStart(new Date(), timezone);
  const from = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(weekStart);
  const params = new URLSearchParams({ from, to: today });
  const response = await fetcher(`/api/reports/native-overview?${params}`, {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new PreviewReadError("Business data unavailable", response.status !== 401 && response.status !== 403);
  const body = await response.json() as {
    data?: {
      source?: string; revenue?: number; transactions?: number; from?: string; to?: string;
      timeZone?: string; dataAsOf?: string | null; dataSource?: string; storeScope?: string;
      reportPeriodFrom?: string; reportPeriodTo?: string; reportTimeZone?: string; reportDataStatus?: string;
    };
  };
  if (!body.data || body.data.dataSource !== "orithos_ledger" || !finite(body.data.revenue) || !finite(body.data.transactions)
    || !body.data.reportPeriodFrom || !body.data.reportPeriodTo || !body.data.reportTimeZone
    || !body.data.storeScope || !body.data.reportDataStatus) {
    throw new Error("Incomplete sales response");
  }
  return {
    period: "this_week",
    revenue: Number(body.data.revenue),
    transactions: Number(body.data.transactions),
    currency: "AUD",
    from: body.data.reportPeriodFrom,
    to: body.data.reportPeriodTo,
    timezone: body.data.reportTimeZone,
    dataSource: body.data.dataSource,
    storeScope: body.data.storeScope,
    reportDataStatus: body.data.reportDataStatus,
    dataAsOf: body.data.dataAsOf,
  };
}

/** Uses the same tenant/session-scoped read endpoints as the business pages. Never sends a write. */
export async function readOperationsPreview(
  question: string, threadId?: string | null, signal?: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<AssistantResponse | null> {
  const intent = operationsPreviewIntent(question);
  if (!intent) return null;
  const chinese = /[\u3400-\u9fff]/.test(question);
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
      card.summary = chinese
        ? hasNoData
          ? `所选销售期间 ${analysisPeriod} 没有可验证的销售历史，未生成补货数量。`
          : `${analysisPeriod} 销售数据对应的补货预览：目标覆盖 ${plan.coverageDays} 天，${plan.itemsNeedingOrder} 个商品有建议数量。${plan.dataGapCount} 个商品因资料不完整被排除。`
        : hasNoData
          ? `No verifiable sales history is available for ${analysisPeriod}; no replenishment quantities were generated.`
          : `Replenishment preview for ${analysisPeriod}: ${plan.itemsNeedingOrder} products need order for ${plan.coverageDays}d cover. ${plan.dataGapCount} products were excluded for incomplete data.`;
      if (plan.reportDataStatus === "incomplete" && !plan.dataGapCount) {
        card.summary += chinese ? " 报表数据不完整，请人工复核。" : " Report data is incomplete; review manually.";
      }
      if (!eligible.length && plan.dataGapCount > 0 && !hasNoData) {
        card.summary += chinese ? " 暂无可用数量，不能据此判断无需补货。" : " No eligible quantities are available; this does not mean no replenishment is needed.";
      }
      card.items = eligible.slice(0, 3).map((item) => ({
        id: item.productId, label: `${item.name} — ${chinese ? "建议" : "suggested"} ${item.suggestedQuantity} ${item.unit ?? "units"}`,
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
    card.summary ??= !retryable
      ? chinese ? "登录已过期或无权查看，请重新登录或联系管理员。" : "Sign in again or ask your administrator for access."
      : chinese
        ? "业务数据暂时无法读取，未生成数值。请重试或打开业务页面核查。"
        : "Business data could not be loaded. No figures were generated. Retry or open the business page to check.";
  }
  return {
    threadId: threadId ?? "", intent: intent === "sales_week" ? "report_sales" : "navigate",
    intentSummary: title, answer: card.summary ?? title, slots: {}, ui: null, cards: [card],
    writeRequests: [], source: "deterministic", dataAsOf, dataSource,
    storeScope, reportPeriodFrom, reportPeriodTo, reportTimeZone, reportDataStatus,
    fastPathId: `operations_${intent}`, llmFallback: false,
  };
}
