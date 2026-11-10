package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.AustraliaTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Writes Shopfront sale payloads into the native Orithos {@code sale}/{@code sale_item}
 * ledger. Historical promotions intentionally skip stock movements.
 */
@Service
public class ShopfrontNativeSaleImporter {

    public static final String SOURCE_SYSTEM = "shopfront";

    private static final Logger log = LoggerFactory.getLogger(ShopfrontNativeSaleImporter.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public ShopfrontNativeSaleImporter(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> upsertSales(String storeKey, long outletId, JsonNode items) {
        Map<String, Object> result = new LinkedHashMap<>();
        int created = 0;
        int updated = 0;
        int skipped = 0;
        int unmatchedLines = 0;
        List<String> errors = new ArrayList<>();
        if (items == null || !items.isArray()) {
            result.put("created", 0);
            result.put("updated", 0);
            result.put("skipped", 0);
            result.put("unmatched_lines", 0);
            return result;
        }
        Map<String, Long> productCache = loadProductMappings(storeKey);
        for (JsonNode sale : items) {
            try {
                String externalId = text(sale, "external_id");
                if (externalId == null || externalId.isBlank()) {
                    skipped++;
                    continue;
                }
                validateImportableSale(sale);
                UpsertOutcome outcome = upsertOne(storeKey, outletId, sale, externalId, productCache);
                if (outcome.created()) {
                    created++;
                } else {
                    updated++;
                }
                unmatchedLines += outcome.unmatchedLines();
            } catch (Exception ex) {
                skipped++;
                if (errors.size() < 25) {
                    errors.add(ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage());
                }
                log.warn("Native Shopfront sale upsert failed store={} message={}", storeKey, ex.getMessage());
            }
        }
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        result.put("unmatched_lines", unmatchedLines);
        if (!errors.isEmpty()) {
            result.put("errors", errors);
        }
        return result;
    }

    /**
     * Promote durable {@code shopfront_sale*} mirror rows into the native ledger
     * for one store mapping. No inventory movements. Processes a bounded page so
     * callers can loop without gateway timeouts.
     */
    public Map<String, Object> promoteFromMirror(String storeKey, long outletId) {
        return promoteFromMirror(storeKey, outletId, null, 500, null);
    }

    public Map<String, Object> promoteFromMirror(String storeKey, long outletId, String afterExternalId,
                                                 int limit, String businessDay) {
        int pageSize = Math.max(1, Math.min(limit <= 0 ? 500 : limit, 2000));
        StringBuilder sql = new StringBuilder(
                "SELECT external_id, invoice_id, status, created_at, updated_at, total_price, total_tax, "
                        + "total_discount, total_cost, customer_reference, raw_payload "
                        + "FROM shopfront_sale WHERE store_key = ?");
        List<Object> args = new ArrayList<>();
        args.add(storeKey);
        if (afterExternalId != null && !afterExternalId.isBlank()) {
            sql.append(" AND external_id > ?");
            args.add(afterExternalId);
        }
        if (businessDay != null && !businessDay.isBlank()) {
            // Match SoldAt parsing: offset/Z timestamps convert to Adelaide; naive timestamps are Adelaide local.
            sql.append("""
                     AND (
                       CASE
                         WHEN NULLIF(created_at, '') ~* '([zZ]|[+-][0-9]{2}:?[0-9]{2})$'
                           THEN (timezone('Australia/Adelaide', created_at::timestamptz))::date
                         ELSE DATE(created_at::timestamp)
                       END
                     ) = CAST(? AS date)
                    """);
            args.add(businessDay);
        }
        sql.append(" ORDER BY external_id LIMIT ?");
        args.add(pageSize);
        List<Map<String, Object>> sales = jdbc.queryForList(sql.toString(), args.toArray());
        var items = objectMapper.createArrayNode();
        int rebuildFailures = 0;
        String lastExternalId = afterExternalId;
        for (Map<String, Object> row : sales) {
            try {
                String externalId = stringValue(row.get("external_id"));
                lastExternalId = externalId;
                items.add(rebuildSaleNode(storeKey, row));
            } catch (Exception ex) {
                rebuildFailures++;
                log.warn("Failed to rebuild mirror sale for promote store={} message={}", storeKey, ex.getMessage());
            }
        }
        Map<String, Object> result = upsertSales(storeKey, outletId, items);
        result.put("mirror_sales", sales.size());
        result.put("rebuild_failures", rebuildFailures);
        result.put("batch_size", pageSize);
        result.put("last_external_id", lastExternalId);
        result.put("has_more", sales.size() >= pageSize);
        result.put("business_day", businessDay);
        return result;
    }

    private com.fasterxml.jackson.databind.node.ObjectNode rebuildSaleNode(String storeKey, Map<String, Object> row) {
        JsonNode payload = parsePayload(row.get("raw_payload"));
        var saleNode = objectMapper.createObjectNode();
        String externalId = stringValue(row.get("external_id"));
        saleNode.put("external_id", externalId);
        saleNode.put("source_complete", true);
        putText(saleNode, "invoice_id", firstNonBlank(
                text(payload, "invoice_id"), text(payload, "invoiceId"), stringValue(row.get("invoice_id"))));
        putText(saleNode, "status", firstNonBlank(text(payload, "status"), stringValue(row.get("status"))));
        putText(saleNode, "created_at", firstNonBlank(
                text(payload, "created_at"), text(payload, "createdAt"), stringValue(row.get("created_at"))));
        putText(saleNode, "updated_at", firstNonBlank(
                text(payload, "updated_at"), text(payload, "updatedAt"), stringValue(row.get("updated_at"))));
        BigDecimal columnTotal = decimal(row.get("total_price"));
        BigDecimal payloadTotal = firstDecimal(payload, "total_price", "totalPrice");
        BigDecimal totalPrice = firstNonNullDecimal(payloadTotal, columnTotal);
        if (totalPrice == null) {
            totalPrice = BigDecimal.ZERO;
        }
        saleNode.put("total_price", totalPrice);
        BigDecimal tax = firstNonNullDecimal(
                firstDecimal(payload, "total_tax", "totalTax"), decimal(row.get("total_tax")));
        BigDecimal discount = firstNonNullDecimal(
                firstDecimal(payload, "total_discount", "totalDiscount"), decimal(row.get("total_discount")));
        BigDecimal cost = firstNonNullDecimal(
                firstDecimal(payload, "total_cost", "totalCost"), decimal(row.get("total_cost")));
        if (tax != null) saleNode.put("total_tax", tax);
        if (discount != null) saleNode.put("total_discount", discount);
        if (cost != null) saleNode.put("total_cost", cost);
        putText(saleNode, "customer_reference", stringValue(row.get("customer_reference")));

        var lineItems = objectMapper.createArrayNode();
        List<Map<String, Object>> mirrorItems = jdbc.queryForList(
                "SELECT line_key, source_product_id, product_name, quantity, unit_price, line_total, cost, tax, raw_payload "
                        + "FROM shopfront_sale_item WHERE store_key = ? AND external_sale_id = ? ORDER BY line_key",
                storeKey, externalId);
        if (mirrorItems.isEmpty() && payload.path("items").isArray()) {
            lineItems.addAll((com.fasterxml.jackson.databind.node.ArrayNode) payload.path("items"));
        } else {
            for (Map<String, Object> item : mirrorItems) {
                var line = objectMapper.createObjectNode();
                line.put("id", stringValue(item.get("line_key")));
                putText(line, "source_product_id", stringValue(item.get("source_product_id")));
                putText(line, "name", stringValue(item.get("product_name")));
                line.put("quantity", decimal(item.get("quantity")));
                line.put("unit_price", decimal(item.get("unit_price")));
                line.put("line_total", decimal(item.get("line_total")));
                line.put("cost", decimal(item.get("cost")));
                line.put("tax", decimal(item.get("tax")));
                JsonNode itemPayload = parsePayload(item.get("raw_payload"));
                if (!itemPayload.isMissingNode() && !itemPayload.isNull()) {
                    line.set("raw_payload", itemPayload);
                }
                lineItems.add(line);
            }
        }
        saleNode.set("items", lineItems);

        var payments = objectMapper.createArrayNode();
        List<Map<String, Object>> mirrorPayments = jdbc.queryForList(
                "SELECT payment_key, amount, status, subtype, raw_payload "
                        + "FROM shopfront_sale_payment WHERE store_key = ? AND external_sale_id = ? ORDER BY payment_key",
                storeKey, externalId);
        if (mirrorPayments.isEmpty() && payload.path("payments").isArray()) {
            payments.addAll((com.fasterxml.jackson.databind.node.ArrayNode) payload.path("payments"));
        } else {
            for (Map<String, Object> payment : mirrorPayments) {
                var node = objectMapper.createObjectNode();
                node.put("id", stringValue(payment.get("payment_key")));
                node.put("amount", decimal(payment.get("amount")));
                putText(node, "status", stringValue(payment.get("status")));
                putText(node, "subtype", stringValue(payment.get("subtype")));
                payments.add(node);
            }
        }
        saleNode.set("payments", payments);
        return saleNode;
    }

    private UpsertOutcome upsertOne(String storeKey, long outletId, JsonNode sale, String externalId,
                                    Map<String, Long> productCache) {
        String status = mapStatus(text(sale, "status"));
        String invoiceId = text(sale, "invoice_id");
        SoldAt soldAt = parseSoldAt(text(sale, "created_at"));
        BigDecimal totalPrice = money(decimalNode(sale, "total_price"));
        BigDecimal totalTax = nullableMoney(decimalNode(sale, "total_tax"));
        BigDecimal totalDiscount = money(decimalNode(sale, "total_discount"));
        BigDecimal totalCost = nullableMoney(decimalNode(sale, "total_cost"));
        String note = text(sale, "customer_reference");

        JsonNode saleItems = sale.path("items");
        int totalQuantity = 0;
        int unmatchedLines = 0;
        List<Object[]> itemRows = new ArrayList<>();
        if (saleItems.isArray()) {
            for (JsonNode item : saleItems) {
                BigDecimal quantity = decimalNode(item, "quantity");
                if (quantity == null) {
                    quantity = BigDecimal.ZERO;
                }
                totalQuantity += quantity.abs().setScale(0, RoundingMode.HALF_UP).intValue();
                String sourceProductId = firstNonBlank(
                        text(item, "source_product_id"),
                        text(item.path("raw_payload"), "source_product_id"),
                        text(item.path("raw_payload").path("item"), "id"));
                Long productId = resolveProductId(storeKey, outletId, sourceProductId, item, productCache);
                if (productId == null) {
                    unmatchedLines++;
                }
                String productName = firstNonBlank(text(item, "name"), text(item.path("raw_payload"), "name"),
                        text(item.path("raw_payload").path("item"), "name"), "Unmatched product");
                BigDecimal lineTotal = money(firstDecimal(item, "line_total", "total_price"));
                BigDecimal unitPrice = money(firstDecimal(item, "unit_price", "base_price"));
                if (unitPrice.signum() == 0 && quantity.signum() != 0) {
                    unitPrice = lineTotal.divide(quantity, 4, RoundingMode.HALF_UP);
                }
                BigDecimal cost = nullableMoney(decimalNode(item, "cost"));
                BigDecimal tax = money(decimalNode(item, "tax"));
                itemRows.add(new Object[]{
                        productId, outletId, quantity, cost, unitPrice, lineTotal, tax,
                        productId == null ? truncate(productName, 255) : null
                });
            }
        }
        if (totalCost == null) {
            BigDecimal summed = BigDecimal.ZERO;
            boolean complete = !itemRows.isEmpty();
            for (Object[] row : itemRows) {
                if (row[3] instanceof BigDecimal cost && row[2] instanceof BigDecimal qty) {
                    summed = summed.add(cost.multiply(qty));
                } else {
                    complete = false;
                }
            }
            if (complete) {
                totalCost = money(summed);
            }
        }

        Long existingId = findExistingSaleId(outletId, externalId);
        long saleId;
        boolean created;
        if (existingId == null) {
            saleId = insertSale(outletId, externalId, invoiceId, status, note, totalQuantity,
                    totalPrice, totalTax, totalDiscount, totalCost, soldAt);
            created = true;
        } else {
            saleId = existingId;
            updateSale(saleId, outletId, externalId, invoiceId, status, note, totalQuantity,
                    totalPrice, totalTax, totalDiscount, totalCost, soldAt);
            jdbc.update("DELETE FROM sale_payment WHERE sale_id = ?", saleId);
            jdbc.update("DELETE FROM sale_item WHERE sale_id = ?", saleId);
            created = false;
        }

        for (Object[] row : itemRows) {
            jdbc.update("""
                    INSERT INTO sale_item (sale_id, product_id, outlet_id, quantity, cost, base_price, total_price, tax, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, saleId, row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7]);
        }

        JsonNode payments = sale.path("payments");
        if (payments.isArray()) {
            for (JsonNode payment : payments) {
                BigDecimal amount = money(decimalNode(payment, "amount"));
                String paymentStatus = firstNonBlank(text(payment, "status"), "COMPLETED");
                String subtype = text(payment, "subtype");
                jdbc.update("""
                        INSERT INTO sale_payment (sale_id, payment_method_id, subtype, status, amount, outlet_id)
                        VALUES (?, NULL, ?, ?, ?, ?)
                        """, saleId, subtype, paymentStatus, amount, outletId);
            }
        }
        return new UpsertOutcome(created, unmatchedLines);
    }

    private long insertSale(long outletId, String externalId, String invoiceId, String status, String note,
                            int totalQuantity, BigDecimal totalPrice, BigDecimal totalTax, BigDecimal totalDiscount,
                            BigDecimal totalCost, SoldAt soldAt) {
        return jdbc.queryForObject("""
                INSERT INTO sale (outlet_id, status, invoice_id, note, total_quantity, total_price, total_tax,
                                  total_discount, total_cost, outstanding, total_change, cashout,
                                  business_date, local_sold_at, created_at, updated_at, source_system, external_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, ?, ?)
                RETURNING id
                """, Long.class,
                outletId, status, invoiceId, note, totalQuantity, totalPrice, totalTax, totalDiscount, totalCost,
                soldAt == null ? null : Date.valueOf(soldAt.businessDate()),
                soldAt == null ? null : Timestamp.valueOf(soldAt.localSoldAt()),
                soldAt == null ? null : Timestamp.from(soldAt.createdAtUtc()),
                SOURCE_SYSTEM, externalId);
    }

    private void updateSale(long saleId, long outletId, String externalId, String invoiceId, String status, String note,
                            int totalQuantity, BigDecimal totalPrice, BigDecimal totalTax, BigDecimal totalDiscount,
                            BigDecimal totalCost, SoldAt soldAt) {
        jdbc.update("""
                UPDATE sale SET status = ?, invoice_id = ?, note = ?, total_quantity = ?, total_price = ?,
                       total_tax = ?, total_discount = ?, total_cost = ?, outstanding = 0,
                       business_date = COALESCE(?, business_date),
                       local_sold_at = COALESCE(?, local_sold_at),
                       created_at = COALESCE(?, created_at),
                       updated_at = CURRENT_TIMESTAMP,
                       source_system = ?, external_id = ?
                WHERE id = ? AND outlet_id = ?
                """,
                status, invoiceId, note, totalQuantity, totalPrice, totalTax, totalDiscount, totalCost,
                soldAt == null ? null : Date.valueOf(soldAt.businessDate()),
                soldAt == null ? null : Timestamp.valueOf(soldAt.localSoldAt()),
                soldAt == null ? null : Timestamp.from(soldAt.createdAtUtc()),
                SOURCE_SYSTEM, externalId, saleId, outletId);
    }

    private Long findExistingSaleId(long outletId, String externalId) {
        List<Long> ids = jdbc.query(
                "SELECT id FROM sale WHERE outlet_id = ? AND source_system = ? AND external_id = ? LIMIT 2",
                (rs, rowNum) -> rs.getLong(1), outletId, SOURCE_SYSTEM, externalId);
        if (ids.size() > 1) throw new IllegalStateException("Duplicate native sale identity: " + externalId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private static void validateImportableSale(JsonNode sale) {
        String externalId = text(sale, "external_id");
        String rawStatus = text(sale, "status");
        if (rawStatus == null || !isKnownStatus(rawStatus)) {
            throw new IllegalArgumentException("Sale " + externalId + " has a missing or unknown status");
        }
        if (decimalNode(sale, "total_price") == null) {
            throw new IllegalArgumentException("Sale " + externalId + " is missing total_price");
        }
        String createdAt = text(sale, "created_at");
        if (createdAt == null || parseSoldAt(createdAt) == null) {
            throw new IllegalArgumentException("Sale " + externalId + " is missing a valid created_at");
        }
        if (!sale.path("items").isArray()) {
            throw new IllegalArgumentException("Sale " + externalId + " has no complete item list");
        }
        if (sale.path("source_complete").asBoolean(false) && decimalNode(sale, "total_tax") == null) {
            throw new IllegalArgumentException("Sale " + externalId + " is missing total_tax");
        }
    }

    private static boolean isKnownStatus(String raw) {
        return switch (raw.trim().toUpperCase(Locale.ROOT)) {
            case "COMPLETED", "CLOSED", "PAID", "FINALISED", "FINALIZED", "PARKED", "INCOMPLETE",
                    "OPEN", "SAVED", "VOIDED", "VOID", "CANCELLED", "CANCELED", "REFUNDED" -> true;
            default -> false;
        };
    }

    private Long resolveProductId(String storeKey, long outletId, String sourceProductId, JsonNode item,
                                  Map<String, Long> productCache) {
        if (sourceProductId != null && !sourceProductId.isBlank()) {
            Long mapped = productCache.get(sourceProductId);
            if (mapped != null) {
                return mapped;
            }
            try {
                Long id = jdbc.queryForObject(
                        "SELECT pos_product_id FROM shopfront_product_mapping WHERE store_key = ? AND source_product_id = ? AND status = 'MAPPED' LIMIT 1",
                        Long.class, storeKey, sourceProductId);
                if (id != null) {
                    productCache.put(sourceProductId, id);
                    return id;
                }
            } catch (Exception ignored) {
                // fall through to barcode
            }
            try {
                String barcode = jdbc.queryForObject(
                        "SELECT barcode FROM shopfront_product WHERE store_key = ? AND source_id = ? LIMIT 1",
                        String.class, storeKey, sourceProductId);
                Long byBarcode = findProductByBarcode(outletId, barcode);
                if (byBarcode != null) {
                    productCache.put(sourceProductId, byBarcode);
                    persistResolvedMapping(storeKey, sourceProductId, byBarcode);
                    return byBarcode;
                }
            } catch (Exception ignored) {
                // unmatched
            }
        }
        String barcode = firstNonBlank(text(item, "barcode"),
                text(item.path("raw_payload"), "barcode"));
        return findProductByBarcode(outletId, barcode);
    }

    private Long findProductByBarcode(long outletId, String barcode) {
        if (barcode == null || barcode.isBlank()) {
            return null;
        }
        try {
            return jdbc.queryForObject("""
                    SELECT pb.product_id FROM product_barcode pb
                    JOIN product p ON p.id = pb.product_id
                    WHERE pb.code = ? AND p.outlet_id = ? AND p.deleted_at IS NULL
                    LIMIT 1
                    """, Long.class, barcode, outletId);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, Long> loadProductMappings(String storeKey) {
        Map<String, Long> cache = new HashMap<>();
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "SELECT source_product_id, pos_product_id FROM shopfront_product_mapping WHERE store_key = ? AND status = 'MAPPED'",
                    storeKey);
            for (Map<String, Object> row : rows) {
                String source = stringValue(row.get("source_product_id"));
                Object productId = row.get("pos_product_id");
                if (source != null && productId != null) {
                    cache.put(source, Long.parseLong(String.valueOf(productId)));
                }
            }
        } catch (Exception ignored) {
            // Mapping table may not exist yet on fresh installs.
        }
        return cache;
    }

    private void persistResolvedMapping(String storeKey, String sourceProductId, long productId) {
        if (storeKey == null || storeKey.isBlank() || sourceProductId == null || sourceProductId.isBlank() || productId <= 0) {
            return;
        }
        try {
            jdbc.update("""
                    INSERT INTO shopfront_product_mapping (store_key, source_product_id, pos_product_id, match_type, status)
                    VALUES (?, ?, ?, 'BARCODE', 'MAPPED')
                    ON CONFLICT (store_key, source_product_id) DO UPDATE
                    SET pos_product_id = EXCLUDED.pos_product_id,
                        match_type = 'BARCODE',
                        status = 'MAPPED',
                        updated_at = CURRENT_TIMESTAMP
                    """, storeKey, sourceProductId, productId);
        } catch (Exception ex) {
            log.debug("Unable to persist Shopfront product mapping store={} source={}: {}",
                    storeKey, sourceProductId, ex.getMessage());
        }
    }

    static String mapStatus(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Sale status is required");
        }
        String status = raw.trim().toUpperCase(Locale.ROOT);
        return switch (status) {
            case "COMPLETED", "CLOSED", "PAID", "FINALISED", "FINALIZED" -> "COMPLETED";
            case "PARKED", "INCOMPLETE", "OPEN", "SAVED" -> "PARKED";
            case "VOIDED", "VOID", "CANCELLED", "CANCELED" -> "VOIDED";
            case "REFUNDED" -> "REFUNDED";
            default -> throw new IllegalArgumentException("Unknown sale status: " + raw);
        };
    }

    static SoldAt parseSoldAt(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String value = raw.trim();
        try {
            Instant instant = Instant.parse(value);
            return fromInstant(instant);
        } catch (DateTimeParseException ignored) {
            // try offset / local forms
        }
        try {
            OffsetDateTime odt = OffsetDateTime.parse(value);
            return fromInstant(odt.toInstant());
        } catch (DateTimeParseException ignored) {
            // continue
        }
        try {
            LocalDateTime local = LocalDateTime.parse(value);
            Instant instant = local.atZone(AustraliaTime.ZONE).toInstant();
            return fromInstant(instant);
        } catch (DateTimeParseException ignored) {
            // continue
        }
        if (value.length() >= 10) {
            try {
                LocalDate day = LocalDate.parse(value.substring(0, 10));
                Instant instant = day.atStartOfDay(AustraliaTime.ZONE).toInstant();
                return fromInstant(instant);
            } catch (DateTimeParseException ignored) {
                return null;
            }
        }
        return null;
    }

    private static SoldAt fromInstant(Instant instant) {
        var zoned = instant.atZone(AustraliaTime.ZONE);
        return new SoldAt(zoned.toLocalDate(), zoned.toLocalDateTime(), instant);
    }

    private JsonNode parsePayload(Object raw) {
        if (raw == null) {
            return objectMapper.nullNode();
        }
        if (raw instanceof JsonNode node) {
            return node;
        }
        try {
            return objectMapper.readTree(String.valueOf(raw));
        } catch (Exception e) {
            return objectMapper.nullNode();
        }
    }

    private static void putText(com.fasterxml.jackson.databind.node.ObjectNode node, String field, String value) {
        if (value != null) {
            node.put(field, value);
        }
    }

    private static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        JsonNode value = node.get(field);
        if (value == null || value.isNull() || value.asText().isBlank()) {
            return null;
        }
        return value.asText();
    }

    private static BigDecimal decimalNode(JsonNode node, String field) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        JsonNode value = node.get(field);
        if (value == null || value.isNull() || value.asText().isBlank()) {
            return null;
        }
        try {
            String text = value.asText();
            if (text != null && !text.isBlank()) {
                return new BigDecimal(text.trim());
            }
            return value.isNumber() ? value.decimalValue() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static BigDecimal firstDecimal(JsonNode node, String... fields) {
        for (String field : fields) {
            BigDecimal value = decimalNode(node, field);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static BigDecimal decimal(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        if (value instanceof BigDecimal bd) {
            return bd;
        }
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        try {
            return new BigDecimal(String.valueOf(value).trim());
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }

    private static BigDecimal firstNonNullDecimal(BigDecimal primary, BigDecimal fallback) {
        return primary != null ? primary : fallback;
    }

    private static BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal nullableMoney(BigDecimal value) {
        return value == null ? null : value.setScale(4, RoundingMode.HALF_UP);
    }

    private static String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private record UpsertOutcome(boolean created, int unmatchedLines) {}

    record SoldAt(LocalDate businessDate, LocalDateTime localSoldAt, Instant createdAtUtc) {}
}
