package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.AssistantDisplayText;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.config.CorrelationIdContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.format.DateTimeFormatter;

/**
 * Builds a short in-chat restock summary so navigate intents return catalogue-aware
 * text plus a CTA instead of a bare page jump.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class ReplenishmentChatBrief {

    private static final Logger log = LoggerFactory.getLogger(ReplenishmentChatBrief.class);

    private final NativeReplenishmentService client;

    public ReplenishmentChatBrief(NativeReplenishmentService client) {
        this.client = client;
    }

    public String brief(String question, TenantContext tenant) {
        long startedAt = System.nanoTime();
        boolean chinese = isChinese(question);
        if (tenant == null) {
            logFailureOutcome("tenant_unavailable", startedAt);
            return unavailableMessage(question);
        }
        try {
            ReplenishmentPlan plan = client.plan(tenant);
            if (plan == null) {
                logFailureOutcome("service_unavailable", startedAt);
                return unavailableMessage(question);
            }
            int dataGapCount = plan.dataGapCount();
            String sourceNote = chinese
                    ? "数据来源：Orithos 库存与销售账本；账本最新可用数据时间：" + dataDate(plan.dataAsOf(), true) + "。"
                    : "Source: Orithos inventory and sales ledger; latest available ledger data at "
                            + dataDate(plan.dataAsOf(), false) + ".";
            if ("NO_DATA".equalsIgnoreCase(plan.dataQualityStatus())) {
                logOutcome("no_sales_data", dataGapCount, startedAt);
                return chinese
                        ? "所选期间没有可验证的销售历史，未生成补货数量。请先同步销售数据或打开补货页面核查。" + sourceNote
                        : "No verifiable sales history is available for this period, so no replenishment quantities were generated. "
                                + "Sync sales data or open replenishment to review." + sourceNote;
            }
            if ("DATA_INCOMPLETE".equalsIgnoreCase(plan.dataQualityStatus())
                    && (plan.top() == null || plan.top().isEmpty())) {
                logOutcome("incomplete_data", dataGapCount, startedAt);
                String gaps = String.join(", ", plan.dataGaps().stream().limit(3).toList());
                return chinese
                        ? "补货建议数据不完整，暂不生成数量：" + gaps + "。" + sourceNote
                                + "已转人工审核；" + incompleteDataGuidance(plan, true)
                        : "Replenishment data is incomplete, so no quantities were generated: "
                                + gaps + ". " + sourceNote
                                + " Manual review is required. " + incompleteDataGuidance(plan, false);
            }
            if (plan.itemsNeedingOrder() <= 0 || plan.top() == null || plan.top().isEmpty()) {
                logOutcome("success_empty", dataGapCount, startedAt);
                return chinese
                        ? "当前库存可覆盖目标周期，暂时没有补货数量建议。" + sourceNote + "打开补货页面查看。"
                        : "No restock quantities are suggested right now — forecast stock covers the target window. "
                                + sourceNote + " Tap below to open replenishment.";
            }
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
                        .append(gaps).append(". ").append(incompleteDataGuidance(plan, chinese));
            }
            logOutcome(dataGapCount == 0 ? "success" : "partial_data", dataGapCount, startedAt);
            return sb.toString();
        } catch (AccessDeniedException e) {
            logFailureOutcome("permission", startedAt);
            return unavailableMessage(question, "permission");
        } catch (DataAccessException e) {
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            String sqlState = root instanceof java.sql.SQLException sql ? sql.getSQLState() : null;
            String category = failureCategory(sqlState);
            log.warn("AI replenishment query failed correlationId={} category={} exceptionType={} sqlState={} dataGapCount=unknown elapsedMs={}",
                    CorrelationIdContext.current(), category, exceptionType(e), sqlState,
                    elapsedMs(startedAt));
            return unavailableMessage(question, category);
        } catch (Exception e) {
            log.warn("AI replenishment failed correlationId={} category=service exceptionType={} dataGapCount=unknown elapsedMs={}",
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

    private static void logFailureOutcome(String category, long startedAt) {
        log.info("AI replenishment brief correlationId={} category={} dataGapCount=unknown elapsedMs={}",
                CorrelationIdContext.current(), category, elapsedMs(startedAt));
    }

    private static String incompleteDataGuidance(ReplenishmentPlan plan, boolean chinese) {
        int inventoryGaps = plan.inventoryGapCount();
        int supplierGaps = plan.supplierGapCount();
        if (inventoryGaps == 0 && supplierGaps == 0) {
            return chinese
                    ? "请人工核对库存记录和供应商资料后重试。"
                    : "Review inventory records and supplier details, then retry.";
        }
        if (chinese) {
            StringBuilder guidance = new StringBuilder("数据缺口：");
            if (inventoryGaps > 0) {
                guidance.append("库存记录缺失、过期或更新时间不可用 ").append(inventoryGaps).append(" 项");
            }
            if (supplierGaps > 0) {
                if (inventoryGaps > 0) guidance.append("；");
                guidance.append("供应商资料不完整 ").append(supplierGaps).append(" 项");
            }
            guidance.append("。");
            if (inventoryGaps > 0 && supplierGaps > 0) guidance.append("请更新库存记录并补齐供应商资料后重试。");
            else if (inventoryGaps > 0) guidance.append("请更新库存记录后重试。");
            else guidance.append("请补齐供应商资料后重试。");
            return guidance.toString();
        }
        StringBuilder guidance = new StringBuilder("Data gaps: ");
        if (inventoryGaps > 0) {
            guidance.append("inventory is missing, stale or has no update timestamp for ")
                    .append(inventoryGaps).append(" item").append(inventoryGaps == 1 ? "" : "s");
        }
        if (supplierGaps > 0) {
            if (inventoryGaps > 0) guidance.append("; ");
            guidance.append("supplier details are incomplete for ")
                    .append(supplierGaps).append(" item").append(supplierGaps == 1 ? "" : "s");
        }
        guidance.append(". ");
        if (inventoryGaps > 0 && supplierGaps > 0) guidance.append("Update inventory and complete supplier records, then retry.");
        else if (inventoryGaps > 0) guidance.append("Update inventory records, then retry.");
        else guidance.append("Complete supplier records, then retry.");
        return guidance.toString();
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

    private static String dataDate(Instant value, boolean chinese) {
        return value == null ? (chinese ? "未知" : "unknown") : DateTimeFormatter.ISO_INSTANT.format(value);
    }
}
