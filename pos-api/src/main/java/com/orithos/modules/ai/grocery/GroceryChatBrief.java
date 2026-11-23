package com.orithos.modules.ai.grocery;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AssistantDisplayText;
import com.orithos.modules.ai.dto.AssistantCard;
import com.orithos.modules.ai.dto.AssistantCardCta;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class GroceryChatBrief {

    private static final Pattern BUDGET = Pattern.compile(
            "(?i)(?:under|below|less than|最多|不超过|以内)\\s*(?:AUD\\s*|A?\\$\\s*)?(\\d+(?:\\.\\d{1,2})?)"
                    + "|\\$?(\\d+(?:\\.\\d{1,2})?)\\s*(?:元|澳元|刀)?\\s*(?:以内|以下)");
    private final GroceryRecommendService service;

    public GroceryChatBrief(GroceryRecommendService service) { this.service = service; }

    public String brief(String question, TenantContext tenant) {
        return result(question, tenant).answer();
    }

    public Brief result(String question, TenantContext tenant) {
        boolean chinese = question != null && question.matches("(?s).*[\\u3400-\\u9fff].*");
        if (tenant == null) {
            String answer = chinese ? "请先登录门店账号，才能查询商品推荐。" : "Sign in to a store before requesting recommendations.";
            return new Brief(answer, makeCard(answer, question, "unavailable", List.of(), answer, false));
        }
        try {
            GroceryRecommendResponse response = service.recommend(fromQuestion(question), tenant);
            if (response.recommendations().isEmpty()) {
                String answer = chinese
                        ? "目前没有符合条件且有库存的商品，请调整品类或预算后重试。打开商品推荐页面继续筛选。"
                        : "No matching in-stock items. Try another category or widen the budget. Open grocery recommendations to adjust your preferences.";
                return new Brief(answer, makeCard(answer, question, "empty", List.of(),
                        chinese ? "目前没有符合条件且有库存的商品。" : "No matching in-stock items.", false));
            }
            StringBuilder answer = new StringBuilder(chinese ? "以下是本店有库存的商品推荐：\n" : "In-stock picks from this store:\n");
            List<Map<String, Object>> items = new ArrayList<>();
            for (GroceryRecommendCard card : response.recommendations()) {
                answer.append("\n• ").append(card.badge()).append(" — ")
                        .append(AssistantDisplayText.productName(card.name())).append(" — A$")
                        .append(AssistantDisplayText.money(card.sellPrice()));
                answer.append(chinese ? "（澳元，含 GST）" : " (AUD, GST included)");
                if (card.promotionName() != null) {
                    answer.append(chinese ? "；促销：" : "; offer: ").append(card.promotionName());
                    if (card.promotionEndsAt() != null) answer.append(chinese ? "，截止 " : ", ends ")
                            .append(card.promotionEndsAt());
                }
                String packaging = card.saleQuantity().compareTo(java.math.BigDecimal.ONE) > 0
                        ? (chinese ? " / 每包 " : " / pack of ") + card.saleQuantity().stripTrailingZeros().toPlainString()
                        : "";
                answer.append(packaging);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("productId", card.productId());
                item.put("name", AssistantDisplayText.productName(card.name()));
                item.put("category", card.category());
                item.put("price", card.sellPrice());
                item.put("stockQuantity", card.stockQuantity());
                item.put("saleQuantity", card.saleQuantity());
                item.put("reason", card.reason());
                item.put("promotionName", card.promotionName());
                item.put("promotionEndsAt", card.promotionEndsAt());
                item.put("label", card.badge() + " — " + AssistantDisplayText.productName(card.name())
                        + " — A$" + AssistantDisplayText.money(card.sellPrice()) + " (AUD, GST included)" + packaging);
                items.add(item);
            }
            answer.append(chinese ? "\n\n打开商品推荐页面查看完整结果。" : "\n\nOpen grocery recommendations to see the full results.");
            return new Brief(answer.toString(), makeCard(answer.toString(), question, "ready", items, null, false));
        } catch (BusinessException e) {
            String answer = e.getCode() == 40300
                    ? chinese ? "当前账号没有权限查询商品推荐，请联系管理员检查门店权限。"
                            : "You do not have permission to view product recommendations. Contact an administrator to check your store access."
                    : e.getCode() == 40000
                            ? chinese ? "请先登录并确认账号已绑定门店，然后重试商品推荐。"
                                    : "Sign in and confirm your account is linked to a store before retrying recommendations."
                            : unavailableAnswer(chinese);
            return new Brief(answer, makeCard(answer, question, "unavailable", List.of(), answer,
                    e.getCode() != 40300 && e.getCode() != 40000));
        } catch (Exception e) {
            String answer = unavailableAnswer(chinese);
            return new Brief(answer, makeCard(answer, question, "unavailable", List.of(), answer, true));
        }
    }

    private static String unavailableAnswer(boolean chinese) {
        return chinese
                ? "商品推荐暂不可用，请稍后重试或打开商品推荐页面。"
                : "Product recommendations are unavailable right now. Retry or open grocery recommendations.";
    }

    private static AssistantCard makeCard(String answer, String question, String status,
                                          List<Map<String, Object>> items, String reason, boolean retryable) {
        boolean chinese = question != null && question.matches("(?s).*[\\u3400-\\u9fff].*");
        String title = chinese ? "商品推荐" : "Grocery recommendations";
        String ctaLabel = chinese ? "打开商品推荐" : "Open grocery recommendations";
        String summary = "ready".equals(status)
                ? chinese ? "本店有库存的推荐商品。" : "In-stock products from this store."
                : "empty".equals(status) ? reason : answer;
        return new AssistantCard("recommend", title, summary, items, "catalogue", Instant.now().toString(), reason,
                status, ctaLabel, "/recommend/grocery", new AssistantCardCta(ctaLabel, "/recommend/grocery"),
                retryable);
    }

    public record Brief(String answer, AssistantCard card) {}

    static GroceryRecommendRequest fromQuestion(String question) {
        String q = question == null ? "" : question.toLowerCase(java.util.Locale.ROOT);
        String category = "not_sure";
        if (hasAny(q, "beers?", "lagers?", "ales?", "啤酒")) category = "beer";
        else if (hasAny(q, "spirits?", "vodka", "whisk(?:y|ey)", "gin", "rum", "烈酒")) category = "spirits";
        else if (hasAny(q, "soft drinks?", "sodas?", "cola", "water", "juices?", "饮料", "矿泉水")) category = "soft_drinks";
        else if (hasAny(q, "snacks?", "chips", "crisps", "nuts", "零食", "薯片")) category = "snacks";
        BigDecimal budget = null;
        Matcher matcher = BUDGET.matcher(question == null ? "" : question);
        if (matcher.find()) {
            try { budget = new BigDecimal(matcher.group(1) == null ? matcher.group(2) : matcher.group(1)); }
            catch (NumberFormatException ignored) { budget = null; }
        }
        return new GroceryRecommendRequest(category, null, budget,
                hasAny(q, "bbq", "barbecue", "烧烤") ? "bbq" : null);
    }

    private static boolean hasAny(String value, String... terms) {
        for (String term : terms) {
            if (term.matches("[\\x00-\\x7F]+")) {
                if (Pattern.compile("\\b(?:" + term + ")\\b").matcher(value).find()) return true;
            } else if (value.contains(term)) {
                return true;
            }
        }
        return false;
    }
}
