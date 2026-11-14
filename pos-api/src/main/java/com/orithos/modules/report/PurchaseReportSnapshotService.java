package com.orithos.modules.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class PurchaseReportSnapshotService {
    private static final List<String> MONEY_FIELDS = List.of("Total Cost", "Fees", "Freight", "Payment Fees", "Tax Amount");

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public PurchaseReportSnapshotService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> purchaseReport(long vendorId, long outletId, LocalDate from, LocalDate to,
                                               String groupBy) {
        Integer owned = jdbc.queryForObject(
                "SELECT COUNT(*) FROM outlet WHERE id = ? AND vendor_id = ? AND deleted_at IS NULL",
                Integer.class, outletId, vendorId);
        if (owned == null || owned != 1) {
            throw new com.orithos.common.BusinessException(40300,
                    "The report outlet is not available to this vendor.");
        }
        String normalizedGroup = ReportQueryService.normalizePurchaseGroupBy(groupBy);
        String storedGroup = "supplier".equals(normalizedGroup) ? "supplier" : "outlet";
        List<Map<String, Object>> snapshots = jdbc.queryForList("""
                SELECT business_date, rows_json, fetched_at
                FROM shopfront_purchase_report_snapshot
                WHERE outlet_id = ? AND business_date >= ? AND business_date <= ? AND group_by = ?
                ORDER BY business_date
                """, outletId, from.toString(), to.toString(), storedGroup);

        Map<String, Map<String, Object>> grouped = new LinkedHashMap<>();
        List<String> snapshotDays = new ArrayList<>();
        LocalDate latestFetchedDay = null;
        String latestFetchedAt = null;
        boolean feesAvailable = false;
        boolean freightAvailable = false;
        boolean paymentFeesAvailable = false;
        boolean taxAvailable = false;
        for (Map<String, Object> snapshot : snapshots) {
            LocalDate day = LocalDate.parse(String.valueOf(snapshot.get("business_date")).substring(0, 10));
            snapshotDays.add(day.toString());
            if (latestFetchedDay == null || day.isAfter(latestFetchedDay)) {
                latestFetchedDay = day;
                latestFetchedAt = String.valueOf(snapshot.get("fetched_at"));
            }
            JsonNode rows = readRows(snapshot.get("rows_json"));
            for (JsonNode source : rows) {
                String name = "none".equals(normalizedGroup)
                        ? "All received purchase orders"
                        : source.path("Name").asText("Unknown");
                Map<String, Object> target = grouped.computeIfAbsent(name, ignored -> emptyAggregate(name));
                target.put("orderCount", ((Long) target.get("orderCount")) + source.path("Orders").asLong(0));
                for (String field : MONEY_FIELDS) {
                    BigDecimal value = money(source.get(field));
                    if (value == null) continue;
                    String key = responseKey(field);
                    BigDecimal current = (BigDecimal) target.get(key);
                    target.put(key, current == null ? value : current.add(value));
                    switch (field) {
                        case "Fees" -> { feesAvailable = true; target.put("feesAvailable", true); }
                        case "Freight" -> { freightAvailable = true; target.put("freightAvailable", true); }
                        case "Payment Fees" -> { paymentFeesAvailable = true; target.put("paymentFeesAvailable", true); }
                        case "Tax Amount" -> { taxAvailable = true; target.put("taxAvailable", true); }
                        default -> { }
                    }
                }
            }
        }

        List<String> missingDays = missingDays(from, to, snapshotDays);
        List<Map<String, Object>> resultRows = new ArrayList<>();
        BigDecimal totalCost = BigDecimal.ZERO;
        BigDecimal fees = BigDecimal.ZERO;
        BigDecimal freight = BigDecimal.ZERO;
        BigDecimal paymentFees = BigDecimal.ZERO;
        BigDecimal taxAmount = BigDecimal.ZERO;
        long orderCount = 0;
        for (Map<String, Object> row : grouped.values()) {
            orderCount += (Long) row.get("orderCount");
            totalCost = totalCost.add((BigDecimal) row.get("totalCost"));
            fees = fees.add(decimalOrZero(row.get("fees")));
            freight = freight.add(decimalOrZero(row.get("freight")));
            paymentFees = paymentFees.add(decimalOrZero(row.get("paymentFees")));
            taxAmount = taxAmount.add(decimalOrZero(row.get("taxAmount")));
            row.replaceAll((key, value) -> value instanceof BigDecimal amount ? amount.setScale(2, RoundingMode.HALF_UP) : value);
            resultRows.add(row);
        }

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("orderCount", orderCount);
        totals.put("totalCost", moneyValue(totalCost));
        totals.put("fees", feesAvailable ? moneyValue(fees) : null);
        totals.put("freight", freightAvailable ? moneyValue(freight) : null);
        totals.put("paymentFees", paymentFeesAvailable ? moneyValue(paymentFees) : null);
        totals.put("taxAmount", taxAvailable ? moneyValue(taxAmount) : null);

        Map<String, Object> diagnostics = new LinkedHashMap<>();
        diagnostics.put("available", true);
        diagnostics.put("source", "orithos_purchase_report_snapshot");
        diagnostics.put("snapshotDays", snapshotDays.size());
        diagnostics.put("missingDays", missingDays);
        diagnostics.put("latestFetchedAt", latestFetchedAt);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("source", "orithos_ledger");
        result.put("from", from.toString());
        result.put("to", to.toString());
        result.put("groupBy", normalizedGroup);
        result.put("timezone", "Australia/Adelaide");
        result.put("inclusion", "Shopfront purchase report snapshots imported into the Orithos ledger by business date");
        result.put("rows", resultRows);
        result.put("totals", totals);
        result.put("feesAvailable", feesAvailable);
        result.put("freightAvailable", freightAvailable);
        result.put("paymentFeesAvailable", paymentFeesAvailable);
        result.put("taxAvailable", taxAvailable);
        result.put("diagnostics", diagnostics);
        result.put("parityNotes", missingDays.isEmpty()
                ? List.of("All requested business dates have imported Orithos purchase report snapshots.")
                : List.of("Some requested business dates have not been imported into Orithos yet."));
        return result;
    }

    private JsonNode readRows(Object raw) {
        try {
            JsonNode rows = objectMapper.readTree(String.valueOf(raw));
            if (rows == null || !rows.isArray()) throw new IllegalArgumentException("rows_json is not an array");
            return rows;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "An imported purchase report snapshot is invalid", ex);
        }
    }

    private static Map<String, Object> emptyAggregate(String name) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", null);
        row.put("name", name);
        row.put("orderCount", 0L);
        row.put("totalCost", BigDecimal.ZERO);
        row.put("fees", null);
        row.put("freight", null);
        row.put("paymentFees", null);
        row.put("taxAmount", null);
        row.put("feesAvailable", false);
        row.put("freightAvailable", false);
        row.put("paymentFeesAvailable", false);
        row.put("taxAvailable", false);
        return row;
    }

    private static String responseKey(String field) {
        return switch (field) {
            case "Total Cost" -> "totalCost";
            case "Payment Fees" -> "paymentFees";
            case "Tax Amount" -> "taxAmount";
            default -> field.toLowerCase(Locale.ROOT);
        };
    }

    private static BigDecimal money(JsonNode value) {
        if (value == null || value.isNull()) return null;
        if (value.isNumber()) return value.decimalValue();
        String text = value.asText().trim();
        if (text.isBlank() || text.equals("—") || text.equals("-") || text.equalsIgnoreCase("n/a")) return null;
        boolean negative = text.startsWith("(") && text.endsWith(")");
        String normalized = text.replace("−", "-").replace(",", "").replaceAll("[^0-9.\\-]", "");
        if (normalized.isBlank()) return null;
        try {
            BigDecimal parsed = new BigDecimal(normalized);
            return negative ? parsed.abs().negate() : parsed;
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "An imported purchase report contains an invalid amount", ex);
        }
    }

    private static List<String> missingDays(LocalDate from, LocalDate to, List<String> present) {
        List<String> missing = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            if (!present.contains(day.toString())) missing.add(day.toString());
        }
        return missing;
    }

    private static BigDecimal moneyValue(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal decimalOrZero(Object value) {
        return value instanceof BigDecimal amount ? amount : BigDecimal.ZERO;
    }
}
