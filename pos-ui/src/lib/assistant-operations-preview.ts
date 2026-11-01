import type { AssistantResponse, AssistantCard } from "./api";

export type OperationsPreview = "replenishment" | "sales_week";

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
  id: number; name: string; unit?: string; suggestedQuantity: number;
  recommendationStatus: string; leadTimeDays?: number | null;
};
type Plan = {
  products: Product[]; coverageDays: number; reviewRequiredCount: number;
  excludedProductCount?: number; generatedAt: string; company: string;
};
type Sales = {
  period: string; revenue: number; transactions: number; currency: string;
  from: string; to: string; timezone: string; company: string;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
    source: "Odoo", status: "ready",
  };
  let dataAsOf: string | undefined;
  try {
    const response = await fetcher(intent === "replenishment"
      ? "/api/odoo/replenishment" : "/api/odoo/reporting-dashboard?hours=168&period=this_week", {
      method: "GET", credentials: "same-origin", cache: "no-store", signal,
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        card.summary = chinese ? "登录已过期或无权查看，请重新登录或联系管理员。" : "Sign in again or ask your administrator for access to this report.";
        card.retryable = false;
      }
      throw new Error("Business data unavailable");
    }
    if (intent === "replenishment") {
      const plan = await response.json() as Plan;
      if (!Array.isArray(plan.products) || !finite(plan.coverageDays) || !finite(plan.reviewRequiredCount)
        || !plan.generatedAt || !plan.company) throw new Error("Incomplete replenishment response");
      const eligible = plan.products.filter((item) => item.recommendationStatus === "READY"
        && finite(item.suggestedQuantity) && item.suggestedQuantity > 0);
      card.status = plan.reviewRequiredCount > 0 ? "partial" : eligible.length ? "ready" : "empty";
      card.summary = chinese
        ? `${plan.company}：${eligible.length} 个商品有补货建议，覆盖 ${plan.coverageDays} 天。${plan.reviewRequiredCount} 个商品资料需复核，已排除。仅供预览，未创建采购单。`
        : `${plan.company}: ${eligible.length} ${eligible.length === 1 ? "product has" : "products have"} suggestions for ${plan.coverageDays}-day cover. ${plan.reviewRequiredCount} products need data review and are excluded. Preview only; no purchase order created.`;
      if (eligible.some((item) => item.leadTimeDays == null)) {
        card.summary += chinese ? " 部分供应商交期未知，请在采购前核实。" : " Some supplier lead times are unknown; verify before purchasing.";
      }
      if (!eligible.length && plan.reviewRequiredCount > 0) {
        card.summary += chinese ? " 暂无可用数量，不能据此判断无需补货。" : " No eligible quantities are available; this does not mean no replenishment is needed.";
      }
      card.items = eligible.slice(0, 3).map((item) => ({
        id: item.id, label: `${item.name} — ${chinese ? "建议" : "suggested"} ${item.suggestedQuantity} ${item.unit ?? "units"}`,
      }));
      dataAsOf = plan.generatedAt;
    } else {
      const sales = await response.json() as Sales;
      if (sales.period !== "this_week" || !finite(sales.revenue) || !finite(sales.transactions)
        || !sales.from || !sales.to || !sales.timezone || !sales.company || !sales.currency) {
        throw new Error("Incomplete sales response");
      }
      const date = (value: string) => new Intl.DateTimeFormat(chinese ? "zh-CN" : "en-AU", {
        timeZone: sales.timezone, day: "numeric", month: "short", year: "numeric",
      }).format(new Date(`${value.replace(" ", "T")}Z`));
      const amount = new Intl.NumberFormat(chinese ? "zh-CN" : "en-AU", { style: "currency", currency: sales.currency }).format(sales.revenue);
      card.summary = chinese
        ? `${sales.company}：本周净销售额 ${amount}，${sales.transactions} 笔销售。包含已退销售金额，含适用 GST。\n${date(sales.from)} 至 ${date(sales.to)}（${sales.timezone}，截至当前）。`
        : `${sales.company}: net sales ${amount} from ${sales.transactions} sales. Net sales include refunds and applicable GST.\n${date(sales.from)} – ${date(sales.to)} (${sales.timezone}, week to date).`;
      dataAsOf = `${sales.to.replace(" ", "T")}Z`;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    card.status = "unavailable";
    card.retryable ??= true;
    card.summary ??= chinese
      ? "业务数据暂时无法读取，未生成数值。请重试或打开业务页面核查。"
      : "Business data could not be loaded. No figures were generated. Retry or open the business page to check.";
  }
  return {
    threadId: threadId ?? "", intent: intent === "sales_week" ? "report_sales" : "navigate",
    intentSummary: title, answer: card.summary ?? title, slots: {}, ui: null, cards: [card],
    writeRequests: [], source: "Odoo · read-only", dataAsOf, fastPathId: `operations_${intent}`, llmFallback: false,
  };
}
