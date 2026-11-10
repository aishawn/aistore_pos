package com.orithos.modules.customer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Idempotent Shopfront customer import into the native Orithos customer ledger.
 * Source mappings are retained so retries never create a second customer. This
 * importer only writes customer data and does not create payments or sales.
 */
@Service
public class NativeCustomerImportService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public NativeCustomerImportService(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
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
                String code = text(item, "code", "client_id");
                if (code == null || code.isBlank()) code = "SF-" + sourceId;
                JsonNode source = item.path("raw_payload").isObject() ? item.path("raw_payload") : item;
                String firstName = text(source, "firstName", "first_name");
                String lastName = text(source, "lastName", "last_name");
                String company = text(source, "company");
                String email = text(item, "email");
                String phone = text(item, "phone", "mobile");
                String mobile = text(item, "mobile");
                boolean deleted = item.path("deleted").asBoolean(false);
                Long customerId;
                if (existing == null) {
                    customerId = jdbc.queryForObject("""
                            INSERT INTO customer (name, first_name, last_name, company, code, email, phone, mobile,
                              deleted_at, outlet_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END, ?)
                            RETURNING id
                            """, Long.class, name, firstName, lastName, company, code, email, phone, mobile, deleted, outletId);
                    jdbc.update("INSERT INTO shopfront_customer_mapping (store_key, source_id, outlet_id, customer_id) VALUES (?, ?, ?, ?)", storeKey, sourceId, outletId, customerId);
                    created++;
                } else {
                    customerId = existing;
                    jdbc.update("""
                        UPDATE customer SET name=?, first_name=?, last_name=?, company=?, email=?, phone=?, mobile=?,
                          deleted_at=CASE WHEN ? THEN COALESCE(deleted_at, CURRENT_TIMESTAMP) ELSE NULL END
                        WHERE id=? AND outlet_id=?
                        """, name, firstName, lastName, company, email, phone, mobile, deleted, customerId, outletId);
                    updated++;
                }
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

    private void ensureMappingTable() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS shopfront_customer_mapping (store_key VARCHAR(64) NOT NULL, source_id VARCHAR(160) NOT NULL, outlet_id BIGINT NOT NULL, customer_id BIGINT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id, outlet_id))");
    }

    private Long findMapping(String storeKey, String sourceId, long outletId) {
        List<Long> ids = jdbc.query("SELECT customer_id FROM shopfront_customer_mapping WHERE store_key=? AND source_id=? AND outlet_id=?", (rs, n) -> rs.getLong(1), storeKey, sourceId, outletId);
        return ids.isEmpty() ? null : ids.getFirst();
    }

    private static String text(JsonNode node, String... names) {
        for (String name : names) {
            JsonNode value = node.get(name);
            if (value != null && !value.isNull() && !value.asText().isBlank()) return value.asText().trim();
        }
        return null;
    }

}
