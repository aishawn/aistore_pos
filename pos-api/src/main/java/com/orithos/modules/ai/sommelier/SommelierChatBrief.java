package com.orithos.modules.ai.sommelier;

import com.orithos.modules.ai.AssistantDisplayText;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.dto.RecommendCard;
import com.orithos.modules.ai.sommelier.dto.RecommendRequest;
import com.orithos.modules.ai.sommelier.dto.RecommendResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
            "(?:under|below|less than|最多|不超过|以内)\\s*(?:AUD\\s*|A?\\$\\s*)?(\\d+(?:\\.\\d{1,2})?)|"
                    + "\\$?(\\d+(?:\\.\\d{1,2})?)\\s*(?:元|澳元|刀)?\\s*(?:以内|以下)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern RED = Pattern.compile("\\bred\\b|红(?:葡萄)?酒", Pattern.CASE_INSENSITIVE);
    private static final Pattern WHITE = Pattern.compile("\\bwhite\\b|白葡萄酒|白酒", Pattern.CASE_INSENSITIVE);
    private static final Pattern SPARKLING = Pattern.compile(
            "\\bsparkling\\b|香槟|起泡(?:酒)?", Pattern.CASE_INSENSITIVE);

    private static final List<Map.Entry<String, Pattern>> FOOD_PAIRINGS = List.of(
            food("steak", "\\b(?:steak|beef)\\b|牛排|牛肉"),
            food("seafood", "\\b(?:seafood|prawns?|shrimp|oysters?)\\b|海鲜|虾|生蚝"),
            food("fish", "\\b(?:fish|salmon|barramundi)\\b|鱼"),
            food("lamb", "\\blamb\\b|羊肉"),
            food("bbq", "\\b(?:bbq|barbecue|barbeque)\\b|烧烤"),
            food("chicken", "\\bchicken\\b|鸡肉"),
            food("pasta", "\\bpasta\\b|意面"),
            food("pizza", "\\bpizza\\b|披萨"),
            food("cheese", "\\bcheese\\b|奶酪|芝士"));

    private static Map.Entry<String, Pattern> food(String tag, String terms) {
        return Map.entry(tag, Pattern.compile(terms, Pattern.CASE_INSENSITIVE));
    }

    private final SommelierService sommelierService;

    public SommelierChatBrief(SommelierService sommelierService) {
        this.sommelierService = sommelierService;
    }

    public String brief(String question, TenantContext tenant) {
        boolean chinese = isChinese(question);
        if (tenant == null) {
            return unavailableMessage(question);
        }
        try {
            RecommendRequest request = fromQuestion(question);
            RecommendResponse response = sommelierService.recommend(request, tenant);
            if (response.emptyReason() != null && !response.emptyReason().isBlank()
                    && (response.recommendations() == null || response.recommendations().isEmpty())) {
                return chinese
                        ? "目前没有符合条件的酒款：" + response.emptyReason() + "。打开品鉴推荐页面调整条件。"
                        : response.emptyReason() + " Tap below to open the wine assistant.";
            }
            if (response.recommendations() == null || response.recommendations().isEmpty()) {
                return chinese
                        ? "当前目录中没有匹配的酒款。可以调整类型或预算，或打开品鉴推荐页面查看。"
                        : "I could not pick wines from this catalogue yet. Tap below to open wine recommendations.";
            }
            StringBuilder sb = new StringBuilder(chinese ? "为你推荐以下有库存的酒款" : "Here are in-stock picks");
            if (request.wineType() != null && !request.wineType().isBlank()) {
                sb.append(chinese ? "（" : " (").append(chinese ? wineTypeLabel(request.wineType()) : request.wineType())
                        .append(chinese ? '）' : ')');
            }
            if (request.budgetMax() != null) {
                sb.append(chinese ? "，预算不超过 A$" : " under A$")
                        .append(AssistantDisplayText.money(request.budgetMax()));
            }
            sb.append(chinese ? "：\n" : ":\n");
            int n = Math.min(3, response.recommendations().size());
            for (int i = 0; i < n; i++) {
                RecommendCard card = response.recommendations().get(i);
                String badge = card.badge() == null || card.badge().isBlank()
                        ? (chinese ? "推荐" : "Pick") : chinese ? wineBadgeLabel(card.badge()) : card.badge();
                String name = AssistantDisplayText.productName(card.name());
                sb.append("\n• ").append(badge).append(" — ").append(name);
                BigDecimal price = card.sellPrice() != null ? card.sellPrice() : card.listPrice();
                if (price != null) {
                    sb.append(" — A$").append(AssistantDisplayText.money(price))
                            .append(chinese ? "（澳元，含 GST）" : " (AUD, GST included)");
                    if (card.onPromotion()) {
                        if (card.promotionEndsAt() == null) {
                            sb.append("NO_END_DATE".equals(card.promotionEndDateStatus())
                                    ? (chinese ? "；Shopfront 未列出促销截止日期" : "; no end date listed by Shopfront")
                                    : (chinese ? "；促销截止日期未核实" : "; promotion end date unverified"));
                        } else {
                            sb.append(chinese ? "；促销截止 " : "; offer ends ").append(card.promotionEndsAt());
                        }
                    }
                }
            }
            sb.append(chinese ? "\n\n打开品鉴推荐页面查看全部酒款。" : "\n\nTap below to open the full wine assistant.");
            return sb.toString();
        } catch (Exception e) {
            return unavailableMessage(question);
        }
    }

    private static String unavailableMessage(String question) {
        return isChinese(question)
                ? "品鉴推荐暂不可用，请打开品鉴页面重试。"
                : "Wine recommendations are unavailable right now. Open Sommelier to retry.";
    }

    private static boolean isChinese(String text) {
        return text != null && text.matches("(?s).*[\\u3400-\\u9fff].*");
    }

    private static String wineTypeLabel(String wineType) {
        return switch (wineType) {
            case "red" -> "红葡萄酒";
            case "white" -> "白葡萄酒";
            case "sparkling" -> "起泡酒";
            default -> wineType;
        };
    }

    private static String wineBadgeLabel(String badge) {
        return switch (badge.toLowerCase(Locale.ROOT)) {
            case "great value", "best value" -> "高性价比";
            case "best match", "top pick" -> "优选";
            default -> "推荐";
        };
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
                budgetMax = new BigDecimal(budget.group(1) != null ? budget.group(1) : budget.group(2));
            } catch (NumberFormatException ignored) {
                budgetMax = null;
            }
        }
        String occasion = q.toLowerCase(Locale.ROOT).contains("steak")
                || q.contains("牛排") ? "steak dinner" : null;
        List<String> food = FOOD_PAIRINGS.stream()
                .filter(entry -> entry.getValue().matcher(q).find())
                .map(Map.Entry::getKey)
                .toList();
        return new RecommendRequest(wineType, null, budgetMax, null, null, null, null, null, food, occasion);
    }
}
