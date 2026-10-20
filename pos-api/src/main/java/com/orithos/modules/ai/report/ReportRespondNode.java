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

/**
 * Builds the report answer / snapshot title. Always English so saved reports
 * stay consistent regardless of the user's question language.
 */
@Component
public class ReportRespondNode implements NodeAction {

    private final AiReportAuditService auditService;

    public ReportRespondNode(AiReportAuditService auditService) {
        this.auditService = auditService;
    }

    @Override
    public Map<String, Object> apply(OverAllState state) {
        String intent = ReportGraphState.string(state, "intent");
        String error = ReportGraphState.string(state, "sql_error");
        if (error != null && !error.isBlank()) {
            auditService.record(state);
            return Map.of("answer", messageForError(error));
        }
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) state.value("report_rows").orElse(List.of());
        Map<String, String> slots = ReportGraphState.slots(state);
        String from = slots.getOrDefault("from", "");
        String to = slots.getOrDefault("to", "");
        Map<String, Object> result = Map.of("answer", format(intent, rows, from, to, slots));
        auditService.record(state);
        return result;
    }

    private String format(String intent, List<Map<String, Object>> rows, String from, String to,
                          Map<String, String> slots) {
        if (rows == null || rows.isEmpty()) {
            return "No data found for " + rangeText(from, to) + ".";
        }
        return switch (intent == null ? "" : intent) {
            case "report_aov" -> formatAov(rows.get(0), from, to);
            case "report_stock" -> formatStock(rows, slots.get("query"));
            case "report_dead_stock" -> formatDead(rows, slots.getOrDefault("days", "30"));
            case "report_qty" -> formatSeries(rows, "qty", "Quantity", from, to);
            case "report_adhoc" -> formatAdhoc(rows, from, to);
            default -> formatSeries(rows, "sales", "Sales", from, to);
        };
    }

    private String formatSeries(List<Map<String, Object>> rows, String metricKey, String label,
                                String from, String to) {
        BigDecimal total = BigDecimal.ZERO;
        for (Map<String, Object> row : rows) {
            total = total.add(ReportQueryService.toDecimal(row.get(metricKey)));
        }
        String range = rangeText(from, to);
        String sum = money(total);
        return label + " for " + range + " total " + sum + " (" + rows.size() + " day(s)).";
    }

    private String formatAov(Map<String, Object> row, String from, String to) {
        String range = rangeText(from, to);
        String aov = money(ReportQueryService.toDecimal(row.get("aov")));
        String tickets = ReportQueryService.toDecimal(row.get("tickets")).stripTrailingZeros().toPlainString();
        return "Average Ticket for " + range + " is " + aov + " across " + tickets + " sale(s).";
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

    private String formatDead(List<Map<String, Object>> rows, String days) {
        return rows.size() + " dead-stock item(s) in the last " + days + " days (on hand > 0, qty sold = 0).";
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

    private String messageForError(String error) {
        if (error.startsWith("GUARD:") || error.startsWith("NL2SQL_")) {
            return "That question cannot be queried (security check failed).";
        }
        return switch (error) {
            case "NO_PERMISSION" -> "You do not have permission to query reports.";
            case "NO_OUTLET" -> "Your account is not bound to a store.";
            case "NEED_PRODUCT" ->
                    "Please tell me the product name, for example: how much Coca Cola is in stock.";
            case "ODOO_REPORT_NOT_CONFIGURED" ->
                    "Live sales reporting is not configured for this store. Contact your administrator.";
            case "ODOO_REPORT_STORE_UNLINKED" ->
                    "This store is not linked to an Odoo company for live reporting. Contact your administrator.";
            case "ODOO_REPORT_UNSUPPORTED" ->
                    "That report type is not available from live Odoo data yet. Try sales, quantity, average ticket, stock, or dead stock.";
            case "ODOO_REPORT_UNAVAILABLE" ->
                    "Live Odoo reporting is temporarily unavailable. Please try again.";
            case "ODOO_REPORT_TOO_LARGE" ->
                    "That report is too large to summarize safely. Add a product filter or narrow the date range.";
            case "QUOTA_EXCEEDED" ->
                    "This store has reached its hourly report quota. Try again later.";
            default -> "The query failed. Please try again.";
        };
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
