package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.AssistantDisplayText;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Builds a short in-chat restock summary so navigate intents return catalogue-aware
 * text plus a CTA instead of a bare page jump.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class ReplenishmentChatBrief {

    private final OdooReplenishmentClient client;

    public ReplenishmentChatBrief(OdooReplenishmentClient client) {
        this.client = client;
    }

    public String brief(String question, TenantContext tenant) {
        boolean chinese = isChinese(question);
        if (tenant == null) {
            return unavailableMessage(question);
        }
        try {
            ReplenishmentPlan plan = client.plan(tenant);
            if (plan == null) {
                return unavailableMessage(question);
            }
            if (plan.itemsNeedingOrder() <= 0 || plan.top() == null || plan.top().isEmpty()) {
                return chinese
                        ? "当前库存可覆盖目标周期，暂时没有补货数量建议。打开补货页面查看。"
                        : "No restock quantities are suggested right now — forecast stock covers the target window. "
                                + "Tap below to open replenishment.";
            }
            StringBuilder sb = new StringBuilder();
            if (chinese) {
                sb.append("建议补货（覆盖 ").append(plan.coverageDays()).append(" 天）：")
                        .append(plan.itemsNeedingOrder()).append(" 个商品需要补货。\n");
            } else {
                sb.append("Top restock suggestions (").append(plan.coverageDays()).append("d cover): ")
                        .append(plan.itemsNeedingOrder()).append(" item")
                        .append(plan.itemsNeedingOrder() == 1 ? "" : "s").append(" need order.\n");
            }
            for (ReplenishmentSuggestion item : plan.top()) {
                sb.append("\n• ").append(AssistantDisplayText.productName(item.name()))
                        .append(chinese ? " — 建议订购 " : " — order ").append(formatQty(item.suggestedQuantity()));
                if (item.daysOfStock() != null) {
                    sb.append(chinese ? "（约剩 " : " (≈").append(formatDays(item.daysOfStock()))
                            .append(chinese ? " 天）" : "d left)");
                }
            }
            sb.append(chinese ? "\n\n打开补货页面审核数量并确认订单。"
                    : "\n\nTap below to review quantities and confirm any order.");
            return sb.toString();
        } catch (Exception e) {
            return unavailableMessage(question);
        }
    }

    private static String unavailableMessage(String question) {
        return isChinese(question)
                ? "补货建议暂不可用，请打开补货页面重试。"
                : "Replenishment suggestions are unavailable right now. Open replenishment to retry.";
    }

    private static boolean isChinese(String text) {
        return text != null && text.matches("(?s).*[\\u3400-\\u9fff].*");
    }

    private static String formatQty(double qty) {
        if (Math.abs(qty - Math.rint(qty)) < 1e-6) {
            return String.valueOf((long) Math.rint(qty));
        }
        return String.format(java.util.Locale.ROOT, "%.1f", qty);
    }

    private static String formatDays(double days) {
        if (days < 0) {
            return "0";
        }
        if (days < 10) {
            return String.format(java.util.Locale.ROOT, "%.1f", days);
        }
        return String.valueOf(Math.round(days));
    }
}
