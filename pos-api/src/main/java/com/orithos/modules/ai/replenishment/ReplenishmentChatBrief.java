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
        if (tenant == null) {
            return "Open replenishment to review suggestions. Tap below when you are ready.";
        }
        try {
            ReplenishmentPlan plan = client.plan(tenant);
            if (plan == null) {
                return "Open replenishment to review suggestions. Tap below when you are ready.";
            }
            if (plan.itemsNeedingOrder() <= 0 || plan.top() == null || plan.top().isEmpty()) {
                return "No restock quantities are suggested right now — forecast stock covers the target window. "
                        + "Tap below to open replenishment.";
            }
            StringBuilder sb = new StringBuilder();
            sb.append("Top restock suggestions (").append(plan.coverageDays()).append("d cover): ")
                    .append(plan.itemsNeedingOrder()).append(" item")
                    .append(plan.itemsNeedingOrder() == 1 ? "" : "s").append(" need order.\n");
            for (ReplenishmentSuggestion item : plan.top()) {
                sb.append("\n• ").append(AssistantDisplayText.productName(item.name()))
                        .append(" — order ").append(formatQty(item.suggestedQuantity()));
                if (item.daysOfStock() != null) {
                    sb.append(" (≈").append(formatDays(item.daysOfStock())).append("d left)");
                }
            }
            sb.append("\n\nTap below to review quantities and confirm any order.");
            return sb.toString();
        } catch (Exception e) {
            return "Open replenishment to review suggestions. Tap below when you are ready.";
        }
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
