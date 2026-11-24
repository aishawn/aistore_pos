package com.orithos.modules.ai.pricing;

import com.orithos.modules.ai.AssistantDisplayText;
import com.orithos.modules.ai.report.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Builds a short in-chat price-review summary so navigate intents return
 * suggestion-aware text plus a CTA instead of a bare page jump.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class PricingChatBrief {

    private static final Pattern PRODUCT_PRICE_QUESTION = Pattern.compile(
            "^(?:what is a fair price for|what should (?:i|we) charge for|how much should (?:i|we) charge for|suggest(?: a)? price for)\\s+(.+?)[?.!]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Logger log = LoggerFactory.getLogger(PricingChatBrief.class);

    private final NativePriceSuggestionService client;

    public PricingChatBrief(NativePriceSuggestionService client) {
        this.client = client;
    }

    public String brief(String question, TenantContext tenant) {
        boolean chinese = isChinese(question);
        if (tenant == null) {
            log.warn("Price review brief unavailable: tenant context is missing");
            return unavailableMessage(question);
        }
        try {
            String productSearch = productSearch(question);
            PriceReviewBrief review = productSearch == null
                    ? client.review(tenant) : client.review(tenant, productSearch);
            if (review == null) {
                log.warn("Price review brief unavailable: outlet missing or cost permission denied");
                return unavailableMessage(question);
            }
            if (review.top() == null || review.top().isEmpty()) {
                if (productSearch != null && review.matchedProducts() == 0) {
                    return chinese
                            ? "我没有在当前商品目录中匹配到“" + productSearch + "”。请提供商品的准确名称或条码后重试。"
                            : "I couldn't match \"" + productSearch
                                    + "\" to an active product. Try the exact product name or barcode.";
                }
                if (productSearch != null) {
                    return chinese
                            ? "匹配商品当前没有需要调整的毛利价格建议。此结果基于本店成本和税率，不是市场行情。"
                            : "No margin-based price change is indicated for the matching product. This uses store cost and tax data, not market pricing.";
                }
                return chinese
                        ? "近期样本中没有需要提高毛利的价格建议。打开价格复核页面查看。"
                        : "No prices need a margin raise in the recent sample. Tap below to open price review.";
            }
            int targetPct = (int) Math.round(review.marginTarget() * 100);
            StringBuilder sb = new StringBuilder();
            sb.append(chinese ? "以下价格需要复核（目标净毛利约 " : "Prices that need review (target ≈")
                    .append(targetPct).append(chinese ? "%）：\n" : "% net margin):\n");
            for (PriceReviewItem item : review.top()) {
                sb.append("\n• ").append(AssistantDisplayText.productName(item.name()));
                if (item.currentPrice() != null && item.suggestedPrice() != null) {
                    sb.append(" — $").append(AssistantDisplayText.money(item.currentPrice()))
                            .append(chinese ? " → 建议 $" : " → suggest $")
                            .append(AssistantDisplayText.money(item.suggestedPrice()));
                } else if (item.currentPrice() != null) {
                    sb.append(" — $").append(AssistantDisplayText.money(item.currentPrice()))
                            .append(chinese ? "（" : " (").append(statusLabel(item.status(), chinese))
                            .append(chinese ? '）' : ')');
                } else {
                    sb.append(" — ").append(statusLabel(item.status(), chinese));
                }
            }
            sb.append(chinese
                    ? "\n\n这些价格基于本店成本和税率，不代表市场行情。打开价格复核页面查看；任何价格变更都需要员工在页面确认。"
                    : "\n\nThese estimates use store cost and tax data, not market pricing. Tap below to open price review. Staff confirm any change on the page.");
            return sb.toString();
        } catch (Exception e) {
            Throwable rootCause = e;
            while (rootCause.getCause() != null && rootCause.getCause() != rootCause) {
                rootCause = rootCause.getCause();
            }
            String sqlState = rootCause instanceof java.sql.SQLException sqlException
                    ? sqlException.getSQLState() : "n/a";
            log.warn("Price review brief query failed: exceptionType={}, rootCauseType={}, sqlState={}",
                    e.getClass().getSimpleName(), rootCause.getClass().getSimpleName(), sqlState);
            return unavailableMessage(question);
        }
    }

    private static String unavailableMessage(String question) {
        return isChinese(question)
                ? "价格复核建议暂不可用，请打开价格复核页面重试。"
                : "Price review suggestions are unavailable right now. Open price review to retry.";
    }

    private static boolean isChinese(String text) {
        return text != null && text.matches("(?s).*[\\u3400-\\u9fff].*");
    }

    private static String productSearch(String question) {
        if (question == null) return null;
        Matcher matcher = PRODUCT_PRICE_QUESTION.matcher(question.trim());
        if (!matcher.matches()) return null;
        String query = matcher.group(1).trim();
        return query.isEmpty() ? null : query;
    }

    private static String statusLabel(String status, boolean chinese) {
        if (status == null) {
            return chinese ? "待复核" : "review";
        }
        if (chinese) {
            return switch (status) {
                case "raise" -> "低于目标毛利";
                case "review_cost" -> "复核成本";
                case "review_tax" -> "复核税额";
                case "missing_cost" -> "缺少成本";
                case "unsaleable" -> "不可销售";
                default -> status.replace('_', ' ');
            };
        }
        return switch (status) {
            case "raise" -> "below target margin";
            case "review_cost" -> "review cost";
            case "review_tax" -> "review tax";
            case "missing_cost" -> "missing cost";
            case "unsaleable" -> "unsaleable";
            default -> status.replace('_', ' ');
        };
    }
}
