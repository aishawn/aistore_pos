package com.orithos.modules.ai.sommelier;

import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.dto.RecommendCard;
import com.orithos.modules.ai.sommelier.dto.RecommendRequest;
import com.orithos.modules.ai.sommelier.dto.RecommendResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Builds a short in-chat wine recommendation summary so navigate intents can
 * return catalogue-aware text plus a CTA instead of a bare page jump.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class SommelierChatBrief {

    private static final Pattern UNDER_BUDGET = Pattern.compile(
            "(?:under|below|less than|最多|不超过|以内)\\s*\\$?(\\d+(?:\\.\\d{1,2})?)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern RED = Pattern.compile("\\b(?:red|红酒|红葡萄酒)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern WHITE = Pattern.compile("\\b(?:white|白酒|白葡萄酒)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern SPARKLING = Pattern.compile(
            "\\b(?:sparkling|香槟|起泡)\\b", Pattern.CASE_INSENSITIVE);

    private final SommelierService sommelierService;

    public SommelierChatBrief(SommelierService sommelierService) {
        this.sommelierService = sommelierService;
    }

    public String brief(String question, TenantContext tenant) {
        if (tenant == null) {
            return "Open wine recommendations when you are ready. Tap below to continue.";
        }
        try {
            RecommendRequest request = fromQuestion(question);
            RecommendResponse response = sommelierService.recommend(request, tenant);
            if (response.emptyReason() != null && !response.emptyReason().isBlank()
                    && (response.recommendations() == null || response.recommendations().isEmpty())) {
                return response.emptyReason() + " Tap below to open the wine assistant.";
            }
            if (response.recommendations() == null || response.recommendations().isEmpty()) {
                return "I could not pick wines from this catalogue yet. Tap below to open wine recommendations.";
            }
            StringBuilder sb = new StringBuilder("Here are in-stock picks");
            if (request.wineType() != null && !request.wineType().isBlank()) {
                sb.append(" (").append(request.wineType()).append(')');
            }
            if (request.budgetMax() != null) {
                sb.append(" under $").append(request.budgetMax().stripTrailingZeros().toPlainString());
            }
            sb.append(':');
            int n = Math.min(3, response.recommendations().size());
            for (int i = 0; i < n; i++) {
                RecommendCard card = response.recommendations().get(i);
                String badge = card.badge() == null || card.badge().isBlank() ? "Pick" : card.badge();
                sb.append("\n• ").append(badge)
                        .append(": ").append(card.name() == null ? "Wine" : card.name());
                BigDecimal price = card.sellPrice() != null ? card.sellPrice() : card.listPrice();
                if (price != null) {
                    sb.append(" — $").append(price.stripTrailingZeros().toPlainString());
                }
            }
            sb.append("\nTap below to open the full wine assistant.");
            return sb.toString();
        } catch (Exception e) {
            return "Open wine recommendations when you are ready. Tap below to continue.";
        }
    }

    static RecommendRequest fromQuestion(String question) {
        String q = question == null ? "" : question;
        String wineType = null;
        if (SPARKLING.matcher(q).find()) {
            wineType = "sparkling";
        } else if (RED.matcher(q).find()) {
            wineType = "red";
        } else if (WHITE.matcher(q).find()) {
            wineType = "white";
        }
        BigDecimal budgetMax = null;
        Matcher budget = UNDER_BUDGET.matcher(q);
        if (budget.find()) {
            try {
                budgetMax = new BigDecimal(budget.group(1));
            } catch (NumberFormatException ignored) {
                budgetMax = null;
            }
        }
        String occasion = q.toLowerCase(Locale.ROOT).contains("steak")
                || q.contains("牛排") ? "steak dinner" : null;
        return new RecommendRequest(wineType, null, budgetMax, null, null, null, null, null, null, occasion);
    }
}
