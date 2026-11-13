package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.JsonNode;
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
    public ShopfrontNativeSaleImporter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
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
        Map<String, Long> customerCache = loadCustomerMappings(storeKey, outletId);
        for (JsonNode sale : items) {
            try {
                String externalId = text(sale, "external_id");
                if (externalId == null || externalId.isBlank()) {
                    skipped++;
                    continue;
                }
                validateImportableSale(sale);
                UpsertOutcome outcome = upsertOne(storeKey, outletId, sale, externalId, productCache, customerCache);
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
        throw new UnsupportedOperationException("Historical sales must be read from the crawler archive and sent through sales:upsert");
    }

    public Map<String, Object> promoteFromMirror(String storeKey, long outletId, String afterExternalId,
                                                 int limit, String businessDay) {
        throw new UnsupportedOperationException("Historical sales must be read from the crawler archive and sent through sales:upsert");
    }

    private UpsertOutcome upsertOne(String storeKey, long outletId, JsonNode sale, String externalId,
                                    Map<String, Long> productCache, Map<String, Long> customerCache) {
        String status = mapStatus(text(sale, "status"));
        String invoiceId = text(sale, "invoice_id");
        SoldAt soldAt = parseSoldAt(text(sale, "created_at"));
        BigDecimal totalPrice = money(decimalNode(sale, "total_price"));
        BigDecimal totalTax = nullableMoney(decimalNode(sale, "total_tax"));
        BigDecimal totalDiscount = money(decimalNode(sale, "total_discount"));
        BigDecimal totalCost = nullableMoney(decimalNode(sale, "total_cost"));
        String note = text(sale, "customer_reference");
        Long customerId = note == null ? null : customerCache.get(note);

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
                String externalLineId = truncate(firstNonBlank(
                        text(item, "id"), text(item, "external_line_id"), text(item, "source_line_id")), 64);
                itemRows.add(new Object[]{
                        productId, outletId, quantity, cost, unitPrice, lineTotal, tax,
                        productId == null ? truncate(productName, 255) : null, externalLineId
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
            saleId = insertSale(outletId, externalId, invoiceId, status, note, customerId, totalQuantity,
                    totalPrice, totalTax, totalDiscount, totalCost, soldAt);
            created = true;
        } else {
            saleId = existingId;
            updateSale(saleId, outletId, externalId, invoiceId, status, note, customerId, totalQuantity,
                    totalPrice, totalTax, totalDiscount, totalCost, soldAt);
            jdbc.update("DELETE FROM sale_payment WHERE sale_id = ?", saleId);
            jdbc.update("DELETE FROM sale_item WHERE sale_id = ?", saleId);
            created = false;
        }

        for (Object[] row : itemRows) {
            jdbc.update("""
                    INSERT INTO sale_item (sale_id, product_id, outlet_id, quantity, cost, base_price, total_price, tax, note, external_line_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, saleId, row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]);
        }

        JsonNode payments = sale.path("payments");
        if (payments.isArray()) {
            for (JsonNode payment : payments) {
                BigDecimal amount = money(decimalNode(payment, "amount"));
                String paymentStatus = firstNonBlank(text(payment, "status"), "COMPLETED");
                String subtype = text(payment, "subtype");
                String externalPaymentId = truncate(firstNonBlank(
                        text(payment, "id"), text(payment, "external_payment_id")), 64);
                jdbc.update("""
                        INSERT INTO sale_payment (sale_id, payment_method_id, subtype, status, amount, outlet_id, external_payment_id)
                        VALUES (?, NULL, ?, ?, ?, ?, ?)
                        """, saleId, subtype, paymentStatus, amount, outletId, externalPaymentId);
            }
        }
        return new UpsertOutcome(created, unmatchedLines);
    }

    private long insertSale(long outletId, String externalId, String invoiceId, String status, String note, Long customerId,
                            int totalQuantity, BigDecimal totalPrice, BigDecimal totalTax, BigDecimal totalDiscount,
                            BigDecimal totalCost, SoldAt soldAt) {
        return jdbc.queryForObject("""
                INSERT INTO sale (outlet_id, status, invoice_id, note, customer_id, total_quantity, total_price, total_tax,
                                  total_discount, total_cost, outstanding, total_change, cashout,
                                  business_date, local_sold_at, created_at, updated_at, source_system, external_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP, ?, ?)
                RETURNING id
                """, Long.class,
                outletId, status, invoiceId, note, customerId, totalQuantity, totalPrice, totalTax, totalDiscount, totalCost,
                soldAt == null ? null : Date.valueOf(soldAt.businessDate()),
                soldAt == null ? null : Timestamp.valueOf(soldAt.localSoldAt()),
                soldAt == null ? null : Timestamp.from(soldAt.createdAtUtc()),
                SOURCE_SYSTEM, externalId);
    }

    private void updateSale(long saleId, long outletId, String externalId, String invoiceId, String status, String note, Long customerId,
                            int totalQuantity, BigDecimal totalPrice, BigDecimal totalTax, BigDecimal totalDiscount,
                            BigDecimal totalCost, SoldAt soldAt) {
        jdbc.update("""
                UPDATE sale SET status = ?, invoice_id = ?, note = ?, customer_id = COALESCE(?, customer_id), total_quantity = ?, total_price = ?,
                       total_tax = ?, total_discount = ?, total_cost = ?, outstanding = 0,
                       business_date = COALESCE(?, business_date),
                       local_sold_at = COALESCE(?, local_sold_at),
                       created_at = COALESCE(?, created_at),
                       updated_at = CURRENT_TIMESTAMP,
                       source_system = ?, external_id = ?
                WHERE id = ? AND outlet_id = ?
                """,
                status, invoiceId, note, customerId, totalQuantity, totalPrice, totalTax, totalDiscount, totalCost,
                soldAt == null ? null : Date.valueOf(soldAt.businessDate()),
                soldAt == null ? null : Timestamp.valueOf(soldAt.localSoldAt()),
                soldAt == null ? null : Timestamp.from(soldAt.createdAtUtc()),
                SOURCE_SYSTEM, externalId, saleId, outletId);
    }

    private Map<String, Long> loadCustomerMappings(String storeKey, long outletId) {
        jdbc.execute("CREATE TABLE IF NOT EXISTS shopfront_customer_mapping (store_key VARCHAR(64) NOT NULL, source_id VARCHAR(160) NOT NULL, client_id VARCHAR(160), outlet_id BIGINT NOT NULL, customer_id BIGINT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id, outlet_id))");
        jdbc.execute("ALTER TABLE shopfront_customer_mapping ADD COLUMN IF NOT EXISTS client_id VARCHAR(160)");
        Map<String, Long> mappings = new HashMap<>();
        List<String> ambiguous = new ArrayList<>();
        jdbc.query("""
                SELECT reference, customer_id FROM (
                  SELECT source_id AS reference, customer_id
                  FROM shopfront_customer_mapping
                  WHERE store_key = ? AND outlet_id = ?
                  UNION ALL
                  SELECT client_id AS reference, customer_id
                  FROM shopfront_customer_mapping
                  WHERE store_key = ? AND outlet_id = ? AND client_id IS NOT NULL
                ) candidates
                WHERE reference IS NOT NULL AND reference <> ''
                GROUP BY reference, customer_id
                """, rs -> {
            while (rs.next()) {
                String sourceId = rs.getString("reference");
                Long customerId = rs.getLong("customer_id");
                Long previous = mappings.putIfAbsent(sourceId, customerId);
                if (previous != null && !previous.equals(customerId)) ambiguous.add(sourceId);
            }
        }, storeKey, outletId, storeKey, outletId);
        ambiguous.forEach(mappings::remove);
        return mappings;
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
            // Keep Shopfront INCOMPLETE distinct so sales reports can match Shopfront DSL
            // (COMPLETED + INCOMPLETE) without counting ordinary parked carts.
            case "INCOMPLETE" -> "INCOMPLETE";
            case "PARKED", "OPEN", "SAVED" -> "PARKED";
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
