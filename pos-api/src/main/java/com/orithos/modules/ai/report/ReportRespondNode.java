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

    private static final int STOCK_RESULT_LIMIT = 50;

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
        String dataStatus = ReportGraphState.string(state, "report_data_status");
        Map<String, Object> result = new java.util.HashMap<>();
        String answer = format(intent, rows, from, to, slots, chinese);
        if ("report_dead_stock".equals(intent) && "incomplete".equalsIgnoreCase(dataStatus)) {
            answer = rows == null || rows.isEmpty()
                    ? (chinese ? "无法确认所选期间是否确实没有滞销商品。" : "I cannot confirm that there were no dead-stock items for the selected period.")
                    : answer;
            answer += chinese
                    ? "销售数据更新时间及完整性无法确认，以上结果需核实。"
                    : " Sales data freshness and completeness could not be confirmed; verify these results.";
        }
        result.put("answer", answer);
        if ("report_stock".equals(intent) && rows != null && !rows.isEmpty()) {
            String dataAsOf = trustedStockDataAsOf(rows);
            if (dataAsOf != null) result.put("report_data_as_of", dataAsOf);
        }
        auditService.record(state);
        return result;
    }

    private String format(String intent, List<Map<String, Object>> rows, String from, String to,
                          Map<String, String> slots, boolean chinese) {
        if (rows == null || rows.isEmpty()) {
            return switch (intent == null ? "" : intent) {
                case "report_stock" -> chinese ? "没有找到匹配库存，请检查商品名称或目录拼写。" : "No matching stock found. Check the product name or catalogue spelling.";
                case "report_aov" -> chinese
                        ? rangeText(from, to, true) + "没有已完成销售记录。数据来源：Orithos POS 报表。"
                        : "No completed sales found for " + rangeText(from, to) + ". Source: Orithos POS report.";
                case "report_dead_stock" -> {
                    if (!chinese) {
                        yield "No dead-stock items found for the selected period."
                                + " Try asking for dead stock last 60 days if you want a wider window.";
                    }
                    String dateRange = chineseDateRange(from, to);
                    yield "所选期间未发现符合条件的滞销商品。"
                            + (dateRange.isBlank() ? "" : "销售统计区间：" + dateRange + "。");
                }
                case "report_stock_value" -> "No on-hand products with a recorded cost were found.";
                default -> "report_sales".equals(intent) && chinese
                        ? rangeText(from, to, true) + "没有已完成销售记录。数据来源：Orithos POS 报表。"
                        : "No completed sales found for " + rangeText(from, to)
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
            case "report_stock" -> formatStock(rows, slots.get("query"), chinese);
            case "report_stock_summary" -> formatStockSummary(rows.get(0), chinese);
            case "report_dead_stock" -> formatDead(rows, slots.getOrDefault("days", "30"), from, to, chinese);
            case "report_stock_value" -> formatStockValue(rows, chinese);
            case "report_qty" -> formatQuantitySeries(rows, from, to);
            case "report_adhoc" -> formatAdhoc(rows, from, to);
            default -> formatSeries(rows, "sales", "Sales", from, to);
        };
    }

    private String formatStockSummary(Map<String, Object> row, boolean chinese) {
        String units = ReportQueryService.toDecimal(row.get("positiveUnits")).stripTrailingZeros().toPlainString();
        String positiveSkus = ReportQueryService.toDecimal(row.get("positiveSkus")).stripTrailingZeros().toPlainString();
        String negativeSkus = ReportQueryService.toDecimal(row.get("negativeSkus")).stripTrailingZeros().toPlainString();
        String totalSkus = ReportQueryService.toDecimal(row.get("totalSkus")).stripTrailingZeros().toPlainString();
        if (chinese) {
            return "当前有正库存 " + units + " 件，涉及 " + positiveSkus + " 个商品；"
                    + totalSkus + " 个有效商品中有 " + negativeSkus + " 个商品库存为负。"
                    + ("0".equals(negativeSkus) ? "" : "负库存属于数据异常，建议核查库存记录。")
                    + "数据来源：Orithos POS 当前门店库存；库存更新时间未提供，建议核实。";
        }
        return "Current positive on-hand stock is " + units + " units across " + positiveSkus
                + " products. " + negativeSkus + " of " + totalSkus + " active products have negative stock."
                + ("0".equals(negativeSkus) ? "" : " Negative stock is an anomaly; review the inventory records.")
                + " Source: Orithos POS inventory for the current store. Inventory update time is unavailable; verify the snapshot.";
    }

    private String formatAuthoritativeSales(Map<String, Object> row, String from, String to, boolean chinese) {
        if (Boolean.TRUE.equals(row.get("comparison"))) return formatSalesComparison(row, chinese);
        BigDecimal sales = ReportQueryService.toDecimal(row.get("sales"));
        if (ReportQueryService.toDecimal(row.get("transactions")).signum() == 0) {
            BigDecimal refunds = ReportQueryService.toDecimal(row.get("refunds"));
            if (refunds.signum() > 0) {
                String refundCount = positiveCount(row.get("refundTransactions"));
                return chinese
                        ? rangeText(from, to, true) + "没有已完成销售交易；退款 AUD " + money(refunds)
                                + (refundCount.isEmpty() ? "" : "，共 " + refundCount + " 笔")
                                + "，净营业额 AUD " + money(sales) + "。数据来源：Orithos POS 报表。"
                        : "No completed sale transactions were recorded for " + rangeText(from, to)
                                + "; AUD " + money(refunds) + " in refunds"
                                + (refundCount.isEmpty() ? "" : " across " + refundCount
                                        + ("1".equals(refundCount) ? " refund transaction" : " refund transactions"))
                                + " resulted in net sales of AUD " + money(sales)
                                + ". Source: Orithos POS report.";
            }
            return chinese ? rangeText(from, to, true) + "没有已完成销售记录。数据来源：Orithos POS 报表。"
                    : "No completed sales found for " + rangeText(from, to) + ". Source: Orithos POS report.";
        }
        Object profit = row.get("grossProfit");
        String range = rangeText(from, to, chinese);
        String refundDisclosure = refundDisclosure(row, chinese);
        if (Boolean.FALSE.equals(row.get("costAvailable")) || profit == null
                || profit.toString().isBlank()) {
            if ("permission".equals(row.get("profitUnavailableReason"))) {
                return chinese
                        ? range + "营业额 AUD " + money(sales) + refundDisclosure + "；毛利暂不可用，因为当前账号没有查看成本数据的权限。数据来源：Orithos POS 报表。"
                        : "Sales for " + range + " were AUD " + money(sales)
                            + refundDisclosure
                            + "; gross profit is unavailable because your account cannot view cost data. Source: Orithos POS report.";
            }
            if ("tax".equals(row.get("profitUnavailableReason"))) {
                return chinese
                        ? range + "营业额 AUD " + money(sales) + refundDisclosure + "；毛利暂不可用，销售税额数据不完整。数据来源：Orithos POS 报表。"
                        : "Sales for " + range + " were AUD " + money(sales)
                            + refundDisclosure
                            + "; gross profit is unavailable because sale tax data is incomplete. Source: Orithos POS report.";
            }
            return chinese
                    ? range + "营业额 AUD " + money(sales) + refundDisclosure + "；毛利暂不可用，销售成本数据不完整。数据来源：Orithos POS 报表。"
                    : "Sales for " + range + " were AUD " + money(sales)
                        + refundDisclosure
                        + "; gross profit is unavailable because sale cost data is incomplete. Source: Orithos POS report.";
        }
        String profitText = money(ReportQueryService.toDecimal(profit));
        return chinese
                ? range + "营业额 AUD " + money(sales) + refundDisclosure + "，毛利 AUD " + profitText
                    + "（税前营业额减成本）。数据来源：Orithos POS 报表。"
                : "Sales for " + range + " were AUD " + money(sales) + refundDisclosure + " and gross profit was AUD " + profitText
                    + " (ex-GST sales less cost). Source: Orithos POS report.";
    }

    private String refundDisclosure(Map<String, Object> row, boolean chinese) {
        BigDecimal refunds = ReportQueryService.toDecimal(row.get("refunds"));
        if (refunds.signum() <= 0) return "";
        String refundCount = positiveCount(row.get("refundTransactions"));
        Object grossSalesValue = row.get("grossSales");
        String grossSales = grossSalesValue == null ? ""
                : (chinese ? "，退款前销售额 AUD " : "; gross sales AUD ")
                        + money(ReportQueryService.toDecimal(grossSalesValue));
        return chinese
                ? "（退款 AUD " + money(refunds)
                        + (refundCount.isEmpty() ? "" : "，共 " + refundCount + " 笔") + grossSales + "）"
                : " after AUD " + money(refunds) + " in refunds"
                        + (refundCount.isEmpty() ? "" : " across " + refundCount
                                + ("1".equals(refundCount) ? " refund transaction" : " refund transactions"))
                        + (grossSales.isEmpty() ? "" : " (" + grossSales.substring(2) + ")");
    }

    private String positiveCount(Object value) {
        BigDecimal count = ReportQueryService.toDecimal(value);
        return count.signum() > 0 ? count.stripTrailingZeros().toPlainString() : "";
    }

    @SuppressWarnings("unchecked")
    private String formatSalesComparison(Map<String, Object> row, boolean chinese) {
        Map<String, Object> first = (Map<String, Object>) row.get("first");
        Map<String, Object> second = (Map<String, Object>) row.get("second");
        String firstDate = String.valueOf(row.get("firstDate"));
        String secondDate = String.valueOf(row.get("secondDate"));
        BigDecimal firstSales = ReportQueryService.toDecimal(first.get("sales"));
        BigDecimal secondSales = ReportQueryService.toDecimal(second.get("sales"));
        BigDecimal firstRefunds = ReportQueryService.toDecimal(first.get("refunds"));
        BigDecimal secondRefunds = ReportQueryService.toDecimal(second.get("refunds"));
        if (ReportQueryService.toDecimal(first.get("transactions")).signum() == 0
                && ReportQueryService.toDecimal(second.get("transactions")).signum() == 0
                && firstRefunds.signum() == 0 && secondRefunds.signum() == 0) {
            return chinese
                    ? firstDate + "和" + secondDate + "均没有已完成销售记录。数据来源：Orithos POS 报表。"
                    : "No completed sales were found on " + firstDate + " or " + secondDate
                        + ". Source: Orithos POS report.";
        }
        String comparison = chinese
                ? firstDate + "营业额 AUD " + money(firstSales) + "；" + secondDate + "营业额 AUD " + money(secondSales)
                : "Sales on " + firstDate + " were AUD " + money(firstSales)
                    + "; sales on " + secondDate + " were AUD " + money(secondSales);
        comparison += comparisonRefundDisclosure(first, second, firstDate, secondDate, chinese);
        boolean costComplete = Boolean.TRUE.equals(first.get("costAvailable"))
                && Boolean.TRUE.equals(second.get("costAvailable"))
                && first.get("grossProfit") != null && second.get("grossProfit") != null;
        if (!costComplete) {
            boolean permissionDenied = "permission".equals(first.get("profitUnavailableReason"))
                    || "permission".equals(second.get("profitUnavailableReason"));
            boolean taxIncomplete = "tax".equals(first.get("profitUnavailableReason"))
                    || "tax".equals(second.get("profitUnavailableReason"));
            return comparison + (chinese
                    ? permissionDenied
                        ? "。毛利对比暂不可用，因为当前账号没有查看成本数据的权限。数据来源：Orithos POS 报表。"
                        : taxIncomplete
                            ? "。毛利对比暂不可用，因为至少一个日期的销售税额数据不完整。数据来源：Orithos POS 报表。"
                            : "。毛利对比暂不可用，因为至少一个日期的销售成本数据不完整。数据来源：Orithos POS 报表。"
                    : permissionDenied
                        ? ". Gross profit comparison is unavailable because your account cannot view cost data. Source: Orithos POS report."
                        : taxIncomplete
                            ? ". Gross profit comparison is unavailable because sale tax data is incomplete for at least one date. Source: Orithos POS report."
                            : ". Gross profit comparison is unavailable because sale cost data is incomplete for at least one date. Source: Orithos POS report.");
        }
        return comparison + (chinese
                ? "；毛利分别为 AUD " + money(ReportQueryService.toDecimal(first.get("grossProfit")))
                    + " 和 AUD " + money(ReportQueryService.toDecimal(second.get("grossProfit")))
                    + "（税前营业额减成本）。数据来源：Orithos POS 报表。"
                : "; gross profit was AUD " + money(ReportQueryService.toDecimal(first.get("grossProfit")))
                    + " and AUD " + money(ReportQueryService.toDecimal(second.get("grossProfit")))
                    + " (ex-GST sales less cost). Source: Orithos POS report.");
    }

    private String comparisonRefundDisclosure(Map<String, Object> first, Map<String, Object> second,
                                              String firstDate, String secondDate, boolean chinese) {
        List<String> breakdown = new java.util.ArrayList<>();
        addRefundBreakdown(breakdown, first, firstDate, chinese);
        addRefundBreakdown(breakdown, second, secondDate, chinese);
        if (breakdown.isEmpty()) return "";
        return chinese
                ? "；退款拆分：" + String.join("；", breakdown)
                : "; refunds: " + String.join("; ", breakdown);
    }

    private void addRefundBreakdown(List<String> breakdown, Map<String, Object> row,
                                    String date, boolean chinese) {
        BigDecimal refunds = ReportQueryService.toDecimal(row.get("refunds"));
        if (refunds.signum() <= 0) return;
        String count = positiveCount(row.get("refundTransactions"));
        Object grossSalesValue = row.get("grossSales");
        String grossSales = grossSalesValue == null ? ""
                : "gross sales AUD " + money(ReportQueryService.toDecimal(grossSalesValue));
        if (chinese) {
            breakdown.add(date + "退款 AUD " + money(refunds)
                    + (count.isEmpty() ? "" : "（" + count + " 笔")
                    + (grossSales.isEmpty() ? "" : (count.isEmpty() ? "（" : "，")
                            + "退款前销售额 AUD " + money(ReportQueryService.toDecimal(grossSalesValue)))
                    + (count.isEmpty() && !grossSales.isEmpty() || !count.isEmpty() ? "）" : ""));
            return;
        }
        String refundCount = count.isEmpty() ? "" : count
                + ("1".equals(count) ? " refund transaction" : " refund transactions");
        String details = refundCount.isEmpty() ? grossSales
                : grossSales.isEmpty() ? refundCount : refundCount + "; " + grossSales;
        breakdown.add(date + " AUD " + money(refunds)
                + (details.isEmpty() ? "" : " (" + details + ")"));
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
        String range = rangeText(from, to, chinese);
        String aov = "AUD " + money(ReportQueryService.toDecimal(row.get("aov")));
        String tickets = ReportQueryService.toDecimal(row.get("tickets")).stripTrailingZeros().toPlainString();
        if (chinese) {
            return range + "平均客单价 " + aov + "，基于 " + tickets + " 笔销售交易。数据来源：Orithos POS 报表。";
        }
        return "Average Ticket for " + range + " is " + aov + " across " + tickets
                + ("1".equals(tickets) ? " sale transaction. Source: Orithos POS report."
                : " sales transactions. Source: Orithos POS report.");
    }

    private String formatStock(List<Map<String, Object>> rows, String query, boolean chinese) {
        String label = query == null || query.isBlank() ? (chinese ? "当前库存" : "Stock") : query;
        if (rows.size() == 1) {
            Map<String, Object> row = rows.get(0);
            String name = String.valueOf(row.getOrDefault("name", ""));
            BigDecimal quantity = ReportQueryService.toDecimal(row.get("quantity"));
            String amount = quantity.stripTrailingZeros().toPlainString();
            if (quantity.signum() < 0) {
                return chinese
                        ? name + "：系统记录库存为 " + amount + " 件，负库存属于数据异常，请核查库存记录。"
                                + stockAsOfSuffix(rows, true)
                        : name + ": system-recorded stock is " + amount
                                + "; negative stock is a data anomaly and should be reviewed."
                                + stockAsOfSuffix(rows, false);
            }
            return name + (chinese ? "库存：" : ": ") + amount + (chinese ? " 件" : "")
                    + stockAsOfSuffix(rows, chinese);
        }

        StringBuilder sb = new StringBuilder();
        boolean resultLimitReached = rows.size() >= STOCK_RESULT_LIMIT;
        if (chinese) {
            sb.append(resultLimitReached ? "至少 50 个商品匹配 " : "多个商品匹配 ").append(label).append("：");
        } else {
            sb.append(resultLimitReached ? "At least 50 products match " : "Multiple products match ")
                    .append(label).append(": ");
        }
        int n = Math.min(rows.size(), 8);
        sb.append(rows.stream().limit(n)
                .map(row -> String.valueOf(row.getOrDefault("name", "")))
                .collect(Collectors.joining(chinese ? "；" : "; ")));
        if (rows.size() > n) sb.append(chinese ? "……等" : " …and more");
        sb.append(chinese
                ? "。请提供准确商品名称或条码，以查询单个商品库存。"
                : ". Please specify the exact product name or barcode to check one item's stock.");
        return sb.toString();
    }

    private static String stockAsOfSuffix(List<Map<String, Object>> rows, boolean chinese) {
        String dataAsOf = trustedStockDataAsOf(rows);
        if (dataAsOf == null) {
            return chinese ? "（库存更新时间未知，请核实）"
                    : " (inventory update time unknown; verify before relying on it)";
        }
        return (chinese ? "（库存更新于 " : " (inventory updated: ") + dataAsOf + (chinese ? "）" : ")");
    }

    private static String trustedStockDataAsOf(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) return null;
        List<String> timestamps = rows.stream()
                .map(row -> row.get("dataAsOf"))
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .filter(value -> !value.isBlank())
                .toList();
        return timestamps.size() == rows.size()
                ? timestamps.stream().min(String::compareTo).orElse(null)
                : null;
    }

    private String formatDead(List<Map<String, Object>> rows, String days, String from, String to, boolean chinese) {
        String prefix = rows.size() == 50 ? "Top 50 " : rows.size() + " ";
        if (chinese) {
            String summary = rows.size() == 50
                    ? "最近" + days + "天内符合条件的滞销商品，最多展示前50个"
                    : "最近" + days + "天内，发现 " + rows.size() + " 个滞销商品";
            String dateRange = chineseDateRange(from, to);
            return summary + "（当前库存大于0，期间销量为0）。"
                    + "数据来源：Orithos 当前库存及 POS 销售记录"
                    + (dateRange.isBlank() ? "。" : "；销售统计区间：" + dateRange + "。");
        }
        return prefix + "dead-stock item(s) in the last " + days
                + " days (on hand > 0, qty sold = 0)."
                + " Source: Orithos on-hand stock and POS sales; sales period: " + rangeText(from, to) + ".";
    }

    private static String chineseDateRange(String from, String to) {
        if (from == null || from.isBlank()) return to == null ? "" : to;
        if (to == null || to.isBlank() || from.equals(to)) return from;
        return from + " 至 " + to;
    }

    private String formatStockValue(List<Map<String, Object>> rows, boolean chinese) {
        Map<String, Object> summary = rows.get(0);
        boolean hasStoreTotal = summary.containsKey("store_inventory_value_total");
        BigDecimal storeTotal = ReportQueryService.toDecimal(summary.get("store_inventory_value_total"));
        int valuedCount = ReportQueryService.toDecimal(summary.get("valued_product_count")).intValue();
        int excludedCount = ReportQueryService.toDecimal(summary.get("excluded_product_count")).intValue();
        if (hasStoreTotal && valuedCount == 0) {
            return chinese
                    ? "库存金额暂不可用：没有可验证的商品成本；有库存但未计价的商品数为 " + excludedCount + "。"
                    : "Inventory value is unavailable because no on-hand products have verifiable positive costs; "
                            + excludedCount + " products were not valued.";
        }
        BigDecimal topTotal = BigDecimal.ZERO;
        StringBuilder sb = new StringBuilder(chinese ? "库存资金占用最高的商品：" : "Top inventory cash usage: ");
        int n = Math.min(rows.size(), 8);
        int displayed = 0;
        for (int i = 0; i < n; i++) {
            Map<String, Object> row = rows.get(i);
            Object rawValue = row.get("inventory_value");
            if (rawValue == null) continue;
            BigDecimal value = ReportQueryService.toDecimal(rawValue);
            topTotal = topTotal.add(value);
            if (displayed++ > 0) sb.append("; ");
            sb.append(row.getOrDefault("name", "")).append(" AUD ").append(money(value));
        }
        if (hasStoreTotal) {
            if (chinese) {
                sb.append("。已知成本库存小计 AUD ").append(money(storeTotal))
                        .append("，覆盖 ").append(valuedCount).append(" 个商品；另有 ")
                        .append(excludedCount).append(" 个商品未计价，完整库存金额暂不可用。前 ")
                        .append(Math.min(8, valuedCount)).append(" 个商品小计 AUD ").append(money(topTotal))
                        .append("。数据来源：Orithos 当前库存和商品成本快照。");
            } else {
                sb.append(". Known-cost on-hand inventory subtotal: AUD ")
                        .append(money(storeTotal)).append(" across ").append(valuedCount)
                        .append(" products; ").append(excludedCount)
                        .append(" products were not valued, so the complete inventory value is unavailable. Top ")
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

    private static String rangeText(String from, String to, boolean chinese) {
        if (!chinese) return rangeText(from, to);
        if (from == null || from.isBlank()) {
            return to == null || to.isBlank() ? "所选期间" : to;
        }
        return chineseDateRange(from, to);
    }

    private static String money(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}
