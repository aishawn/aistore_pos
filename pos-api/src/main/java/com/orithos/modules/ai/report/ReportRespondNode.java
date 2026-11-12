package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.NodeAction;
import com.orithos.modules.report.ReportQueryService;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Builds report answers while preserving the language of the user's question. */
@Component
public class ReportRespondNode implements NodeAction {

    private final AiReportAuditService auditService;

    public ReportRespondNode(AiReportAuditService auditService) {
        this.auditService = auditService;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String intent = ReportGraphState.string(state, "intent");
        String question = ReportGraphState.string(state, "question");
        boolean chinese = question != null && question.matches("(?s).*[\\u3400-\\u9fff].*");
        String error = ReportGraphState.string(state, "sql_error");
        if (error != null && !error.isBlank()) {
            auditService.record(state);
            return Map.of("answer", messageForError(error, intent, chinese));
        }
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) state.value("report_rows").orElse(List.of());
        Map<String, String> slots = ReportGraphState.slots(state);
        String from = slots.getOrDefault("from", "");
        String to = slots.getOrDefault("to", "");
        Map<String, Object> result = Map.of("answer", format(intent, rows, from, to, slots, chinese));
        auditService.record(state);
        return result;
    }

    private String format(String intent, List<Map<String, Object>> rows, String from, String to,
                          Map<String, String> slots, boolean chinese) {
        if (rows == null || rows.isEmpty()) {
            return switch (intent == null ? "" : intent) {
                case "report_stock" -> chinese ? "没有找到匹配库存，请检查商品名称或目录拼写。" : "No matching stock found. Check the product name or catalogue spelling.";
                case "report_aov" -> chinese
                        ? rangeText(from, to) + "没有已完成销售记录。数据来源：Orithos POS 报表。"
                        : "No completed sales found for " + rangeText(from, to) + ". Source: Orithos POS report.";
                case "report_dead_stock" -> "No dead-stock items found for the selected period."
                        + " Try asking for dead stock last 60 days if you want a wider window.";
                case "report_stock_value" -> "No on-hand products with a recorded cost were found.";
                default -> "No completed sales found for " + rangeText(from, to)
                        + ". Try a wider range — for example ask: sales last 7 days"
                        + (from != null && !from.isBlank() && from.equals(to)
                        ? ", or yesterday / last week."
                        : ".");
            };
        }
        return switch (intent == null ? "" : intent) {
            case "report_sales" -> rows.get(0).containsKey("grossProfit")
                    || Boolean.TRUE.equals(rows.get(0).get("comparison"))
                    ? formatAuthoritativeSales(rows.get(0), from, to, chinese)
                    : formatSeries(rows, "sales", "Sales", from, to);
            case "report_aov" -> formatAov(rows.get(0), from, to, chinese);
            case "report_stock" -> formatStock(rows, slots.get("query"));
            case "report_dead_stock" -> formatDead(rows, slots.getOrDefault("days", "30"), from, to, chinese);
            case "report_stock_value" -> formatStockValue(rows, chinese);
            case "report_qty" -> formatQuantitySeries(rows, from, to);
            case "report_adhoc" -> formatAdhoc(rows, from, to);
            default -> formatSeries(rows, "sales", "Sales", from, to);
        };
    }

    private String formatAuthoritativeSales(Map<String, Object> row, String from, String to, boolean chinese) {
        if (Boolean.TRUE.equals(row.get("comparison"))) return formatSalesComparison(row, chinese);
        BigDecimal sales = ReportQueryService.toDecimal(row.get("sales"));
        if (ReportQueryService.toDecimal(row.get("transactions")).signum() == 0) {
            return chinese ? rangeText(from, to) + "没有已完成销售记录。数据来源：Orithos POS 报表。"
                    : "No completed sales found for " + rangeText(from, to) + ". Source: Orithos POS report.";
        }
        Object profit = row.get("grossProfit");
        String range = rangeText(from, to);
        if (Boolean.FALSE.equals(row.get("costAvailable")) || profit == null) {
            if ("permission".equals(row.get("profitUnavailableReason"))) {
                return chinese
                        ? range + "营业额 AUD " + money(sales) + "；毛利暂不可用，因为当前账号没有查看成本数据的权限。数据来源：Orithos POS 报表。"
                        : "Sales for " + range + " were AUD " + money(sales)
                            + "; gross profit is unavailable because your account cannot view cost data. Source: Orithos POS report.";
            }
            return chinese
                    ? range + "营业额 AUD " + money(sales) + "；毛利暂不可用，销售成本数据不完整。数据来源：Orithos POS 报表。"
                    : "Sales for " + range + " were AUD " + money(sales)
                        + "; gross profit is unavailable because sale cost data is incomplete. Source: Orithos POS report.";
        }
        String profitText = money(ReportQueryService.toDecimal(profit));
        return chinese
                ? range + "营业额 AUD " + money(sales) + "，毛利 AUD " + profitText
                    + "（营业额减成本，含 GST）。数据来源：Orithos POS 报表。"
                : "Sales for " + range + " were AUD " + money(sales) + " and gross profit was AUD " + profitText
                    + " (sales less cost, GST inclusive). Source: Orithos POS report.";
    }

    @SuppressWarnings("unchecked")
    private String formatSalesComparison(Map<String, Object> row, boolean chinese) {
        Map<String, Object> first = (Map<String, Object>) row.get("first");
        Map<String, Object> second = (Map<String, Object>) row.get("second");
        String firstDate = String.valueOf(row.get("firstDate"));
        String secondDate = String.valueOf(row.get("secondDate"));
        BigDecimal firstSales = ReportQueryService.toDecimal(first.get("sales"));
        BigDecimal secondSales = ReportQueryService.toDecimal(second.get("sales"));
        if (ReportQueryService.toDecimal(first.get("transactions")).signum() == 0
                && ReportQueryService.toDecimal(second.get("transactions")).signum() == 0) {
            return chinese
                    ? firstDate + "和" + secondDate + "均没有已完成销售记录。数据来源：Orithos POS 报表。"
                    : "No completed sales were found on " + firstDate + " or " + secondDate
                        + ". Source: Orithos POS report.";
        }
        String comparison = chinese
                ? firstDate + "营业额 AUD " + money(firstSales) + "；" + secondDate + "营业额 AUD " + money(secondSales)
                : "Sales on " + firstDate + " were AUD " + money(firstSales)
                    + "; sales on " + secondDate + " were AUD " + money(secondSales);
        boolean costComplete = Boolean.TRUE.equals(first.get("costAvailable"))
                && Boolean.TRUE.equals(second.get("costAvailable"))
                && first.get("grossProfit") != null && second.get("grossProfit") != null;
        if (!costComplete) {
            boolean permissionDenied = "permission".equals(first.get("profitUnavailableReason"))
                    || "permission".equals(second.get("profitUnavailableReason"));
            return comparison + (chinese
                    ? permissionDenied
                        ? "。毛利对比暂不可用，因为当前账号没有查看成本数据的权限。数据来源：Orithos POS 报表。"
                        : "。毛利对比暂不可用，因为至少一个日期的销售成本数据不完整。数据来源：Orithos POS 报表。"
                    : permissionDenied
                        ? ". Gross profit comparison is unavailable because your account cannot view cost data. Source: Orithos POS report."
                        : ". Gross profit comparison is unavailable because sale cost data is incomplete for at least one date. Source: Orithos POS report.");
        }
        return comparison + (chinese
                ? "；毛利分别为 AUD " + money(ReportQueryService.toDecimal(first.get("grossProfit")))
                    + " 和 AUD " + money(ReportQueryService.toDecimal(second.get("grossProfit")))
                    + "（营业额减成本，含 GST）。数据来源：Orithos POS 报表。"
                : "; gross profit was AUD " + money(ReportQueryService.toDecimal(first.get("grossProfit")))
                    + " and AUD " + money(ReportQueryService.toDecimal(second.get("grossProfit")))
                    + " (sales less cost, GST inclusive). Source: Orithos POS report.");
    }

    private String formatSeries(List<Map<String, Object>> rows, String metricKey, String label,
                                String from, String to) {
        BigDecimal total = BigDecimal.ZERO;
        for (Map<String, Object> row : rows) {
            total = total.add(ReportQueryService.toDecimal(row.get(metricKey)));
        }
        String range = rangeText(from, to);
        String sum = "AUD " + money(total);
        int days = rows.size();
        return label + " for " + range + " total " + sum + " (" + days + (days == 1 ? " day)." : " days).");
    }

    private String formatQuantitySeries(List<Map<String, Object>> rows, String from, String to) {
        BigDecimal total = BigDecimal.ZERO;
        for (Map<String, Object> row : rows) {
            total = total.add(ReportQueryService.toDecimal(row.get("qty")));
        }
        int days = rows.size();
        return "Quantity sold for " + rangeText(from, to) + " total "
                + total.stripTrailingZeros().toPlainString() + " units ("
                + days + (days == 1 ? " day)." : " days).");
    }

    private String formatAov(Map<String, Object> row, String from, String to, boolean chinese) {
        String range = rangeText(from, to);
        String aov = "AUD " + money(ReportQueryService.toDecimal(row.get("aov")));
        String tickets = ReportQueryService.toDecimal(row.get("tickets")).stripTrailingZeros().toPlainString();
        if (chinese) {
            return range + "平均客单价 " + aov + "，基于 " + tickets + " 笔销售交易。数据来源：Orithos POS 报表。";
        }
        return "Average Ticket for " + range + " is " + aov + " across " + tickets
                + ("1".equals(tickets) ? " sale transaction. Source: Orithos POS report."
                : " sales transactions. Source: Orithos POS report.");
    }

    private String formatStock(List<Map<String, Object>> rows, String query) {
        StringBuilder sb = new StringBuilder();
        sb.append(query == null || query.isBlank() ? "Stock" : query).append(": ");
        int n = Math.min(rows.size(), 8);
        for (int i = 0; i < n; i++) {
            Map<String, Object> row = rows.get(i);
            if (i > 0) {
                sb.append("; ");
            }
            sb.append(row.getOrDefault("name", "")).append(" ")
                    .append(ReportQueryService.toDecimal(row.get("quantity")).stripTrailingZeros().toPlainString());
        }
        if (rows.size() > n) {
            sb.append(" …and ").append(rows.size() - n).append(" more");
        }
        return sb.toString();
    }

    private String formatDead(List<Map<String, Object>> rows, String days, String from, String to, boolean chinese) {
        String prefix = rows.size() == 50 ? "Top 50 " : rows.size() + " ";
        if (chinese) {
            String count = rows.size() == 50 ? "前 50 个" : rows.size() + " 个";
            return "最近" + days + "天有" + count + "滞销商品（当前库存大于 0，销量为 0）。"
                    + "数据来源：Orithos 当前库存和 POS 销售；销售区间：" + rangeText(from, to) + "。";
        }
        return prefix + "dead-stock item(s) in the last " + days
                + " days (on hand > 0, qty sold = 0)."
                + " Source: Orithos on-hand stock and POS sales; sales period: " + rangeText(from, to) + ".";
    }

    private String formatStockValue(List<Map<String, Object>> rows, boolean chinese) {
        Map<String, Object> summary = rows.get(0);
        boolean hasStoreTotal = summary.containsKey("store_inventory_value_total");
        BigDecimal storeTotal = ReportQueryService.toDecimal(summary.get("store_inventory_value_total"));
        BigDecimal topTotal = BigDecimal.ZERO;
        StringBuilder sb = new StringBuilder(chinese ? "库存资金占用最高的商品：" : "Top inventory cash usage: ");
        int n = Math.min(rows.size(), 8);
        int displayed = 0;
        for (int i = 0; i < n; i++) {
            Map<String, Object> row = rows.get(i);
            if (!row.containsKey("inventory_value")) continue;
            BigDecimal value = ReportQueryService.toDecimal(row.get("inventory_value"));
            topTotal = topTotal.add(value);
            if (displayed++ > 0) sb.append("; ");
            sb.append(row.getOrDefault("name", "")).append(" AUD ").append(money(value));
        }
        if (hasStoreTotal) {
            int valuedCount = ReportQueryService.toDecimal(summary.get("valued_product_count")).intValue();
            int excludedCount = ReportQueryService.toDecimal(summary.get("excluded_product_count")).intValue();
            if (chinese) {
                sb.append("。全店有记录成本的现有库存估值 AUD ").append(money(storeTotal))
                        .append("，覆盖 ").append(valuedCount).append(" 个商品；另有 ")
                        .append(excludedCount).append(" 个商品因库存或成本条件未计入。前 ")
                        .append(Math.min(8, valuedCount)).append(" 个商品小计 AUD ").append(money(topTotal))
                        .append("。数据来源：Orithos 当前库存和商品成本快照。");
            } else {
                sb.append(". Storewide on-hand inventory value for products with recorded positive costs: AUD ")
                        .append(money(storeTotal)).append(" across ").append(valuedCount)
                        .append(" products; ").append(excludedCount)
                        .append(" products were excluded because stock or cost was not positive. Top ")
                        .append(Math.min(8, valuedCount)).append(" items subtotal AUD ").append(money(topTotal))
                        .append(" Source: Orithos on-hand quantities and product costs; current snapshot.");
            }
            return sb.toString();
        }
        if (chinese) {
            sb.append("；以上仅为返回商品小计 AUD ").append(money(topTotal))
                    .append("，缺少完整范围汇总，不能视为全店总额。");
        } else {
            sb.append(". Returned items subtotal AUD ").append(money(topTotal))
                    .append("; a complete storewide total is unavailable.");
        }
        return sb.toString();
    }

    private String formatAdhoc(List<Map<String, Object>> rows, String from, String to) {
        String range = rangeText(from, to);
        Map<String, Object> first = rows.get(0);
        if (rows.size() == 1) {
            String body = first.entrySet().stream()
                    .map(e -> e.getKey() + "=" + String.valueOf(e.getValue()))
                    .collect(Collectors.joining(", "));
            return range + ": " + body;
        }
        return range + ": " + rows.size() + " row(s).";
    }

    private String messageForError(String error, String intent, boolean chinese) {
        if (error.startsWith("GUARD:") || error.startsWith("NL2SQL_")
                || "SQL_GUARD_REJECTED".equals(error)) {
            return "That question cannot be queried (security check failed).";
        }
        return switch (error) {
            case "NO_PERMISSION" -> "You do not have permission to query reports.";
            case "NO_OUTLET" -> "Your account is not bound to a store.";
            case "NEED_PRODUCT" ->
                    "Please tell me the product name, for example: how much Coca Cola is in stock.";
            case "NO_COST_PERMISSION" -> "You do not have permission to query inventory cost.";
            case "NATIVE_REPORT_UNAVAILABLE" -> isStockIntent(intent)
                    ? "I could not read Orithos stock data right now. Open the stock list to check manually, or try again shortly."
                    : "Orithos reporting is temporarily unavailable. Please try again.";
            case "AUTHORITATIVE_REPORT_INCOMPLETE" -> chinese
                    ? "权威报表缺少计算客单价所需的数据，暂时无法提供结果。请稍后重试。"
                    : "The authoritative report is missing data required to calculate average sale. Please try again shortly.";
            case "NATIVE_REPORT_UNSUPPORTED" -> chinese
                    ? "暂不支持这种自定义查询。可比较两个明确日期的销售额，例如：比较2026年10月14日和2026年10月15日销售额。"
                    : "That custom report is not supported. You can compare sales on two explicit dates, for example: "
                        + "Compare sales on 14 Oct 2026 with 15 Oct 2026.";
            case "COST_DATA_UNAVAILABLE" ->
                    "Inventory cash value is unavailable because this reporting source does not contain trusted product cost data.";
            case "QUOTA_EXCEEDED" ->
                    "This store has reached its hourly report quota. Try again later.";
            default -> "The query failed. Please try again.";
        };
    }

    private static boolean isStockIntent(String intent) {
        return "report_stock".equals(intent) || "report_stock_value".equals(intent);
    }

    private static String rangeText(String from, String to) {
        if (from == null || from.isBlank()) {
            return "the period";
        }
        if (from.equals(to) || to == null || to.isBlank()) {
            return from;
        }
        return from + " to " + to;
    }

    private static String money(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}
