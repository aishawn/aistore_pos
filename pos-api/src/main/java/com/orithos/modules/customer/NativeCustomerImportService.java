package com.orithos.modules.customer;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Idempotent Shopfront customer import into the native Orithos customer ledger.
 * Source mappings are retained so retries never create a second customer. This
 * importer only writes customer data and does not create payments or sales.
 */
@Service
public class NativeCustomerImportService {
    private final JdbcTemplate jdbc;

    public NativeCustomerImportService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public Map<String, Object> importCustomers(String storeKey, long outletId, JsonNode items) throws Exception {
        if (storeKey == null || storeKey.isBlank() || outletId <= 0 || items == null || !items.isArray()) {
            throw new IllegalArgumentException("store_key, outlet_id and customer items are required");
        }
        ensureMappingTable();
        int created = 0, updated = 0, skipped = 0;
        List<String> errors = new ArrayList<>();
        for (JsonNode item : items) {
            String sourceId = text(item, "source_id", "id");
            String name = text(item, "name", "displayName", "display_name");
            if (sourceId == null || name == null || name.isBlank()) {
                skipped++;
                continue;
            }
            try {
                Long existing = findMapping(storeKey, sourceId, outletId);
                // Keep codes outlet-unique across Demo/SKR mirrors of the same Shopfront source ids.
                String code = text(item, "code", "client_id");
                if (code == null || code.isBlank()) {
                    code = "SF-" + storeKey + "-" + sourceId;
                } else if (!code.startsWith("SF-" + storeKey + "-")) {
                    code = "SF-" + storeKey + "-" + code;
                }
                // Prefer flattened crawler fields; keep raw_payload only for legacy batches.
                JsonNode source = item.path("raw_payload").isObject() ? item.path("raw_payload") : item;
                String firstName = text(source, "firstName", "first_name");
                String lastName = text(source, "lastName", "last_name");
                String company = text(source, "company");
                String businessNumber = text(source, "businessNumber", "business_number");
                LocalDate birthday = date(source, "birthday");
                String gender = text(source, "gender");
                List<String> emails = emails(source, text(item, "email"));
                ensureEmailsAvailable(emails, existing, outletId);
                String email = emails.isEmpty() ? text(item, "email") : emails.getFirst();
                String phone = text(item, "phone", "mobile");
                String mobile = text(item, "mobile");
                String fax = text(source, "fax");
                String invoiceMessage = text(source, "invoiceMessage", "invoice_message");
                String comments = text(source, "comments");
                BigDecimal loyaltyRate = decimal(source, "loyaltyRate", "loyalty_rate");
                BigDecimal loyaltyPoints = decimal(source, "loyaltyPoints", "loyalty_points");
                BigDecimal accountLimit = decimal(source, "accountLimit", "account_limit");
                BigDecimal currentOwing = decimal(source, "currentOwing", "current_owing");
                Long customerGroupId = ensureCustomerGroupId(outletId,
                        firstNonBlank(customerGroupName(item), customerGroupName(source)));
                Long priceListId = resolveMappedPriceListId(storeKey, outletId, item, source);
                boolean allowMarketingEmails = bool(source, true, "allowMarketingEmails", "allow_marketing_emails");
                boolean loyaltyEnabled = bool(source, false, "loyaltyEnabled", "loyalty_enabled");
                boolean disablePromotions = bool(source, false, "disablePromotions", "disable_promotions");
                boolean overrideCustomerGroup = bool(source, false, "overrideCustomerGroup", "override_customer_group");
                boolean requireOrderReference = bool(source, false, "requireOrderReference", "require_order_reference");
                boolean deleted = item.path("deleted").asBoolean(false);
                Long customerId;
                if (existing == null) {
                    customerId = jdbc.queryForObject("""
                            INSERT INTO customer (name, first_name, last_name, company, business_number, birthday,
                              gender, code, email, phone, mobile, fax, allow_marketing_emails, invoice_message,
                              comments, customer_group_id, override_customer_group, loyalty_enabled, loyalty_rate,
                              loyalty_points, disable_promotions, price_list_id, require_order_reference,
                              account_limit, current_owing, deleted_at, outlet_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                              ?, COALESCE(?, 0), CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END, ?)
                            RETURNING id
                            """, Long.class, name, firstName, lastName, company, businessNumber, birthday,
                            gender, code, email, phone, mobile, fax, allowMarketingEmails ? 1 : 0, invoiceMessage, comments,
                            customerGroupId, overrideCustomerGroup ? 1 : 0, loyaltyEnabled ? 1 : 0, loyaltyRate, loyaltyPoints,
                            disablePromotions ? 1 : 0, priceListId, requireOrderReference ? 1 : 0, accountLimit, currentOwing,
                            deleted, outletId);
                    jdbc.update("INSERT INTO shopfront_customer_mapping (store_key, source_id, outlet_id, customer_id) VALUES (?, ?, ?, ?)", storeKey, sourceId, outletId, customerId);
                    created++;
                } else {
                    customerId = existing;
                    jdbc.update("""
                        UPDATE customer SET name=?, first_name=?, last_name=?, company=?, business_number=?, birthday=?,
                          gender=?, email=?, phone=?, mobile=?, fax=?, allow_marketing_emails=?, invoice_message=?,
                          comments=?, customer_group_id=?, override_customer_group=?, loyalty_enabled=?, loyalty_rate=?,
                          loyalty_points=COALESCE(?, loyalty_points), disable_promotions=?, price_list_id=?,
                          require_order_reference=?, account_limit=?, current_owing=COALESCE(?, current_owing),
                          deleted_at=CASE WHEN ? THEN COALESCE(deleted_at, CURRENT_TIMESTAMP) ELSE NULL END
                        WHERE id=? AND outlet_id=?
                        """, name, firstName, lastName, company, businessNumber, birthday, gender, email, phone,
                        mobile, fax, allowMarketingEmails ? 1 : 0, invoiceMessage, comments, customerGroupId,
                        overrideCustomerGroup ? 1 : 0, loyaltyEnabled ? 1 : 0, loyaltyRate, loyaltyPoints,
                        disablePromotions ? 1 : 0, priceListId, requireOrderReference ? 1 : 0, accountLimit,
                        currentOwing, deleted, customerId, outletId);
                    updated++;
                }
                syncEmails(customerId, outletId, emails, deleted);
            } catch (RuntimeException ex) {
                skipped++;
                if (errors.size() < 25) errors.add(sourceId + ": " + (ex.getMessage() == null ? "import failed" : ex.getMessage()));
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("created", created); result.put("updated", updated); result.put("skipped", skipped);
        result.put("errors", errors); result.put("enabled", true);
        return result;
    }

    /**
     * Idempotent Shopfront customer-group catalog import. Creates missing native
     * groups by name and retains source mappings so retries stay stable, including
     * empty groups that no customer currently references.
     */
    @Transactional
    public Map<String, Object> importCustomerGroups(String storeKey, long outletId, JsonNode items) {
        if (storeKey == null || storeKey.isBlank() || outletId <= 0 || items == null || !items.isArray()) {
            throw new IllegalArgumentException("store_key, outlet_id and customer group items are required");
        }
        ensureGroupMappingTable();
        int created = 0, updated = 0, skipped = 0;
        List<String> errors = new ArrayList<>();
        for (JsonNode item : items) {
            String sourceId = text(item, "source_id", "id");
            String name = text(item, "name");
            if (sourceId == null || name == null || name.isBlank()) {
                skipped++;
                continue;
            }
            try {
                Long mapped = findGroupMapping(storeKey, sourceId, outletId);
                Long groupId = mapped != null ? mapped : ensureCustomerGroupId(outletId, name);
                if (groupId == null) throw new IllegalStateException("Unable to resolve customer group");
                jdbc.update("UPDATE customer_group SET name=? WHERE id=? AND outlet_id=? AND deleted_at IS NULL",
                        name.trim(), groupId, outletId);
                if (mapped == null) {
                    jdbc.update(
                            "INSERT INTO shopfront_customer_group_mapping (store_key, source_id, outlet_id, customer_group_id) VALUES (?, ?, ?, ?)",
                            storeKey, sourceId, outletId, groupId);
                    created++;
                } else {
                    updated++;
                }
            } catch (RuntimeException ex) {
                skipped++;
                if (errors.size() < 25) {
                    errors.add(sourceId + ": " + (ex.getMessage() == null ? "group import failed" : ex.getMessage()));
                }
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        result.put("errors", errors);
        result.put("enabled", true);
        return result;
    }

    /**
     * Idempotent Shopfront price-list catalog import (headers + rule rows). Creates
     * missing native lists by source mapping/name and replaces items so retries stay
     * 1:1 with Shopfront, including empty lists that no customer currently references.
     */
    @Transactional
    public Map<String, Object> importPriceLists(String storeKey, long outletId, JsonNode items) {
        if (storeKey == null || storeKey.isBlank() || outletId <= 0 || items == null || !items.isArray()) {
            throw new IllegalArgumentException("store_key, outlet_id and price list items are required");
        }
        ensurePriceListMappingTable();
        int created = 0, updated = 0, skipped = 0, itemRows = 0, unmatchedItems = 0;
        List<String> errors = new ArrayList<>();
        for (JsonNode item : items) {
            String sourceId = text(item, "source_id", "id");
            String name = text(item, "name");
            if (sourceId == null || name == null || name.isBlank()) {
                skipped++;
                continue;
            }
            try {
                boolean allowHigher = bool(item, false, "allow_higher_price", "allowHigherPrice");
                boolean allowDiscounting = bool(item, false, "allow_discounting_promotions", "allowDiscountingPromotions");
                Long mapped = findPriceListMapping(storeKey, sourceId, outletId);
                Long priceListId = mapped != null ? mapped : ensurePriceListId(outletId, name);
                if (priceListId == null) throw new IllegalStateException("Unable to resolve price list");
                jdbc.update("""
                        UPDATE price_list
                        SET name=?, allow_higher_price=?, allow_discounting_promotions=?, active=TRUE,
                            updated_at=CURRENT_TIMESTAMP
                        WHERE id=? AND outlet_id=?
                        """, name.trim(), allowHigher ? 1 : 0, allowDiscounting ? 1 : 0, priceListId, outletId);
                if (mapped == null) {
                    jdbc.update(
                            "INSERT INTO shopfront_price_list_mapping (store_key, source_id, outlet_id, price_list_id) VALUES (?, ?, ?, ?)",
                            storeKey, sourceId, outletId, priceListId);
                    created++;
                } else {
                    updated++;
                }
                int[] itemStats = replacePriceListItems(storeKey, outletId, priceListId, item.path("items"));
                itemRows += itemStats[0];
                unmatchedItems += itemStats[1];
            } catch (RuntimeException ex) {
                skipped++;
                if (errors.size() < 25) {
                    errors.add(sourceId + ": " + (ex.getMessage() == null ? "price list import failed" : ex.getMessage()));
                }
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        result.put("item_rows", itemRows);
        result.put("unmatched_items", unmatchedItems);
        result.put("errors", errors);
        result.put("enabled", true);
        return result;
    }

    /** Imports historical Shopfront account payments without applying them to current owing again. */
    @Transactional
    public Map<String, Object> importPayments(String storeKey, long outletId, JsonNode items) {
        if (storeKey == null || storeKey.isBlank() || outletId <= 0 || items == null || !items.isArray()) {
            throw new IllegalArgumentException("store_key, outlet_id and payment items are required");
        }
        ensurePaymentMappingTable();
        int created = 0, updated = 0, skipped = 0;
        List<String> errors = new ArrayList<>();
        for (JsonNode item : items) {
            String sourceId = text(item, "source_id", "id");
            JsonNode raw = item.path("raw_payload").isObject() ? item.path("raw_payload") : item;
            if (sourceId == null) { skipped++; continue; }
            try {
                String customerSourceId = text(raw.path("customer"), "id");
                if (customerSourceId == null) customerSourceId = text(item, "customer_source_id");
                Long customerId = resolveMappedCustomer(storeKey, customerSourceId, outletId);
                if (customerId == null) throw new IllegalArgumentException("Shopfront payment customer has no native customer mapping");
                BigDecimal amount = decimal(raw, "amount");
                if (amount == null || amount.signum() <= 0) throw new IllegalArgumentException("Shopfront payment amount is invalid");
                LocalDateTime timestamp = dateTime(raw, "timestamp");
                if (timestamp == null) throw new IllegalArgumentException("Shopfront payment timestamp is missing");
                LocalDateTime cancelledAt = dateTime(raw, "cancelledAt", "cancelled_at");
                String status = cancelledAt != null || "CANCELLED".equalsIgnoreCase(text(raw, "status"))
                        || "VOIDED".equalsIgnoreCase(text(raw, "status")) ? "VOIDED" : "COMPLETED";
                String paymentMethodName = text(raw.path("paymentMethod"), "name");
                if (paymentMethodName == null) paymentMethodName = text(item, "payment_method_name");
                Long paymentMethodId = resolvePaymentMethodId(outletId, paymentMethodName);
                BigDecimal startBalance = decimal(raw, "startBalance", "start_balance");
                BigDecimal rounding = decimal(raw, "rounding");
                String reference = text(raw, "reference");

                Long paymentId = findPaymentMapping(storeKey, sourceId, outletId);
                if (paymentId == null) {
                    paymentId = jdbc.queryForObject("""
                            INSERT INTO customer_payment (customer_id, payment_method_id, reference, status,
                              start_balance, amount, rounding, timestamp, cancelled_at, outlet_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            RETURNING id
                            """, Long.class, customerId, paymentMethodId, reference, status, startBalance,
                            amount, rounding, timestamp, cancelledAt, outletId);
                    jdbc.update("INSERT INTO shopfront_customer_payment_mapping (store_key,source_id,outlet_id,customer_payment_id) VALUES (?,?,?,?)",
                            storeKey, sourceId, outletId, paymentId);
                    created++;
                } else {
                    int changed = jdbc.update("""
                            UPDATE customer_payment SET customer_id=?, payment_method_id=?, reference=?, status=?,
                              start_balance=?, amount=?, rounding=?, timestamp=?, cancelled_at=?
                            WHERE id=? AND outlet_id=?
                            """, customerId, paymentMethodId, reference, status, startBalance, amount, rounding,
                            timestamp, cancelledAt, paymentId, outletId);
                    if (changed != 1) throw new IllegalStateException("Mapped native payment is missing from this outlet");
                    updated++;
                }
            } catch (RuntimeException ex) {
                skipped++;
                if (errors.size() < 25) errors.add(sourceId + ": " + (ex.getMessage() == null ? "payment import failed" : ex.getMessage()));
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("created", created); result.put("updated", updated); result.put("skipped", skipped);
        result.put("errors", errors); result.put("enabled", true);
        return result;
    }

    private void ensureMappingTable() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS shopfront_customer_mapping (store_key VARCHAR(64) NOT NULL, source_id VARCHAR(160) NOT NULL, outlet_id BIGINT NOT NULL, customer_id BIGINT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id, outlet_id))");
    }

    private void ensureGroupMappingTable() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS shopfront_customer_group_mapping (store_key VARCHAR(64) NOT NULL, source_id VARCHAR(160) NOT NULL, outlet_id BIGINT NOT NULL, customer_group_id BIGINT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id, outlet_id))");
    }

    private void ensurePriceListMappingTable() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS shopfront_price_list_mapping (store_key VARCHAR(64) NOT NULL, source_id VARCHAR(160) NOT NULL, outlet_id BIGINT NOT NULL, price_list_id BIGINT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id, outlet_id))");
    }

    private void ensurePaymentMappingTable() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS shopfront_customer_payment_mapping (store_key VARCHAR(64) NOT NULL, source_id VARCHAR(160) NOT NULL, outlet_id BIGINT NOT NULL, customer_payment_id BIGINT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id, outlet_id))");
    }

    private Long resolveMappedCustomer(String storeKey, String sourceId, long outletId) {
        if (sourceId == null) return null;
        List<Long> ids = jdbc.query("SELECT customer_id FROM shopfront_customer_mapping WHERE store_key=? AND source_id=? AND outlet_id=?",
                (rs, row) -> rs.getLong(1), storeKey, sourceId, outletId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private Long resolvePaymentMethodId(long outletId, String name) {
        if (name == null) return null;
        List<Long> ids = jdbc.query("SELECT id FROM payment_method WHERE outlet_id=? AND deleted_at IS NULL AND LOWER(TRIM(name))=LOWER(TRIM(?)) ORDER BY id LIMIT 2",
                (rs, row) -> rs.getLong(1), outletId, name);
        return ids.size() == 1 ? ids.getFirst() : null;
    }

    private Long findPaymentMapping(String storeKey, String sourceId, long outletId) {
        List<Long> ids = jdbc.query("SELECT customer_payment_id FROM shopfront_customer_payment_mapping WHERE store_key=? AND source_id=? AND outlet_id=?",
                (rs, row) -> rs.getLong(1), storeKey, sourceId, outletId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private Long findMapping(String storeKey, String sourceId, long outletId) {
        List<Long> ids = jdbc.query("SELECT customer_id FROM shopfront_customer_mapping WHERE store_key=? AND source_id=? AND outlet_id=?", (rs, n) -> rs.getLong(1), storeKey, sourceId, outletId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private Long findGroupMapping(String storeKey, String sourceId, long outletId) {
        List<Long> ids = jdbc.query(
                "SELECT customer_group_id FROM shopfront_customer_group_mapping WHERE store_key=? AND source_id=? AND outlet_id=?",
                (rs, row) -> rs.getLong(1), storeKey, sourceId, outletId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private Long ensureCustomerGroupId(long outletId, String name) {
        if (name == null || name.isBlank()) return null;
        String trimmed = name.trim();
        List<Long> ids = jdbc.query(
                "SELECT id FROM customer_group WHERE outlet_id=? AND deleted_at IS NULL AND LOWER(TRIM(name))=LOWER(TRIM(?)) ORDER BY id LIMIT 2",
                (rs, row) -> rs.getLong(1), outletId, trimmed);
        if (ids.size() == 1) return ids.getFirst();
        if (ids.size() > 1) {
            throw new IllegalStateException("Ambiguous customer group name in this outlet: " + trimmed);
        }
        return jdbc.queryForObject(
                """
                INSERT INTO customer_group (name, loyalty_enabled, disable_promotions, allow_account_sales,
                  auto_print_receipt, auto_print_parked_receipt, auto_email_receipt, auto_print_payment_receipt,
                  require_order_reference, outlet_id)
                VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, ?)
                RETURNING id
                """,
                Long.class, trimmed, outletId);
    }

    private Long resolveMappedPriceListId(String storeKey, long outletId, JsonNode item, JsonNode source) {
        String sourceId = firstNonBlank(
                text(item.path("price_list"), "id", "source_id"),
                text(item.path("priceList"), "id", "source_id"),
                text(source.path("price_list"), "id", "source_id"),
                text(source.path("priceList"), "id", "source_id"));
        if (sourceId != null) {
            Long mapped = findPriceListMapping(storeKey, sourceId, outletId);
            if (mapped != null) return mapped;
        }
        String name = firstNonBlank(priceListName(item), priceListName(source));
        return ensurePriceListId(outletId, name);
    }

    private Long findPriceListMapping(String storeKey, String sourceId, long outletId) {
        List<Long> ids = jdbc.query(
                "SELECT price_list_id FROM shopfront_price_list_mapping WHERE store_key=? AND source_id=? AND outlet_id=?",
                (rs, row) -> rs.getLong(1), storeKey, sourceId, outletId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private Long ensurePriceListId(long outletId, String name) {
        if (name == null || name.isBlank()) return null;
        String trimmed = name.trim();
        List<Long> ids = jdbc.query(
                "SELECT id FROM price_list WHERE outlet_id=? AND active=TRUE AND LOWER(TRIM(name))=LOWER(TRIM(?)) ORDER BY id LIMIT 2",
                (rs, row) -> rs.getLong(1), outletId, trimmed);
        if (ids.size() == 1) return ids.getFirst();
        if (ids.size() > 1) {
            throw new IllegalStateException("Ambiguous price list name in this outlet: " + trimmed);
        }
        return jdbc.queryForObject(
                """
                INSERT INTO price_list (name, allow_higher_price, allow_discounting_promotions, outlet_id, active)
                VALUES (?, 0, 0, ?, TRUE)
                RETURNING id
                """,
                Long.class, trimmed, outletId);
    }

    private int[] replacePriceListItems(String storeKey, long outletId, long priceListId, JsonNode items) {
        jdbc.update("DELETE FROM price_list_item WHERE price_list_id=? AND outlet_id=?", priceListId, outletId);
        if (items == null || !items.isArray() || items.isEmpty()) {
            return new int[]{0, 0};
        }
        int written = 0;
        int unmatched = 0;
        for (JsonNode row : items) {
            if (row == null || !row.isObject()) {
                unmatched++;
                continue;
            }
            Boolean exclude = row.path("exclude").isMissingNode() || row.path("exclude").isNull()
                    ? Boolean.FALSE : row.path("exclude").asBoolean(false);
            String rule = text(row, "rule");
            BigDecimal amount = decimal(row, "amount");
            if (amount == null) {
                JsonNode prices = row.path("prices");
                if (prices.isArray() && !prices.isEmpty()) {
                    amount = decimal(prices.get(0), "price", "amount");
                }
            }
            JsonNode target = row.path("item");
            String typeName = text(target, "__typename", "type");
            String classificationType = mapPriceListClassification(typeName);
            Long itemId = resolvePriceListTargetId(storeKey, outletId, classificationType, target);
            if (classificationType != null && !"PRODUCT".equals(classificationType) && itemId == null
                    && text(target, "id") != null) {
                unmatched++;
            }
            if ("PRODUCT".equals(classificationType) && itemId == null && text(target, "id") != null) {
                unmatched++;
            }
            jdbc.update("""
                    INSERT INTO price_list_item (price_list_id, classification_type, item_id, exclude, rule, amount, outlet_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, priceListId, classificationType, itemId, Boolean.TRUE.equals(exclude) ? 1 : 0, rule, amount, outletId);
            written++;
        }
        return new int[]{written, unmatched};
    }

    private static String mapPriceListClassification(String typeName) {
        if (typeName == null || typeName.isBlank()) return null;
        return switch (typeName.trim()) {
            case "Product" -> "PRODUCT";
            case "Category" -> "CATEGORY";
            case "Brand" -> "BRAND";
            case "Family" -> "FAMILY";
            case "Tag" -> "TAG";
            case "PriceListFallback" -> null;
            default -> typeName.trim().toUpperCase(Locale.ROOT);
        };
    }

    private Long resolvePriceListTargetId(String storeKey, long outletId, String classificationType, JsonNode target) {
        if (target == null || !target.isObject()) return null;
        String sourceId = text(target, "id", "source_id", "fallbackId");
        String name = text(target, "name");
        if ("PRODUCT".equals(classificationType)) {
            if (sourceId != null) {
                List<Long> mapped = jdbc.query(
                        "SELECT pos_product_id FROM shopfront_product_mapping WHERE store_key=? AND source_product_id=? AND status='MAPPED' ORDER BY pos_product_id LIMIT 1",
                        (rs, row) -> rs.getLong(1), storeKey, sourceId);
                if (!mapped.isEmpty()) return mapped.getFirst();
            }
            return null;
        }
        if (classificationType == null) return null;
        String table = switch (classificationType) {
            case "CATEGORY" -> "category";
            case "BRAND" -> "brand";
            case "FAMILY" -> "family";
            case "TAG" -> "tag";
            default -> null;
        };
        if (table == null || name == null || name.isBlank()) return null;
        List<Long> byName = jdbc.query(
                "SELECT id FROM " + table + " WHERE outlet_id=? AND deleted_at IS NULL AND LOWER(TRIM(name))=LOWER(TRIM(?)) ORDER BY id LIMIT 2",
                (rs, row) -> rs.getLong(1), outletId, name);
        return byName.size() == 1 ? byName.getFirst() : null;
    }

    private static String customerGroupName(JsonNode source) {
        JsonNode customerGroup = source.path("customerGroup").isObject()
                ? source.path("customerGroup")
                : source.path("customer_group");
        if (customerGroup.isObject()) {
            return text(customerGroup, "name");
        }
        return text(source, "customer_group", "customer_group_name", "customerGroupName", "customerGroup");
    }

    private static String priceListName(JsonNode source) {
        JsonNode priceList = source.path("priceList").isObject()
                ? source.path("priceList")
                : source.path("price_list");
        if (priceList.isObject()) {
            return text(priceList, "name");
        }
        return text(source, "price_list", "price_list_name", "priceListName", "priceList");
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private void syncEmails(Long customerId, long outletId, List<String> emails, boolean deleted) {
        jdbc.update("DELETE FROM customer_email WHERE customer_id=? AND outlet_id=?", customerId, outletId);
        int order = 0;
        for (String email : emails) {
            jdbc.update("INSERT INTO customer_email (customer_id,email,sort_order,customer_deleted_at,outlet_id) VALUES (?,?,?,?,?)",
                    customerId, email, order++, deleted ? java.sql.Timestamp.from(java.time.Instant.now()) : null, outletId);
        }
    }

    private void ensureEmailsAvailable(List<String> emails, Long customerId, long outletId) {
        for (String email : emails) {
            String exclusion = customerId == null ? "" : "AND c.id <> ?";
            List<Object> args = new ArrayList<>();
            args.add(outletId);
            args.add(email);
            args.add(email);
            if (customerId != null) args.add(customerId);
            Long owner = jdbc.query("""
                    SELECT c.id FROM customer c
                    WHERE c.deleted_at IS NULL
                      AND c.outlet_id = ?
                      AND (EXISTS (SELECT 1 FROM customer_email ce WHERE ce.customer_id=c.id
                            AND LOWER(TRIM(ce.email))=LOWER(TRIM(?)))
                        OR (NOT EXISTS (SELECT 1 FROM customer_email ce WHERE ce.customer_id=c.id)
                            AND LOWER(TRIM(COALESCE(c.email,'')))=LOWER(TRIM(?))))
                    """ + exclusion + " ORDER BY c.id LIMIT 1", rs -> rs.next() ? rs.getLong(1) : null, args.toArray());
            if (owner != null) {
                throw new IllegalArgumentException("Customer email is already assigned to another Orithos customer");
            }
        }
    }

    private static List<String> emails(JsonNode source, String primary) {
        Map<String, String> values = new LinkedHashMap<>();
        JsonNode sourceEmails = source.path("emails");
        if (sourceEmails.isArray()) {
            for (JsonNode email : sourceEmails) {
                if (email.isTextual() && !email.asText().isBlank()) addEmail(values, email.asText());
            }
        }
        addEmail(values, source.path("billing").path("email").asText(null));
        addEmail(values, source.path("delivery").path("email").asText(null));
        addEmail(values, primary);
        return List.copyOf(values.values());
    }

    private static void addEmail(Map<String, String> values, String email) {
        if (email != null && !email.isBlank()) values.putIfAbsent(email.trim().toLowerCase(Locale.ROOT), email.trim());
    }

    private static LocalDate date(JsonNode node, String... names) {
        String value = text(node, names);
        if (value == null) return null;
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("Customer birthday must use YYYY-MM-DD");
        }
    }

    private static LocalDateTime dateTime(JsonNode node, String... names) {
        String value = text(node, names);
        if (value == null) return null;
        try {
            return OffsetDateTime.parse(value).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            String normalizedOffset = value.replaceFirst("([+-]\\d{2})(\\d{2})$", "$1:$2");
            if (!normalizedOffset.equals(value)) {
                try {
                    return OffsetDateTime.parse(normalizedOffset).toLocalDateTime();
                } catch (DateTimeParseException ignoredCompactOffset) {
                    // Try a local timestamp below for source values without an offset.
                }
            }
            try {
                return LocalDateTime.parse(value);
            } catch (DateTimeParseException ex) {
                throw new IllegalArgumentException("Shopfront payment timestamp is invalid");
            }
        }
    }

    private static BigDecimal decimal(JsonNode node, String... names) {
        String value = text(node, names);
        if (value == null) return null;
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Customer numeric field is invalid");
        }
    }

    private static boolean bool(JsonNode node, boolean fallback, String... names) {
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && !value.isNull()) return value.asBoolean(fallback);
        }
        return fallback;
    }

    private static String text(JsonNode node, String... names) {
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && !value.isNull() && !value.asText().isBlank()) return value.asText().trim();
        }
        return null;
    }

}
