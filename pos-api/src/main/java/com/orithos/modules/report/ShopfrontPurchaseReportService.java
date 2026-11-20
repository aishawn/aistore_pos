package com.orithos.modules.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.orithos.common.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class ShopfrontPurchaseReportService {
    private static final int PAGE_SIZE = 600;
    private static final int MAX_PAGES = 20;

    private final JdbcTemplate jdbc;
    private final RestClient client;
    private final String sourceStoreKey;
    private final String integrationToken;

    public ShopfrontPurchaseReportService(
            JdbcTemplate jdbc,
            RestClient.Builder restClientBuilder,
            @Value("${app.shopfront.source-report-base-url:http://shopfront-crawler:8000}") String baseUrl,
            @Value("${app.shopfront.source-report-store-key:skr}") String sourceStoreKey,
            @Value("${app.shopfront.integration-token:}") String integrationToken) {
        this.jdbc = jdbc;
        this.client = restClientBuilder.baseUrl(baseUrl.replaceAll("/+$", "")).build();
        this.sourceStoreKey = sourceStoreKey;
        this.integrationToken = integrationToken;
    }

    public Map<String, Object> purchaseReport(long vendorId, long outletId, LocalDate from, LocalDate to,
                                               String groupBy) {
        requireReportOutlet(vendorId, outletId);
        String normalizedGroup = normalizeGroupBy(groupBy);
        if (integrationToken.isBlank() || sourceStoreKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Shopfront purchase reporting is not configured");
        }

        List<JsonNode> sourceRows = new ArrayList<>();
        JsonNode first = fetchPage(from, to, normalizedGroup, 1);
        JsonNode pagination = first.path("pagination");
        int total = pagination.path("total").asInt(-1);
        int pages = total < 0 ? 1 : Math.max(1, (total + PAGE_SIZE - 1) / PAGE_SIZE);
        if (pages > MAX_PAGES) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Shopfront purchase report returned too many groups");
        }
        appendRows(sourceRows, first.path("data"));
        for (int page = 2; page <= pages; page++) {
            appendRows(sourceRows, fetchPage(from, to, normalizedGroup, page).path("data"));
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        boolean feesAvailable = false;
        boolean freightAvailable = false;
        boolean paymentFeesAvailable = false;
        boolean taxAvailable = false;
        BigDecimal totalCost = BigDecimal.ZERO;
        BigDecimal fees = BigDecimal.ZERO;
        BigDecimal freight = BigDecimal.ZERO;
        BigDecimal paymentFees = BigDecimal.ZERO;
        BigDecimal taxAmount = BigDecimal.ZERO;
        long orderCount = 0;

        for (JsonNode source : sourceRows) {
            BigDecimal rowCost = requiredMoney(source, "Total Cost");
            BigDecimal rowFees = money(source.get("Fees"));
            BigDecimal rowFreight = money(source.get("Freight"));
            BigDecimal rowPaymentFees = money(source.get("Payment Fees"));
            BigDecimal rowTax = money(source.get("Tax Amount"));
            long rowOrders = source.path("Orders").asLong(0);
            feesAvailable |= rowFees != null;
            freightAvailable |= rowFreight != null;
            paymentFeesAvailable |= rowPaymentFees != null;
            taxAvailable |= rowTax != null;
            totalCost = totalCost.add(rowCost);
            if (rowFees != null) fees = fees.add(rowFees);
            if (rowFreight != null) freight = freight.add(rowFreight);
            if (rowPaymentFees != null) paymentFees = paymentFees.add(rowPaymentFees);
            if (rowTax != null) taxAmount = taxAmount.add(rowTax);
            orderCount += rowOrders;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", null);
            row.put("name", source.path("Name").asText("Unknown"));
            row.put("orderCount", rowOrders);
            row.put("totalCost", moneyValue(rowCost));
            row.put("fees", moneyValue(rowFees));
            row.put("freight", moneyValue(rowFreight));
            row.put("paymentFees", moneyValue(rowPaymentFees));
            row.put("taxAmount", moneyValue(rowTax));
            row.put("feesAvailable", rowFees != null);
            row.put("freightAvailable", rowFreight != null);
            row.put("paymentFeesAvailable", rowPaymentFees != null);
            row.put("taxAvailable", rowTax != null);
            rows.add(row);
        }

        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("orderCount", orderCount);
        totals.put("totalCost", moneyValue(totalCost));
        totals.put("fees", feesAvailable ? moneyValue(fees) : null);
        totals.put("freight", freightAvailable ? moneyValue(freight) : null);
        totals.put("paymentFees", paymentFeesAvailable ? moneyValue(paymentFees) : null);
        totals.put("taxAmount", taxAvailable ? moneyValue(taxAmount) : null);

        String freshness = first.path("freshness").asText("unknown");
        String cache = first.path("cache").asText("unknown");
        String fetchedAt = first.path("fetched_at").asText("");
        Map<String, Object> diagnostics = new LinkedHashMap<>();
        diagnostics.put("available", true);
        diagnostics.put("source", "shopfront_reporting_api");
        diagnostics.put("freshness", freshness);
        diagnostics.put("cache", cache);
        diagnostics.put("fetchedAt", fetchedAt);
        diagnostics.put("sourceStoreKey", sourceStoreKey);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("source", "shopfront_reporting_api");
        result.put("from", from.toString());
        result.put("to", to.toString());
        result.put("groupBy", normalizedGroup);
        result.put("timezone", "Australia/Melbourne");
        result.put("inclusion", "Shopfront Reporting API purchase orders for the selected date range");
        result.put("rows", rows);
        result.put("totals", totals);
        result.put("feesAvailable", feesAvailable);
        result.put("freightAvailable", freightAvailable);
        result.put("paymentFeesAvailable", paymentFeesAvailable);
        result.put("taxAvailable", taxAvailable);
        result.put("diagnostics", diagnostics);
        result.put("parityNotes", List.of(
                "Purchase amounts and charge fields are returned by the Shopfront Reporting API.",
                freshness.equals("fresh") ? "The Shopfront report data is current." :
                        "The displayed source snapshot is not confirmed current."
        ));
        return result;
    }

    private JsonNode fetchPage(LocalDate from, LocalDate to, String groupBy, int page) {
        try {
            JsonNode response = client.get()
                    .uri(uri -> uri.path("/api/source-reports/purchase")
                            .queryParam("store", sourceStoreKey)
                            .queryParam("from", from)
                            .queryParam("to", to)
                            .queryParam("groupBy", groupBy)
                            .queryParam("page", page)
                            .queryParam("size", PAGE_SIZE)
                            .build())
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + integrationToken)
                    .retrieve()
                    .body(JsonNode.class);
            if (response == null || response.path("source").asText().isBlank()) {
                throw new IllegalStateException("Shopfront crawler returned an invalid purchase report");
            }
            return response;
        } catch (RestClientException | IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Shopfront purchase report is unavailable", ex);
        }
    }

    private void requireReportOutlet(long vendorId, long outletId) {
        Integer owned = jdbc.queryForObject(
                "SELECT COUNT(*) FROM outlet WHERE id = ? AND vendor_id = ? AND deleted_at IS NULL",
                Integer.class, outletId, vendorId);
        if (owned == null || owned != 1) {
            throw new BusinessException(40300, "The report outlet is not available to this vendor.");
        }
    }

    private static void appendRows(List<JsonNode> rows, JsonNode data) {
        if (data == null || !data.isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Shopfront purchase report returned invalid rows");
        }
        data.forEach(rows::add);
    }

    private static String normalizeGroupBy(String groupBy) {
        if (groupBy == null || groupBy.isBlank()) return "outlet";
        return switch (groupBy.trim().toLowerCase(Locale.ROOT)) {
            case "outlet", "supplier", "none" -> groupBy.trim().toLowerCase(Locale.ROOT);
            default -> "outlet";
        };
    }

    private static BigDecimal requiredMoney(JsonNode row, String key) {
        BigDecimal value = money(row.get(key));
        if (value == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Shopfront purchase report omitted " + key);
        }
        return value;
    }

    private static BigDecimal money(JsonNode value) {
        if (value == null || value.isNull()) return null;
        if (value.isNumber()) return value.decimalValue();
        String text = value.asText().trim();
        if (text.isBlank() || text.equals("—") || text.equals("-") || text.equalsIgnoreCase("n/a")) return null;
        boolean negative = text.startsWith("(") && text.endsWith(")");
        String normalized = text.replace("−", "-").replace(",", "")
                .replaceAll("[^0-9.\\-]", "");
        if (normalized.isBlank()) return null;
        try {
            BigDecimal parsed = new BigDecimal(normalized);
            return negative ? parsed.abs().negate() : parsed;
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Shopfront purchase report returned an invalid amount", ex);
        }
    }

    private static BigDecimal moneyValue(BigDecimal value) {
        return value == null ? null : value.setScale(2, RoundingMode.HALF_UP);
    }
}
