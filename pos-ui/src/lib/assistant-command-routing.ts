const explicitWriteLanguage = /(?:把|将|改成|设置为|提高|降低|上调|下调|修改|更新|rename|change|update|raise|increase|lower|decrease|客户.*(?:电话|邮箱)|customer.*(?:phone|email))/i;
const quantifiedReplenishmentWrite = /\b(?:replenish|restock)\s+(?:the\s+)?[\p{L}\p{N}-]+\s+(?:to|by|with)\s+\d+|(?:把|将)?[^，。！？\n]{1,24}补货(?:到|至)\s*\d+/iu;

export function looksLikeAssistantWriteCommand(text: string): boolean {
  return explicitWriteLanguage.test(text) || quantifiedReplenishmentWrite.test(text);
}

export const EXPIRY_REVIEW_HREF = "/purchases?tab=expiry-review";
export type ExpiryReviewDateType = "USE_BY" | "BEST_BEFORE";

const expiryReviewNavigation = /^(?:(?:open|show(?: me)?|view) (?:the )?expiry review|(?:查看|打开|显示)临期复核)$/iu;
const expiryReviewStockQuestion = /^(?:(?:which|what|any) (?:(?:batches|products|stock|items) )?(?:are |is )?(?:expiring soon|expires soon|near expiry|expired)|show(?: me)? (?:expired|near-expiry) (?:batches|products|stock|items))$/iu;
const expiryDateQuestion = /^(?:which|what|any) (?:batches|products|stock|items) (?:have|with)\b.*\b(?:use[- ]by|best[- ]before|expiry|expiration)(?: date)?\b.*\b(?:within|next|coming)\b.*\d+ days?$/iu;
const expiryReviewChineseQuestion = /^(?:(?:查看|打开|显示)(?:临期商品|临期批次|临期复核)|(?:临期商品|临期批次|过期商品)(?:有哪些)?|哪些(?:商品|批次)(?:快到期|即将到期|已过期|临期)|(?:快到期|即将到期)的(?:商品|批次))$/u;

export type ExpiryReviewStatus = "all" | "upcoming" | "expired";

export function expiryReviewStatusForQuestion(text: string): ExpiryReviewStatus | null {
  const question = text.trim().replace(/[?？。.!！]+$/u, "").trim();
  if (expiryReviewNavigation.test(question)) return "all";
  if (!expiryReviewStockQuestion.test(question) && !expiryDateQuestion.test(question) && !expiryReviewChineseQuestion.test(question)) return null;
  return /\bexpired\b|过期/iu.test(question) ? "expired" : "upcoming";
}

export function expiryReviewDateTypeForQuestion(text: string): ExpiryReviewDateType | null {
  const question = text.trim().replace(/[?？。.!！]+$/u, "").trim();
  if (!expiryDateQuestion.test(question)) return null;
  return /\bbest[- ]before\b/iu.test(question) ? "BEST_BEFORE" : "USE_BY";
}
