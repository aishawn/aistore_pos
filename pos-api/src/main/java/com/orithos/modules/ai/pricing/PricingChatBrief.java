package com.orithos.modules.ai.pricing;

import com.orithos.modules.ai.AssistantDisplayText;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Builds a short in-chat price-review summary so navigate intents return
 * suggestion-aware text plus a CTA instead of a bare page jump.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class PricingChatBrief {

    private final NativePriceSuggestionService client;

    public PricingChatBrief(NativePriceSuggestionService client) {
        this.client = client;
    }

    public String brief(String question, TenantContext tenant) {
        boolean chinese = isChinese(question);
        if (tenant == null) {
            return unavailableMessage(question);
        }
        try {
            PriceReviewBrief review = client.review(tenant);
            if (review == null) {
                return unavailableMessage(question);
            }
            if (review.top() == null || review.top().isEmpty()) {
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
                    ? "\n\n打开价格复核页面查看；任何价格变更都需要员工在页面确认。"
                    : "\n\nTap below to open price review. Staff confirm any change on the page.");
            return sb.toString();
        } catch (Exception e) {
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
