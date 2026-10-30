package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.ApiResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.access.AccessDeniedException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.Set;

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
    private final boolean businessWriteEnabled;

    @Autowired
    public ShopfrontIntegrationController(
            JdbcTemplate jdbc,
            ObjectMapper objectMapper,
            @Value("${app.shopfront.integration-token:}") String token,
            @Value("${app.shopfront.integration-enabled:false}") boolean enabled,
            @Value("${app.shopfront.business-write-enabled:false}") boolean businessWriteEnabled) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.token = token;
        this.enabled = enabled;
        this.businessWriteEnabled = businessWriteEnabled;
    }

    public ShopfrontIntegrationController(
            JdbcTemplate jdbc,
            ObjectMapper objectMapper,
            String token,
            boolean enabled) {
        this(jdbc, objectMapper, token, enabled, false);
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
    @Transactional
    public ApiResult<Map<String, Object>> products(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                   @RequestBody JsonNode body) {
        return stage(supplied, "products", body);
    }

    @PostMapping("/inventory:replace")
    @Transactional
    public ApiResult<Map<String, Object>> inventory(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                   @RequestBody JsonNode body) {
        return stage(supplied, "inventory", body);
    }

    @PostMapping("/sales:upsert")
    @Transactional
    public ApiResult<Map<String, Object>> sales(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                @RequestBody JsonNode body) {
        return stage(supplied, "sales", body);
    }

    @PostMapping("/suppliers:upsert")
    @Transactional
    public ApiResult<Map<String, Object>> suppliers(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                     @RequestBody JsonNode body) {
        return stage(supplied, "suppliers", body);
    }

    @PostMapping("/purchase-orders:upsert")
    @Transactional
    public ApiResult<Map<String, Object>> purchaseOrders(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                          @RequestBody JsonNode body) {
        return stage(supplied, "purchase_orders", body);
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
        result.put("suppliers", count("shopfront_supplier", storeKey));
        result.put("purchase_orders", count("shopfront_purchase_order", storeKey));
        return ApiResult.ok(result);
    }

    @GetMapping("/data")
    public ApiResult<Map<String, Object>> data(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestParam String storeKey,
            @RequestParam String type,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int size) {
        authorize(supplied);
        if (page < 1 || size < 1 || size > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page must be >= 1 and size must be between 1 and 500");
        }
        String table = switch (type) {
            case "products" -> "shopfront_product";
            case "inventory" -> "shopfront_inventory";
            case "sales" -> "shopfront_sale";
            case "sale_items" -> "shopfront_sale_item";
            case "payments" -> "shopfront_sale_payment";
            case "suppliers" -> "shopfront_supplier";
            case "purchase_orders" -> "shopfront_purchase_order";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown Shopfront data type");
        };
        String orderBy = switch (type) {
            case "products", "suppliers", "purchase_orders" -> "source_id ASC";
            case "inventory" -> "source_product_id ASC, outlet_id ASC";
            case "sales" -> "external_id ASC";
            case "sale_items" -> "external_sale_id ASC, line_key ASC";
            case "payments" -> "external_sale_id ASC, payment_key ASC";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown Shopfront data type");
        };
        ensureShadowTables();
        int offset = (page - 1) * size;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("store_key", storeKey);
        result.put("type", type);
        result.put("page", page);
        result.put("size", size);
        result.put("data", jdbc.queryForList("SELECT * FROM " + table + " WHERE store_key = ? ORDER BY " + orderBy + " LIMIT ? OFFSET ?", storeKey, size, offset));
        result.put("total", count(table, storeKey));
        return ApiResult.ok(result);
    }

    @GetMapping("/match-status")
    public ApiResult<Map<String, Object>> matchStatus(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestParam String storeKey) {
        authorize(supplied);
        ensureShadowTables();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("store_key", storeKey);
        result.put("products", count("shopfront_product", storeKey));
        result.put("products_missing_name", jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_product WHERE store_key = ? AND (name IS NULL OR TRIM(name) = '')",
                Integer.class, storeKey));
        result.put("barcode_matched", jdbc.queryForObject("SELECT COUNT(*) FROM shopfront_product sp WHERE sp.store_key = ? AND sp.barcode IS NOT NULL AND EXISTS (SELECT 1 FROM product_barcode pb WHERE pb.code = sp.barcode)", Integer.class, storeKey));
        result.put("barcode_unmatched", jdbc.queryForObject("SELECT COUNT(*) FROM shopfront_product sp WHERE sp.store_key = ? AND (sp.barcode IS NULL OR NOT EXISTS (SELECT 1 FROM product_barcode pb WHERE pb.code = sp.barcode))", Integer.class, storeKey));
        result.put("manually_mapped", jdbc.queryForObject("SELECT COUNT(*) FROM shopfront_product_mapping WHERE store_key = ? AND status = 'MAPPED'", Integer.class, storeKey));
        result.put("sales_with_unmatched_items", jdbc.queryForObject("SELECT COUNT(DISTINCT ss.external_id) FROM shopfront_sale ss JOIN shopfront_sale_item si ON si.store_key = ss.store_key AND si.external_sale_id = ss.external_id LEFT JOIN shopfront_product sp ON sp.store_key = ss.store_key AND sp.source_id = si.source_product_id WHERE ss.store_key = ? AND NOT EXISTS (SELECT 1 FROM shopfront_product_mapping pm WHERE pm.store_key = ss.store_key AND pm.source_product_id = si.source_product_id AND pm.status = 'MAPPED') AND (sp.barcode IS NULL OR NOT EXISTS (SELECT 1 FROM product_barcode pb WHERE pb.code = sp.barcode))", Integer.class, storeKey));
        result.put("sale_items_missing_name", jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_sale_item WHERE store_key = ? AND (product_name IS NULL OR TRIM(product_name) = '')",
                Integer.class, storeKey));
        result.put("sale_items_missing_source_product", jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_sale_item WHERE store_key = ? AND (source_product_id IS NULL OR TRIM(source_product_id) = '')",
                Integer.class, storeKey));
        result.put("inventory_outlets", jdbc.queryForObject(
                "SELECT COUNT(DISTINCT outlet_id) FROM shopfront_inventory WHERE store_key = ?",
                Integer.class, storeKey));
        return ApiResult.ok(result);
    }

    @GetMapping("/product-mappings")
    public ApiResult<Map<String, Object>> productMappings(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestParam String storeKey) {
        authorize(supplied);
        ensureShadowTables();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("store_key", storeKey);
        result.put("data", jdbc.queryForList("SELECT m.store_key, m.source_product_id, m.pos_product_id, m.match_type, m.status, p.name AS pos_product_name FROM shopfront_product_mapping m LEFT JOIN product p ON p.id = m.pos_product_id WHERE m.store_key = ? ORDER BY m.source_product_id", storeKey));
        return ApiResult.ok(result);
    }

    @PutMapping("/product-mappings/{sourceProductId}")
    public ApiResult<Map<String, Object>> saveProductMapping(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @PathVariable String sourceProductId,
            @RequestParam String storeKey,
            @RequestBody JsonNode body) {
        authorize(supplied);
        ensureShadowTables();
        long posProductId = body.path("pos_product_id").asLong(0);
        if (sourceProductId.isBlank() || storeKey.isBlank() || posProductId <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "storeKey, sourceProductId and pos_product_id are required");
        }
        Integer exists = jdbc.queryForObject("SELECT COUNT(*) FROM product WHERE id = ? AND deleted_at IS NULL", Integer.class, posProductId);
        if (exists == null || exists == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "POS product does not exist or is deleted");
        }
        String matchType = body.path("match_type").asText("MANUAL").trim();
        boolean postgres = isPostgres();
        String sql = postgres
                ? "INSERT INTO shopfront_product_mapping (store_key,source_product_id,pos_product_id,match_type,status) VALUES (?,?,?,?, 'MAPPED') ON CONFLICT (store_key,source_product_id) DO UPDATE SET pos_product_id=EXCLUDED.pos_product_id,match_type=EXCLUDED.match_type,status='MAPPED',updated_at=CURRENT_TIMESTAMP"
                : "INSERT INTO shopfront_product_mapping (store_key,source_product_id,pos_product_id,match_type,status) VALUES (?,?,?,?, 'MAPPED') ON DUPLICATE KEY UPDATE pos_product_id=VALUES(pos_product_id),match_type=VALUES(match_type),status='MAPPED',updated_at=CURRENT_TIMESTAMP";
        jdbc.update(sql, storeKey, sourceProductId, posProductId, matchType);
        return ApiResult.ok(Map.of("store_key", storeKey, "source_product_id", sourceProductId, "pos_product_id", posProductId, "status", "MAPPED"));
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
            String status = mappingReady ? "STAGED" : "BLOCKED_MAPPING";
            Map<String, Object> business = Map.of("enabled", false, "created", 0, "updated", 0, "skipped", 0);
            if (mappingReady) {
                ensureShadowTables();
                boolean completeInventorySnapshot = "inventory".equals(type)
                        && body.path("replace").asBoolean(false)
                        && body.path("snapshot_complete").asBoolean(false);
                persistShadow(type, store, mappingRows.get(0), items, completeInventorySnapshot);
                if (businessWriteEnabled) {
                    business = importBusiness(type, store, mappingRows.get(0), items, completeInventorySnapshot);
                }
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
            result.put("business_write", businessWriteEnabled && mappingReady);
            result.put("shadow_write", mappingReady);
            result.put("business", business);
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
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_supplier (store_key VARCHAR(64) NOT NULL, source_id " + key + " NOT NULL, name VARCHAR(255), business_number VARCHAR(128), status VARCHAR(64), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_purchase_order (store_key VARCHAR(64) NOT NULL, source_id " + key + " NOT NULL, supplier_source_id " + key + ", status VARCHAR(64), order_date VARCHAR(64), total_cost DECIMAL(18,4), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_product_mapping (store_key VARCHAR(64) NOT NULL, source_product_id " + key + " NOT NULL, pos_product_id BIGINT NOT NULL, match_type VARCHAR(32) NOT NULL, status VARCHAR(32) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_product_id))");
    }

    /**
     * Import the source catalog into the POS catalog after the durable mirror
     * has been written. Every source product is bound to one POS product in
     * shopfront_product_mapping, so retries update the same row instead of
     * creating another Sell item.
     */
    private Map<String, Object> importBusiness(String type, String store, Map<String, Object> mapping, JsonNode items, boolean completeInventorySnapshot) throws Exception {
        long outletId = longValue(mapping.get("outlet_id"));
        if (outletId <= 0) throw new IllegalArgumentException("Shopfront mapping has no numeric POS outlet_id");
        int created = 0;
        int updated = 0;
        int skipped = 0;
        Set<String> errors = new HashSet<>();
        if ("products".equals(type)) {
            for (JsonNode item : items) {
                try {
                    long productId = upsertBusinessProduct(store, item, outletId);
                    if (productId > 0) {
                        boolean existed = jdbc.queryForObject(
                                "SELECT COUNT(*) FROM shopfront_product_mapping WHERE store_key=? AND source_product_id=? AND pos_product_id=?",
                                Integer.class, store, text(item, "source_id"), productId) > 0;
                        upsertSourceMapping(store, text(item, "source_id"), productId);
                        if (existed) updated++; else created++;
                    } else skipped++;
                } catch (Exception e) {
                    skipped++;
                    errors.add(text(item, "source_id") + ": " + e.getMessage());
                }
            }
        } else if ("inventory".equals(type)) {
            if (completeInventorySnapshot) {
                jdbc.update("DELETE FROM product_inventory WHERE outlet_id=? AND product_id IN (SELECT pos_product_id FROM shopfront_product_mapping WHERE store_key=?)", outletId, store);
            }
            for (JsonNode item : items) {
                try {
                    Long productId = mappedProductId(store, text(item, "source_id"));
                    if (productId == null) { skipped++; continue; }
                    upsertBusinessInventory(productId, outletId, item);
                    updated++;
                } catch (Exception e) {
                    skipped++;
                    errors.add(text(item, "source_id") + ": " + e.getMessage());
                }
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("enabled", true);
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        result.put("errors", errors.stream().limit(20).toList());
        return result;
    }

    private long upsertBusinessProduct(String store, JsonNode item, long outletId) throws Exception {
        String sourceId = text(item, "source_id");
        String name = text(item, "name");
        if (sourceId == null || sourceId.isBlank() || name == null || name.isBlank()) return 0;
        Long productId = mappedProductId(store, sourceId);
        String barcode = firstBarcode(item);
        if (productId == null && barcode != null) {
            productId = findLong("SELECT product_id FROM product_barcode WHERE code=? LIMIT 1", barcode);
        }
        Integer mdbId = integerValue(item.get("sku"));
        if (productId == null && mdbId != null) {
            productId = findLong("SELECT id FROM product WHERE mdb_id=? AND deleted_at IS NULL LIMIT 1", mdbId);
        }
        if (productId == null) {
            // active_name is globally unique in PostgreSQL, so an outlet-scoped
            // lookup would still try to insert a duplicate for another outlet.
            productId = findLong("SELECT id FROM product WHERE lower(trim(name))=lower(trim(?)) AND deleted_at IS NULL LIMIT 1", name);
        }
        Long categoryId = ensureLookup("category", text(item, "category"), outletId);
        Long brandId = ensureLookup("brand", text(item, "brand"), outletId);
        JsonNode family = item.get("family");
        Long familyId = ensureLookup("family", family == null ? null : family.asText(null), outletId);
        Long taxRateId = ensureTaxRate(text(item, "tax_rate_name"), outletId);
        BigDecimal caseQuantity = decimal(item, "case_quantity");
        if (caseQuantity == null || caseQuantity.signum() <= 0) caseQuantity = BigDecimal.ONE;
        BigDecimal cost = decimal(item, "cost");
        String type = text(item, "source_type");
        if (type == null || type.isBlank()) type = "STANDARD";
        String description = text(item, "description");
        String image = text(item, "image");
        String alternateImages = item.has("alternate_images") ? objectMapper.writeValueAsString(item.get("alternate_images")) : "[]";
        if (productId == null) {
            String sql = "INSERT INTO product (name,type,status,description,category_id,brand_id,family_id,tax_rate_id,cost_tax_rate_id,cost,case_quantity,cost_percentage,track_inventory,use_scales,use_barcode_templates,prevent_manual_discounts,request_price,request_quantity,order_notes,invoice_notes,image,alternate_images,mdb_id,outlet_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?) RETURNING id";
            productId = jdbc.queryForObject(sql, Long.class, name, type, "ACTIVE", description, categoryId, brandId, familyId, taxRateId, taxRateId, cost, caseQuantity, flag(item, "cost_percentage", false), flag(item, "track_inventory", true), flag(item, "use_scales", false), flag(item, "use_barcode_templates", false), flag(item, "prevent_manual_discounts", false), flag(item, "request_price", false), flag(item, "request_quantity", false), text(item, "order_notes"), text(item, "invoice_notes"), image, alternateImages, mdbId, outletId);
        } else {
            jdbc.update("UPDATE product SET name=?,type=?,status='ACTIVE',description=?,category_id=?,brand_id=?,family_id=?,tax_rate_id=?,cost_tax_rate_id=?,cost=?,case_quantity=?,cost_percentage=?,track_inventory=?,use_scales=?,use_barcode_templates=?,prevent_manual_discounts=?,request_price=?,request_quantity=?,order_notes=?,invoice_notes=?,image=COALESCE(?,image),alternate_images=?::jsonb,mdb_id=?,outlet_id=? WHERE id=?", name, type, description, categoryId, brandId, familyId, taxRateId, taxRateId, cost, caseQuantity, flag(item, "cost_percentage", false), flag(item, "track_inventory", true), flag(item, "use_scales", false), flag(item, "use_barcode_templates", false), flag(item, "prevent_manual_discounts", false), flag(item, "request_price", false), flag(item, "request_quantity", false), text(item, "order_notes"), text(item, "invoice_notes"), image, alternateImages, mdbId, outletId, productId);
        }
        upsertPrices(productId, item, outletId);
        upsertBarcodes(productId, item, outletId);
        upsertTags(productId, item, outletId);
        return productId;
    }

    private void upsertBusinessInventory(long productId, long outletId, JsonNode item) {
        jdbc.update("INSERT INTO product_inventory (product_id,outlet_id,quantity,reorder_level,reorder_amount,reorder_limit,max_quantity,on_order) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (product_id,outlet_id) DO UPDATE SET quantity=EXCLUDED.quantity,reorder_level=EXCLUDED.reorder_level,reorder_amount=EXCLUDED.reorder_amount,reorder_limit=EXCLUDED.reorder_limit,max_quantity=EXCLUDED.max_quantity,on_order=EXCLUDED.on_order", productId, outletId, decimal(item, "quantity", BigDecimal.ZERO), decimal(item, "reorder_level"), decimal(item, "reorder_amount"), decimal(item, "reorder_limit"), decimal(item, "max_quantity"), decimal(item, "on_order", BigDecimal.ZERO));
    }

    private void upsertPrices(long productId, JsonNode item, long outletId) {
        JsonNode prices = item.get("prices");
        if (prices == null || !prices.isArray() || prices.size() == 0) return;
        jdbc.update("DELETE FROM product_price WHERE product_id=?", productId);
        for (JsonNode price : prices) {
            BigDecimal quantity = decimal(price, "quantity", BigDecimal.ONE);
            BigDecimal value = decimal(price, "price");
            if (quantity != null && quantity.signum() > 0 && value != null) jdbc.update("INSERT INTO product_price (product_id,quantity,price,price_ex) VALUES (?,?,?,?)", productId, quantity, value, decimal(price, "price_ex") != null ? decimal(price, "price_ex") : decimal(price, "priceEx"));
        }
    }

    private void upsertBarcodes(long productId, JsonNode item, long outletId) {
        JsonNode barcodes = item.get("barcodes");
        if (!barcodes.isArray()) return;
        for (JsonNode barcode : barcodes) {
            String code = text(barcode, "code");
            if (code == null || code.isBlank()) continue;
            Long owner = findLong("SELECT product_id FROM product_barcode WHERE code=? LIMIT 1", code);
            if (owner != null && !owner.equals(productId)) continue;
            if (owner == null) jdbc.update("INSERT INTO product_barcode (product_id,code,quantity) VALUES (?,?,?)", productId, code, decimal(barcode, "quantity", BigDecimal.ONE));
            else jdbc.update("UPDATE product_barcode SET quantity=? WHERE product_id=? AND code=?", decimal(barcode, "quantity", BigDecimal.ONE), productId, code);
        }
    }

    private void upsertTags(long productId, JsonNode item, long outletId) {
        JsonNode tags = item.get("tags");
        if (tags == null || !tags.isArray()) return;
        try {
            jdbc.update("DELETE FROM product_tag WHERE product_id=?", productId);
            for (JsonNode tag : tags) {
                String name = tag.isTextual() ? tag.asText() : text(tag, "name");
                if (name == null || name.isBlank()) continue;
                Long tagId = ensureLookup("tag", name, outletId);
                if (tagId != null) jdbc.update("INSERT INTO product_tag (product_id,tag_id) VALUES (?,?)", productId, tagId);
            }
        } catch (Exception e) {
            // Tags are optional metadata; a malformed tag must not discard the
            // product, price, barcode or inventory update.
            log.warn("Shopfront tag sync skipped for product {}: {}", productId, e.getMessage());
        }
    }

    private void upsertSourceMapping(String store, String sourceId, long productId) {
        jdbc.update("INSERT INTO shopfront_product_mapping (store_key,source_product_id,pos_product_id,match_type,status) VALUES (?,?,?,'SHOPFRONT','MAPPED') ON CONFLICT (store_key,source_product_id) DO UPDATE SET pos_product_id=EXCLUDED.pos_product_id,match_type=EXCLUDED.match_type,status='MAPPED',updated_at=CURRENT_TIMESTAMP", store, sourceId, productId);
    }

    private Long mappedProductId(String store, String sourceId) {
        if (sourceId == null || sourceId.isBlank()) return null;
        try {
            if (store == null) return jdbc.queryForObject("SELECT pos_product_id FROM shopfront_product_mapping WHERE source_product_id=? LIMIT 1", Long.class, sourceId);
            return jdbc.queryForObject("SELECT pos_product_id FROM shopfront_product_mapping WHERE source_product_id=? AND store_key=? LIMIT 1", Long.class, sourceId, store);
        } catch (Exception ignored) { return null; }
    }

    private Long ensureLookup(String table, String name, long outletId) {
        if (name == null || name.isBlank()) return null;
        try {
            Long id = jdbc.queryForObject("SELECT id FROM " + table + " WHERE lower(trim(name))=lower(trim(?)) AND deleted_at IS NULL LIMIT 1", Long.class, name);
            if (id != null) return id;
        } catch (Exception ignored) { }
        return jdbc.queryForObject("INSERT INTO " + table + " (name) VALUES (?) RETURNING id", Long.class, name);
    }

    private Long ensureTaxRate(String name, long outletId) {
        if (name == null || name.isBlank()) return null;
        try { return jdbc.queryForObject("SELECT id FROM tax_rate WHERE lower(trim(name))=lower(trim(?)) AND deleted_at IS NULL LIMIT 1", Long.class, name); }
        catch (Exception ignored) { return null; }
    }

    private Long findLong(String sql, Object... args) {
        try { return jdbc.queryForObject(sql, Long.class, args); }
        catch (Exception ignored) { return null; }
    }

    private String firstBarcode(JsonNode item) {
        JsonNode barcodes = item.get("barcodes");
        if (barcodes != null && barcodes.isArray() && !barcodes.isEmpty()) return text(barcodes.get(0), "code");
        return text(item, "barcode");
    }

    private long longValue(Object value) { try { return value == null ? 0 : Long.parseLong(String.valueOf(value)); } catch (Exception e) { return 0; } }
    private Integer integerValue(Object value) { try { return value == null || String.valueOf(value).isBlank() ? null : Integer.valueOf(String.valueOf(value)); } catch (Exception e) { return null; } }
    private int flag(JsonNode node, String key, boolean fallback) { return node.has(key) && !node.get(key).isNull() ? (node.get(key).asBoolean() ? 1 : 0) : (fallback ? 1 : 0); }
    private BigDecimal decimal(JsonNode node, String key) { return decimal(node, key, null); }
    private BigDecimal decimal(JsonNode node, String key, BigDecimal fallback) { try { JsonNode value=node.get(key); return value == null || value.isNull() || value.asText().isBlank() ? fallback : value.decimalValue(); } catch (Exception e) { return fallback; } }

    private int count(String table, String store) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE store_key = ?", Integer.class, store);
        return count == null ? 0 : count;
    }

    private void persistShadow(String type, String store, Map<String, Object> mapping, JsonNode items, boolean completeInventorySnapshot) throws Exception {
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
            // Product batches can arrive after their historical sales. Repair
            // those durable sale-line mirrors from the source ID in one
            // idempotent statement so old lines do not stay unnamed forever.
            jdbc.update("UPDATE shopfront_sale_item si SET product_name=(SELECT sp.name FROM shopfront_product sp WHERE sp.store_key=si.store_key AND sp.source_id=si.source_product_id), synced_at=CURRENT_TIMESTAMP WHERE si.store_key=? AND (si.product_name IS NULL OR TRIM(si.product_name)='') AND EXISTS (SELECT 1 FROM shopfront_product sp WHERE sp.store_key=si.store_key AND sp.source_id=si.source_product_id AND sp.name IS NOT NULL AND TRIM(sp.name)<>'')", store);
        } else if ("inventory".equals(type)) {
            if (completeInventorySnapshot) {
                jdbc.update("DELETE FROM shopfront_inventory WHERE store_key = ?", store);
            }
            for (JsonNode item : items) {
                String source = text(item, "source_id");
                if (source.isBlank()) continue;
                String sql = postgres
                        ? "INSERT INTO shopfront_inventory (store_key,source_product_id,outlet_id,quantity,snapshot_at,raw_payload) VALUES (?,?,?,?,?,?) ON CONFLICT (store_key,source_product_id,outlet_id) DO UPDATE SET quantity=EXCLUDED.quantity,snapshot_at=EXCLUDED.snapshot_at,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                        : "INSERT INTO shopfront_inventory (store_key,source_product_id,outlet_id,quantity,snapshot_at,raw_payload) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),snapshot_at=VALUES(snapshot_at),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                String itemOutlet = text(item, "outlet_id");
                if (itemOutlet == null || itemOutlet.isBlank()) itemOutlet = outlet;
                jdbc.update(sql, store, source, itemOutlet, decimal(item,"quantity"), text(item,"timestamp"), objectMapper.writeValueAsString(item));
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
        } else if ("suppliers".equals(type)) {
            for (JsonNode item : items) {
                String source = text(item, "source_id");
                if (source == null || source.isBlank()) continue;
                String sql = postgres
                        ? "INSERT INTO shopfront_supplier (store_key,source_id,name,business_number,status,raw_payload) VALUES (?,?,?,?,?,?) ON CONFLICT (store_key,source_id) DO UPDATE SET name=EXCLUDED.name,business_number=EXCLUDED.business_number,status=EXCLUDED.status,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                        : "INSERT INTO shopfront_supplier (store_key,source_id,name,business_number,status,raw_payload) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),business_number=VALUES(business_number),status=VALUES(status),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                jdbc.update(sql, store, source, text(item, "name"), text(item, "business_number"), text(item, "status"), objectMapper.writeValueAsString(item.path("raw_payload").isMissingNode() ? item : item.path("raw_payload")));
            }
        } else if ("purchase_orders".equals(type)) {
            for (JsonNode item : items) {
                String source = text(item, "source_id");
                if (source == null || source.isBlank()) continue;
                String sql = postgres
                        ? "INSERT INTO shopfront_purchase_order (store_key,source_id,supplier_source_id,status,order_date,total_cost,raw_payload) VALUES (?,?,?,?,?,?,?) ON CONFLICT (store_key,source_id) DO UPDATE SET supplier_source_id=EXCLUDED.supplier_source_id,status=EXCLUDED.status,order_date=EXCLUDED.order_date,total_cost=EXCLUDED.total_cost,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                        : "INSERT INTO shopfront_purchase_order (store_key,source_id,supplier_source_id,status,order_date,total_cost,raw_payload) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE supplier_source_id=VALUES(supplier_source_id),status=VALUES(status),order_date=VALUES(order_date),total_cost=VALUES(total_cost),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                jdbc.update(sql, store, source, text(item, "supplier_source_id"), text(item, "status"), text(item, "order_date"), decimal(item, "total_cost"), objectMapper.writeValueAsString(item.path("raw_payload").isMissingNode() ? item : item.path("raw_payload")));
            }
        }
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
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
