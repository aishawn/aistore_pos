package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.AssistantDisplayText;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.config.CorrelationIdContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
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

    private static final Logger log = LoggerFactory.getLogger(ReplenishmentChatBrief.class);

    private static final DateTimeFormatter DATA_DATE = DateTimeFormatter.ISO_LOCAL_DATE.withZone(ZoneOffset.UTC);

    private final NativeReplenishmentService client;

    public ReplenishmentChatBrief(NativeReplenishmentService client) {
        this.client = client;
    }

    public String brief(String question, TenantContext tenant) {
        long startedAt = System.nanoTime();
        boolean chinese = isChinese(question);
        if (tenant == null) {
            logOutcome("tenant_unavailable", 0, startedAt);
            return unavailableMessage(question);
        }
        try {
            ReplenishmentPlan plan = client.plan(tenant);
            if (plan == null) {
                logOutcome("service_unavailable", 0, startedAt);
                return unavailableMessage(question);
            }
            int dataGapCount = plan.dataGaps().size();
            if ("DATA_INCOMPLETE".equalsIgnoreCase(plan.dataQualityStatus())
                    && (plan.top() == null || plan.top().isEmpty())) {
                logOutcome("incomplete_data", dataGapCount, startedAt);
                String gaps = String.join(", ", plan.dataGaps().stream().limit(3).toList());
                return chinese
                        ? "补货建议数据不完整，暂不生成数量：" + gaps + "。数据检查日期："
                                + dataDate(plan.dataAsOf()) + " UTC。已转人工审核；请补齐库存或供应商资料后重试。"
                        : "Replenishment data is incomplete, so no quantities were generated: "
                                + gaps + ". Data checked: " + dataDate(plan.dataAsOf())
                                + " UTC. Manual review is required; complete inventory or supplier data and retry.";
            }
            if (plan.itemsNeedingOrder() <= 0 || plan.top() == null || plan.top().isEmpty()) {
                logOutcome("success_empty", dataGapCount, startedAt);
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
            if ("DATA_INCOMPLETE".equalsIgnoreCase(plan.dataQualityStatus())) {
                String gaps = String.join(", ", plan.dataGaps().stream().limit(3).toList());
                sb.append(chinese ? "\n\n注意：部分商品因数据缺失未纳入建议：" : "\n\nSome items were excluded because data is missing: ")
                        .append(gaps).append(".");
            }
            logOutcome(dataGapCount == 0 ? "success" : "partial_data", dataGapCount, startedAt);
            return sb.toString();
        } catch (DataAccessException e) {
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            String sqlState = root instanceof java.sql.SQLException sql ? sql.getSQLState() : null;
            String category = failureCategory(sqlState);
            log.warn("AI replenishment query failed correlationId={} category={} exceptionType={} sqlState={} dataGapCount=0 elapsedMs={}",
                    CorrelationIdContext.current(), category, exceptionType(e), sqlState,
                    elapsedMs(startedAt));
            return unavailableMessage(question, category);
        } catch (Exception e) {
            log.warn("AI replenishment failed correlationId={} category=service exceptionType={} dataGapCount=0 elapsedMs={}",
                    CorrelationIdContext.current(), exceptionType(e), elapsedMs(startedAt));
            return unavailableMessage(question);
        }
    }

    private static String failureCategory(String sqlState) {
        if ("42501".equals(sqlState)) return "permission";
        if ("57014".equals(sqlState)) return "timeout";
        if (sqlState != null && sqlState.startsWith("08")) return "connection";
        return "query";
    }

    private static String unavailableMessage(String question, String category) {
        if ("permission".equals(category)) {
            return isChinese(question)
                    ? "当前账号没有权限查询补货数据，尚未生成建议。请联系管理员检查门店权限。"
                    : "You do not have permission to query replenishment data, so no suggestions were generated. Ask an administrator to check store access.";
        }
        if ("timeout".equals(category)) {
            return isChinese(question)
                    ? "补货查询超时，未生成建议。请稍后重试或打开补货页面。"
                    : "The replenishment query timed out, so no suggestions were generated. Retry shortly or open replenishment.";
        }
        return unavailableMessage(question);
    }

    private static void logOutcome(String category, int dataGapCount, long startedAt) {
        log.info("AI replenishment brief correlationId={} category={} dataGapCount={} elapsedMs={}",
                CorrelationIdContext.current(), category, dataGapCount, elapsedMs(startedAt));
    }

    private static long elapsedMs(long startedAt) {
        return Math.max(0, (System.nanoTime() - startedAt) / 1_000_000L);
    }

    private static String exceptionType(Throwable error) {
        String simpleName = error.getClass().getSimpleName();
        return simpleName.isBlank() ? error.getClass().getSuperclass().getSimpleName() : simpleName;
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
