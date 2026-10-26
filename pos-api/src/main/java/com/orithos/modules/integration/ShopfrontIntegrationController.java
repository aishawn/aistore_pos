package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.ApiResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.access.AccessDeniedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Fail-closed staging boundary for the standalone Shopfront crawler.
 * It never writes Odoo or the classic POS business tables.
 */
@RestController
@RequestMapping("/api/integrations/shopfront")
public class ShopfrontIntegrationController {
    private static final Logger log = LoggerFactory.getLogger(ShopfrontIntegrationController.class);
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final String token;
    private final boolean enabled;

    public ShopfrontIntegrationController(
            JdbcTemplate jdbc,
            ObjectMapper objectMapper,
            @Value("${app.shopfront.integration-token:}") String token,
            @Value("${app.shopfront.integration-enabled:false}") boolean enabled) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.token = token;
        this.enabled = enabled;
    }

    @GetMapping("/mappings")
    public ApiResult<Map<String, String>> mappings(@RequestHeader("X-Shopfront-Integration-Token") String supplied) {
        authorize(supplied);
        try {
            ensureMappingTable();
            var rows = jdbc.queryForList("SELECT store_key, shopfront_outlet, company_id, outlet_id, enabled FROM shopfront_store_mapping ORDER BY store_key");
            Map<String, String> result = new LinkedHashMap<>();
            result.put("count", Integer.toString(rows.size()));
            result.put("items", rows.toString());
            return ApiResult.ok(result);
        } catch (Exception e) {
            log.error("Shopfront mapping read failed: message={}", e.getMessage(), e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to read Shopfront mappings", e);
        }
    }

    @PutMapping("/mappings/{storeKey}")
    public ApiResult<Map<String, Object>> saveMapping(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @PathVariable String storeKey,
            @RequestBody JsonNode body) {
        authorize(supplied);
        String companyId = body.path("company_id").asText("").trim();
        String outletId = body.path("outlet_id").asText("").trim();
        if (storeKey.isBlank() || companyId.isBlank() || outletId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "store_key, company_id and outlet_id are required");
        }
        ensureMappingTable();
        String shopfrontOutlet = body.path("shopfront_outlet").asText(null);
        int updated = jdbc.update("UPDATE shopfront_store_mapping SET shopfront_outlet=?, company_id=?, outlet_id=?, enabled=1 WHERE store_key=?", shopfrontOutlet, companyId, outletId, storeKey);
        if (updated == 0) {
            try {
                jdbc.update("INSERT INTO shopfront_store_mapping (store_key, shopfront_outlet, company_id, outlet_id, enabled) VALUES (?, ?, ?, ?, 1)", storeKey, shopfrontOutlet, companyId, outletId);
            } catch (DuplicateKeyException race) {
                jdbc.update("UPDATE shopfront_store_mapping SET shopfront_outlet=?, company_id=?, outlet_id=?, enabled=1 WHERE store_key=?", shopfrontOutlet, companyId, outletId, storeKey);
            }
        }
        return ApiResult.ok(Map.of("store_key", storeKey, "company_id", companyId, "outlet_id", outletId, "enabled", true));
    }

    @PostMapping("/products:upsert")
    public ApiResult<Map<String, Object>> products(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                   @RequestBody JsonNode body) {
        return stage(supplied, "products", body);
    }

    @PostMapping("/inventory:replace")
    public ApiResult<Map<String, Object>> inventory(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                   @RequestBody JsonNode body) {
        return stage(supplied, "inventory", body);
    }

    @PostMapping("/sales:upsert")
    public ApiResult<Map<String, Object>> sales(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                @RequestBody JsonNode body) {
        return stage(supplied, "sales", body);
    }

    @GetMapping("/snapshot")
    public ApiResult<Map<String, Object>> snapshot(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestParam String storeKey) {
        authorize(supplied);
        ensureShadowTables();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("store_key", storeKey);
        result.put("products", count("shopfront_product", storeKey));
        result.put("inventory", count("shopfront_inventory", storeKey));
        result.put("sales", count("shopfront_sale", storeKey));
        result.put("sale_items", count("shopfront_sale_item", storeKey));
        result.put("payments", count("shopfront_sale_payment", storeKey));
        return ApiResult.ok(result);
    }

    @GetMapping("/import-runs/{id}")
    public ApiResult<Map<String, Object>> run(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                              @PathVariable long id) {
        authorize(supplied);
        var rows = jdbc.queryForList("SELECT id, store_key, import_type, status, item_count, created_at FROM shopfront_import_run WHERE id = ?", id);
        Map<String, Object> result = rows.isEmpty()
                ? new LinkedHashMap<>(Map.of("id", id, "status", "not_found"))
                : new LinkedHashMap<>(rows.get(0));
        return ApiResult.ok(result);
    }

    private ApiResult<Map<String, Object>> stage(String supplied, String type, JsonNode body) {
        authorize(supplied);
        String store = body.path("store_key").asText("");
        JsonNode items = body.path("items");
        if (store.isBlank() || !items.isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "store_key and items are required");
        }
        try {
            ensureMappingTable();
            var mappingRows = jdbc.queryForList("SELECT company_id, outlet_id, enabled FROM shopfront_store_mapping WHERE store_key = ?", store);
            boolean mappingReady = mappingRows.stream().anyMatch(row -> isEnabled(row.get("enabled")));
            boolean postgres = isPostgres();
            jdbc.update(postgres
                    ? "CREATE TABLE IF NOT EXISTS shopfront_import_run (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, store_key VARCHAR(64) NOT NULL, import_type VARCHAR(32) NOT NULL, status VARCHAR(32) NOT NULL, item_count INT NOT NULL, payload_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
                    : "CREATE TABLE IF NOT EXISTS shopfront_import_run (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, store_key VARCHAR(64) NOT NULL, import_type VARCHAR(32) NOT NULL, status VARCHAR(32) NOT NULL, item_count INT NOT NULL, payload_json LONGTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
            var json = objectMapper.writeValueAsString(body);
            String status = mappingReady ? "SYNCED" : "BLOCKED_MAPPING";
            if (mappingReady) {
                ensureShadowTables();
                persistShadow(type, store, mappingRows.get(0), items);
            }
            Long id;
            if (postgres) {
                id = jdbc.queryForObject("INSERT INTO shopfront_import_run (store_key, import_type, status, item_count, payload_json) VALUES (?, ?, ?, ?, ?) RETURNING id", Long.class, store, type, status, items.size(), json);
            } else {
                jdbc.update("INSERT INTO shopfront_import_run (store_key, import_type, status, item_count, payload_json) VALUES (?, ?, ?, ?, ?)", store, type, status, items.size(), json);
                id = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            result.put("status", status);
            result.put("type", type);
            result.put("item_count", items.size());
            result.put("mapping_ready", mappingReady);
            result.put("business_write", false);
            result.put("shadow_write", mappingReady);
            return ApiResult.ok(result);
        } catch (Exception e) {
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            String sqlState = root instanceof java.sql.SQLException sql ? sql.getSQLState() : "";
            log.error("SHOPFRONT_STAGING_DIAG type={} store={} exception={} sqlState={}", type, store,
                    root.getClass().getSimpleName(), sqlState);
            log.error("Shopfront staging failed: type={}, store={}, message={}", type, store, e.getMessage(), e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to stage Shopfront import", e);
        }
    }

    private void ensureMappingTable() {
                jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_store_mapping (store_key VARCHAR(64) NOT NULL PRIMARY KEY, shopfront_outlet VARCHAR(255), company_id VARCHAR(128) NOT NULL, outlet_id VARCHAR(128) NOT NULL, enabled SMALLINT NOT NULL DEFAULT 1)");
    }

    /**
     * Durable, source-shaped Shopfront mirror. It keeps every payload available
     * to POS reporting without changing the live sale or stock ledgers.
     */
    private void ensureShadowTables() {
        boolean postgres = isPostgres();
        String key = postgres ? "VARCHAR(160)" : "VARCHAR(160)";
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_product (store_key VARCHAR(64) NOT NULL, source_id " + key + " NOT NULL, name VARCHAR(255), sku VARCHAR(128), barcode VARCHAR(128), category VARCHAR(255), brand VARCHAR(255), cost DECIMAL(18,4), price DECIMAL(18,4), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_inventory (store_key VARCHAR(64) NOT NULL, source_product_id " + key + " NOT NULL, outlet_id VARCHAR(128) NOT NULL, quantity DECIMAL(18,4), snapshot_at VARCHAR(64) NULL, raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_product_id, outlet_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_sale (store_key VARCHAR(64) NOT NULL, external_id " + key + " NOT NULL, invoice_id VARCHAR(128), status VARCHAR(64), created_at VARCHAR(64), updated_at VARCHAR(64), total_price DECIMAL(18,4), total_tax DECIMAL(18,4), total_discount DECIMAL(18,4), total_cost DECIMAL(18,4), customer_reference VARCHAR(255), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, external_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_sale_item (store_key VARCHAR(64) NOT NULL, external_sale_id " + key + " NOT NULL, line_key VARCHAR(64) NOT NULL, source_product_id " + key + ", product_name VARCHAR(255), quantity DECIMAL(18,4), unit_price DECIMAL(18,4), line_total DECIMAL(18,4), cost DECIMAL(18,4), tax DECIMAL(18,4), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, external_sale_id, line_key))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_sale_payment (store_key VARCHAR(64) NOT NULL, external_sale_id " + key + " NOT NULL, payment_key VARCHAR(64) NOT NULL, amount DECIMAL(18,4), status VARCHAR(64), subtype VARCHAR(128), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, external_sale_id, payment_key))");
    }

    private int count(String table, String store) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE store_key = ?", Integer.class, store);
        return count == null ? 0 : count;
    }

    private void persistShadow(String type, String store, Map<String, Object> mapping, JsonNode items) throws Exception {
        boolean postgres = isPostgres();
        String outlet = String.valueOf(mapping.getOrDefault("outlet_id", ""));
        if ("products".equals(type)) {
            for (JsonNode item : items) {
                String source = text(item, "source_id");
                if (source.isBlank()) continue;
                String sql = postgres
                        ? "INSERT INTO shopfront_product (store_key,source_id,name,sku,barcode,category,brand,cost,price,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (store_key,source_id) DO UPDATE SET name=EXCLUDED.name,sku=EXCLUDED.sku,barcode=EXCLUDED.barcode,category=EXCLUDED.category,brand=EXCLUDED.brand,cost=EXCLUDED.cost,price=EXCLUDED.price,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                        : "INSERT INTO shopfront_product (store_key,source_id,name,sku,barcode,category,brand,cost,price,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),sku=VALUES(sku),barcode=VALUES(barcode),category=VALUES(category),brand=VALUES(brand),cost=VALUES(cost),price=VALUES(price),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                jdbc.update(sql, store, source, text(item,"name"), text(item,"sku"), text(item,"barcode"), text(item,"category"), text(item,"brand"), decimal(item,"cost"), decimal(item,"price"), objectMapper.writeValueAsString(item));
            }
        } else if ("inventory".equals(type)) {
            for (JsonNode item : items) {
                String source = text(item, "source_id");
                if (source.isBlank()) continue;
                String sql = postgres
                        ? "INSERT INTO shopfront_inventory (store_key,source_product_id,outlet_id,quantity,snapshot_at,raw_payload) VALUES (?,?,?,?,?,?) ON CONFLICT (store_key,source_product_id,outlet_id) DO UPDATE SET quantity=EXCLUDED.quantity,snapshot_at=EXCLUDED.snapshot_at,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                        : "INSERT INTO shopfront_inventory (store_key,source_product_id,outlet_id,quantity,snapshot_at,raw_payload) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),snapshot_at=VALUES(snapshot_at),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                jdbc.update(sql, store, source, outlet, decimal(item,"quantity"), text(item,"timestamp"), objectMapper.writeValueAsString(item));
            }
        } else if ("sales".equals(type)) {
            for (JsonNode sale : items) {
                String external = text(sale, "external_id");
                if (external.isBlank()) continue;
                String sql = postgres
                        ? "INSERT INTO shopfront_sale (store_key,external_id,invoice_id,status,created_at,updated_at,total_price,total_tax,total_discount,total_cost,customer_reference,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (store_key,external_id) DO UPDATE SET invoice_id=EXCLUDED.invoice_id,status=EXCLUDED.status,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,total_price=EXCLUDED.total_price,total_tax=EXCLUDED.total_tax,total_discount=EXCLUDED.total_discount,total_cost=EXCLUDED.total_cost,customer_reference=EXCLUDED.customer_reference,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                        : "INSERT INTO shopfront_sale (store_key,external_id,invoice_id,status,created_at,updated_at,total_price,total_tax,total_discount,total_cost,customer_reference,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE invoice_id=VALUES(invoice_id),status=VALUES(status),created_at=VALUES(created_at),updated_at=VALUES(updated_at),total_price=VALUES(total_price),total_tax=VALUES(total_tax),total_discount=VALUES(total_discount),total_cost=VALUES(total_cost),customer_reference=VALUES(customer_reference),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                jdbc.update(sql, store, external, text(sale,"invoice_id"), text(sale,"status"), text(sale,"created_at"), text(sale,"updated_at"), decimal(sale,"total_price"), decimal(sale,"total_tax"), decimal(sale,"total_discount"), decimal(sale,"total_cost"), text(sale,"customer_reference"), objectMapper.writeValueAsString(sale));
                JsonNode saleItems = sale.path("items");
                if (saleItems.isArray()) {
                    int index = 0;
                    for (JsonNode item : saleItems) {
                        String lineKey = item.hasNonNull("id") ? item.get("id").asText() : Integer.toString(index);
                        String itemSql = postgres
                                ? "INSERT INTO shopfront_sale_item (store_key,external_sale_id,line_key,source_product_id,product_name,quantity,unit_price,line_total,cost,tax,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (store_key,external_sale_id,line_key) DO UPDATE SET source_product_id=EXCLUDED.source_product_id,product_name=EXCLUDED.product_name,quantity=EXCLUDED.quantity,unit_price=EXCLUDED.unit_price,line_total=EXCLUDED.line_total,cost=EXCLUDED.cost,tax=EXCLUDED.tax,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                                : "INSERT INTO shopfront_sale_item (store_key,external_sale_id,line_key,source_product_id,product_name,quantity,unit_price,line_total,cost,tax,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE source_product_id=VALUES(source_product_id),product_name=VALUES(product_name),quantity=VALUES(quantity),unit_price=VALUES(unit_price),line_total=VALUES(line_total),cost=VALUES(cost),tax=VALUES(tax),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                        jdbc.update(itemSql, store, external, lineKey, text(item,"source_product_id"), text(item,"name"), decimal(item,"quantity"), decimal(item,"unit_price"), decimal(item,"line_total"), decimal(item,"cost"), decimal(item,"tax"), objectMapper.writeValueAsString(item));
                        index++;
                    }
                }
                JsonNode payments = sale.path("payments");
                if (payments.isArray()) {
                    int index = 0;
                    for (JsonNode payment : payments) {
                        String paymentKey = payment.hasNonNull("id") ? payment.get("id").asText() : Integer.toString(index);
                        String paymentSql = postgres
                                ? "INSERT INTO shopfront_sale_payment (store_key,external_sale_id,payment_key,amount,status,subtype,raw_payload) VALUES (?,?,?,?,?,?,?) ON CONFLICT (store_key,external_sale_id,payment_key) DO UPDATE SET amount=EXCLUDED.amount,status=EXCLUDED.status,subtype=EXCLUDED.subtype,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                                : "INSERT INTO shopfront_sale_payment (store_key,external_sale_id,payment_key,amount,status,subtype,raw_payload) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE amount=VALUES(amount),status=VALUES(status),subtype=VALUES(subtype),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                        jdbc.update(paymentSql, store, external, paymentKey, decimal(payment,"amount"), text(payment,"status"), text(payment,"subtype"), objectMapper.writeValueAsString(payment));
                        index++;
                    }
                }
            }
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private Object decimal(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() || value.asText().isBlank() ? null : value.decimalValue();
    }

    private boolean isPostgres() {
        try (var connection = jdbc.getDataSource().getConnection()) {
            return connection.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres");
        } catch (Exception e) {
            throw new IllegalStateException("Unable to determine database type", e);
        }
    }

    private boolean isEnabled(Object value) {
        if (value instanceof Boolean enabled) return enabled;
        if (value instanceof Number number) return number.intValue() != 0;
        if (value == null) return false;
        String text = value.toString().trim();
        return "1".equals(text) || "true".equalsIgnoreCase(text);
    }

    private void authorize(String supplied) {
        if (!enabled || token.isBlank() || supplied == null || !java.security.MessageDigest.isEqual(token.getBytes(), supplied.getBytes())) {
            throw new AccessDeniedException("Shopfront integration is disabled or unauthorized");
        }
    }
}
