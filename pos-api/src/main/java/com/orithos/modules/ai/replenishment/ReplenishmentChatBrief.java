package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.AssistantDisplayText;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * Builds a short in-chat restock summary so navigate intents return catalogue-aware
 * text plus a CTA instead of a bare page jump.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class ReplenishmentChatBrief {

    private static final DateTimeFormatter DATA_DATE = DateTimeFormatter.ISO_LOCAL_DATE.withZone(ZoneOffset.UTC);

    private final NativeReplenishmentService client;

    public ReplenishmentChatBrief(NativeReplenishmentService client) {
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
            if ("DATA_INCOMPLETE".equalsIgnoreCase(plan.dataQualityStatus())
                    && (plan.top() == null || plan.top().isEmpty())) {
                String gaps = String.join(", ", plan.dataGaps().stream().limit(3).toList());
                return chinese
                        ? "补货建议数据不完整，暂不生成数量：" + gaps + "。数据检查日期："
                                + dataDate(plan.dataAsOf()) + " UTC。已转人工审核；请补齐库存或供应商资料后重试。"
                        : "Replenishment data is incomplete, so no quantities were generated: "
                                + gaps + ". Data checked: " + dataDate(plan.dataAsOf())
                                + " UTC. Manual review is required; complete inventory or supplier data and retry.";
            }
            if (plan.itemsNeedingOrder() <= 0 || plan.top() == null || plan.top().isEmpty()) {
                return chinese
                        ? "当前库存可覆盖目标周期，暂时没有补货数量建议。打开补货页面查看。"
                        : "No restock quantities are suggested right now — forecast stock covers the target window. "
                                + "Tap below to open replenishment.";
            }
            String sourceNote = chinese
                    ? "数据来源：Orithos 库存与销售账本；检查日期：" + dataDate(plan.dataAsOf()) + " UTC。"
                    : "Source: Orithos inventory and sales ledger; checked " + dataDate(plan.dataAsOf()) + " UTC.";
            StringBuilder sb = new StringBuilder();
            if (chinese) {
                sb.append("建议补货（覆盖 ").append(plan.coverageDays()).append(" 天）：")
                        .append(plan.itemsNeedingOrder()).append(" 个商品需要补货。\n")
                        .append(sourceNote).append("\n");
            } else {
                sb.append("Top restock suggestions (").append(plan.coverageDays()).append("d cover): ")
                        .append(plan.itemsNeedingOrder()).append(" item")
                        .append(plan.itemsNeedingOrder() == 1 ? "" : "s").append(" need order.\n")
                        .append(sourceNote).append("\n");
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

    private static String dataDate(Instant value) {
        return DATA_DATE.format(value == null ? Instant.EPOCH : value);
    }
}
