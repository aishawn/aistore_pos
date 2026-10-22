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

    private final OdooPriceSuggestionClient client;

    public PricingChatBrief(OdooPriceSuggestionClient client) {
        this.client = client;
    }

    public String brief(String question, TenantContext tenant) {
        if (tenant == null) {
            return "Open price review when you are ready. Tap below — staff confirm any change on the page.";
        }
        try {
            PriceReviewBrief review = client.review(tenant);
            if (review == null) {
                return "Open price review when you are ready. Tap below — staff confirm any change on the page.";
            }
            if (review.top() == null || review.top().isEmpty()) {
                return "No prices need a margin raise in the recent sample. Tap below to open price review.";
            }
            int targetPct = (int) Math.round(review.marginTarget() * 100);
            StringBuilder sb = new StringBuilder();
            sb.append("Prices that need review (target ≈").append(targetPct).append("% net margin):\n");
            for (PriceReviewItem item : review.top()) {
                sb.append("\n• ").append(AssistantDisplayText.productName(item.name()));
                if (item.currentPrice() != null && item.suggestedPrice() != null) {
                    sb.append(" — $").append(AssistantDisplayText.money(item.currentPrice()))
                            .append(" → suggest $").append(AssistantDisplayText.money(item.suggestedPrice()));
                } else if (item.currentPrice() != null) {
                    sb.append(" — $").append(AssistantDisplayText.money(item.currentPrice()))
                            .append(" (").append(statusLabel(item.status())).append(')');
                } else {
                    sb.append(" — ").append(statusLabel(item.status()));
                }
            }
            sb.append("\n\nTap below to open price review. Staff confirm any change on the page.");
            return sb.toString();
        } catch (Exception e) {
            return "Open price review when you are ready. Tap below — staff confirm any change on the page.";
        }
    }

    private static String statusLabel(String status) {
        if (status == null) {
            return "review";
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
