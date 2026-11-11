package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.ApiResult;
import com.orithos.modules.customer.NativeCustomerImportService;
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
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.Set;

import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Staging boundary for Shopfront imports. Business catalogue and inventory
 * writes remain gated by the dedicated business-write setting.
 */
@RestController
@RequestMapping("/api/integrations/shopfront")
public class ShopfrontIntegrationController {
    private static final Logger log = LoggerFactory.getLogger(ShopfrontIntegrationController.class);
    private static final Pattern STORE_KEY = Pattern.compile("[a-z][a-z0-9_-]{0,63}");
    private static final List<ShopfrontMirrorTable> MIRROR_TABLES = List.of(
            new ShopfrontMirrorTable("shopfront_product", "source_id,name,sku,barcode,category,brand,cost,price,raw_payload,synced_at"),
            new ShopfrontMirrorTable("shopfront_inventory", "source_product_id,outlet_id,quantity,snapshot_at,raw_payload,synced_at"),
            new ShopfrontMirrorTable("shopfront_sale", "external_id,invoice_id,status,created_at,updated_at,business_date,total_price,total_tax,total_discount,total_cost,customer_reference,raw_payload,synced_at"),
            new ShopfrontMirrorTable("shopfront_sale_item", "external_sale_id,line_key,source_product_id,product_name,quantity,unit_price,line_total,cost,tax,raw_payload,synced_at"),
            new ShopfrontMirrorTable("shopfront_sale_payment", "external_sale_id,payment_key,amount,status,subtype,raw_payload,synced_at"),
            new ShopfrontMirrorTable("shopfront_supplier", "source_id,name,business_number,status,raw_payload,synced_at"),
            new ShopfrontMirrorTable("shopfront_customer", "source_id,client_id,code,name,email,phone,mobile,deleted,raw_payload,synced_at"),
            new ShopfrontMirrorTable("shopfront_purchase_order", "source_id,supplier_source_id,status,order_date,total_cost,raw_payload,synced_at"),
            new ShopfrontMirrorTable("shopfront_extended_record", "entity_type,source_id,raw_payload,synced_at")
    );
    private record ShopfrontMirrorTable(String name, String columns) {}
    private record BusinessImportPlan(Map<String, Long> productIds, Set<String> existingProductMappings) {}
    private record BarcodeWrite(long productId, String code, BigDecimal quantity) {}

    private static final class ProductImportBatch {
        private final Map<String, Long> lookupIds = new HashMap<>();
        private final Map<String, Long> productIdsByIdentity = new HashMap<>();
        private final Map<Long, Object[]> productUpdates = new LinkedHashMap<>();
        private final Map<Long, List<Object[]>> pricesByProduct = new LinkedHashMap<>();
        private final List<BarcodeWrite> barcodes = new ArrayList<>();
        private final Set<Long> productsWithTags = new LinkedHashSet<>();
        private final Map<Long, Map<Long, Object[]>> tagsByProduct = new LinkedHashMap<>();
        private final Map<String, Object[]> sourceMappings = new LinkedHashMap<>();
    }

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final ShopfrontNativeSaleImporter nativeSaleImporter;
    private final NativeCustomerImportService nativeCustomerImportService;
    private final String token;
    private final boolean enabled;
    private final boolean businessWriteEnabled;

    @Autowired
    public ShopfrontIntegrationController(
            JdbcTemplate jdbc,
            ObjectMapper objectMapper,
            ShopfrontNativeSaleImporter nativeSaleImporter,
            NativeCustomerImportService nativeCustomerImportService,
            @Value("${app.shopfront.integration-token:}") String token,
            @Value("${app.shopfront.integration-enabled:false}") boolean enabled,
            @Value("${app.shopfront.business-write-enabled:false}") boolean businessWriteEnabled) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.nativeSaleImporter = nativeSaleImporter;
        this.nativeCustomerImportService = nativeCustomerImportService;
        this.token = token;
        this.enabled = enabled;
        this.businessWriteEnabled = businessWriteEnabled;
    }

    public ShopfrontIntegrationController(
            JdbcTemplate jdbc,
            ObjectMapper objectMapper,
            String token,
            boolean enabled) {
        this(jdbc, objectMapper, new ShopfrontNativeSaleImporter(jdbc, objectMapper),
                new NativeCustomerImportService(jdbc), token, enabled, false);
    }

    public ShopfrontIntegrationController(
            JdbcTemplate jdbc,
            ObjectMapper objectMapper,
            String token,
            boolean enabled,
            boolean businessWriteEnabled) {
        this(jdbc, objectMapper, new ShopfrontNativeSaleImporter(jdbc, objectMapper),
                new NativeCustomerImportService(jdbc), token, enabled, businessWriteEnabled);
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
        // Live PG column is boolean; SMALLINT literals like enabled=1 fail on PostgreSQL.
        Object enabledTrue = isPostgres() ? Boolean.TRUE : 1;
        int updated = jdbc.update(
                "UPDATE shopfront_store_mapping SET shopfront_outlet=?, company_id=?, outlet_id=?, enabled=? WHERE store_key=?",
                shopfrontOutlet, companyId, outletId, enabledTrue, storeKey);
        if (updated == 0) {
            try {
                jdbc.update(
                        "INSERT INTO shopfront_store_mapping (store_key, shopfront_outlet, company_id, outlet_id, enabled) VALUES (?, ?, ?, ?, ?)",
                        storeKey, shopfrontOutlet, companyId, outletId, enabledTrue);
            } catch (DuplicateKeyException race) {
                jdbc.update(
                        "UPDATE shopfront_store_mapping SET shopfront_outlet=?, company_id=?, outlet_id=?, enabled=? WHERE store_key=?",
                        shopfrontOutlet, companyId, outletId, enabledTrue, storeKey);
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

    /**
     * One-shot promotion of durable {@code shopfront_sale*} rows into the native
     * {@code sale}/{@code sale_item} ledger for mapped outlets (no stock moves).
     */
    @GetMapping("/sales:native-day-totals")
    public ApiResult<Map<String, Object>> nativeDayTotals(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestParam String day) {
        authorize(supplied);
        if (!day.matches("\\d{4}-\\d{2}-\\d{2}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "day must be YYYY-MM-DD");
        }
        ensureMappingTable();
        ensureSaleBusinessDatesReady();
        List<Map<String, Object>> mappings = jdbc.queryForList(
                "SELECT store_key, outlet_id, enabled FROM shopfront_store_mapping ORDER BY store_key");
        Map<String, Object> byStore = new LinkedHashMap<>();
        for (Map<String, Object> mapping : mappings) {
            if (!isEnabled(mapping.get("enabled"))) continue;
            String storeKey = String.valueOf(mapping.get("store_key"));
            long outletId = longValue(mapping.get("outlet_id"));
            List<Map<String, Object>> rows = jdbc.queryForList("""
                    SELECT COUNT(*) AS transactions,
                           COALESCE(SUM(total_price), 0) AS revenue,
                           COUNT(*) FILTER (WHERE source_system = 'shopfront') AS shopfront_transactions,
                           COALESCE(SUM(total_price) FILTER (WHERE source_system = 'shopfront'), 0) AS shopfront_revenue,
                           COUNT(*) FILTER (WHERE source_system IS DISTINCT FROM 'shopfront') AS other_transactions,
                           COALESCE(SUM(total_price) FILTER (WHERE source_system IS DISTINCT FROM 'shopfront'), 0) AS other_revenue
                    FROM sale
                    WHERE outlet_id = ?
                      AND status = 'COMPLETED'
                      AND COALESCE(business_date, DATE(local_sold_at), DATE(created_at)) = CAST(? AS date)
                    """, outletId, day);
            Map<String, Object> row = rows.isEmpty() ? Map.of() : rows.get(0);
            List<Map<String, Object>> otherSales = jdbc.queryForList("""
                    SELECT id, external_id, source_system, invoice_id, total_price, business_date::text AS business_date
                    FROM sale
                    WHERE outlet_id = ?
                      AND status = 'COMPLETED'
                      AND COALESCE(business_date, DATE(local_sold_at), DATE(created_at)) = CAST(? AS date)
                      AND source_system IS DISTINCT FROM 'shopfront'
                    ORDER BY id
                    LIMIT 20
                    """, outletId, day);
            List<Map<String, Object>> mirrorRows = jdbc.queryForList("""
                    SELECT COUNT(*) AS transactions,
                           COALESCE(SUM(total_price), 0) AS revenue,
                           COALESCE(SUM(COALESCE(
                               NULLIF(raw_payload::jsonb ->> 'total_price', '')::numeric,
                               NULLIF(raw_payload::jsonb ->> 'totalPrice', '')::numeric,
                               total_price)), 0) AS payload_revenue
                    FROM shopfront_sale
                    WHERE store_key = ?
                      AND UPPER(COALESCE(status, '')) IN ('COMPLETED', 'CLOSED', 'PAID', 'FINALISED', 'FINALIZED')
                      AND business_date = CAST(? AS date)
                    """, storeKey, day);
            Map<String, Object> mirror = mirrorRows.isEmpty() ? Map.of() : mirrorRows.get(0);
            List<Map<String, Object>> incompleteRows = jdbc.queryForList("""
                    SELECT COUNT(*) AS transactions,
                           COALESCE(SUM(total_price), 0) AS revenue
                    FROM shopfront_sale
                    WHERE store_key = ?
                      AND UPPER(COALESCE(status, '')) = 'INCOMPLETE'
                      AND business_date = CAST(? AS date)
                    """, storeKey, day);
            Map<String, Object> incomplete = incompleteRows.isEmpty() ? Map.of() : incompleteRows.get(0);
            BigDecimal shopfrontRevenue = decimalObject(row.get("shopfront_revenue"));
            BigDecimal incompleteRevenue = decimalObject(incomplete.get("revenue"));
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("outlet_id", outletId);
            entry.put("transactions", row.get("transactions"));
            entry.put("revenue", row.get("revenue"));
            entry.put("shopfront_transactions", row.get("shopfront_transactions"));
            entry.put("shopfront_revenue", row.get("shopfront_revenue"));
            entry.put("other_transactions", row.get("other_transactions"));
            entry.put("other_revenue", row.get("other_revenue"));
            entry.put("other_sales", otherSales);
            entry.put("mirror_transactions", mirror.get("transactions"));
            entry.put("mirror_revenue", mirror.get("revenue"));
            entry.put("mirror_payload_revenue", mirror.get("payload_revenue"));
            entry.put("mirror_incomplete_transactions", incomplete.get("transactions"));
            entry.put("mirror_incomplete_revenue", incomplete.get("revenue"));
            // Shopfront sales-report DSL counts COMPLETED + INCOMPLETE for this tenant day.
            entry.put("shopfront_report_comparable_revenue", shopfrontRevenue.add(incompleteRevenue));
            entry.put("shopfront_report_comparable_transactions",
                    longValue(row.get("shopfront_transactions")) + longValue(incomplete.get("transactions")));
            byStore.put(storeKey, entry);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("day", day);
        result.put("source", "orithos_ledger");
        result.put("by_store", byStore);
        return ApiResult.ok(result);
    }

    /**
     * Diagnose Adelaide-day parity between mirror {@code shopfront_sale} and native {@code sale}.
     */
    @GetMapping("/sales:native-day-diff")
    public ApiResult<Map<String, Object>> nativeDayDiff(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestParam String day,
            @RequestParam(required = false) String store_key) {
        authorize(supplied);
        if (!day.matches("\\d{4}-\\d{2}-\\d{2}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "day must be YYYY-MM-DD");
        }
        ensureMappingTable();
        ensureSaleBusinessDatesReady();
        List<Map<String, Object>> mappings = jdbc.queryForList(
                "SELECT store_key, outlet_id, enabled FROM shopfront_store_mapping ORDER BY store_key");
        Map<String, Object> byStore = new LinkedHashMap<>();
        for (Map<String, Object> mapping : mappings) {
            if (!isEnabled(mapping.get("enabled"))) continue;
            String storeKey = String.valueOf(mapping.get("store_key"));
            if (store_key != null && !store_key.isBlank() && !store_key.equals(storeKey)) continue;
            long outletId = longValue(mapping.get("outlet_id"));
            List<Map<String, Object>> nativeRows = jdbc.queryForList("""
                    SELECT external_id, status, total_price, business_date::text AS business_date,
                           local_sold_at::text AS local_sold_at
                    FROM sale
                    WHERE outlet_id = ?
                      AND source_system = 'shopfront'
                      AND COALESCE(business_date, DATE(local_sold_at), DATE(created_at)) = CAST(? AS date)
                    ORDER BY external_id
                    """, outletId, day);
            List<Map<String, Object>> mirrorRows = jdbc.queryForList("""
                    SELECT external_id, status, total_price, created_at, business_date::text AS adelaide_day,
                           COALESCE(
                               NULLIF(raw_payload::jsonb ->> 'total_price', '')::numeric,
                               NULLIF(raw_payload::jsonb ->> 'totalPrice', '')::numeric,
                               total_price) AS payload_total
                    FROM shopfront_sale
                    WHERE store_key = ?
                      AND (
                        business_date = CAST(? AS date)
                        OR EXISTS (
                          SELECT 1 FROM sale s
                          WHERE s.outlet_id = ?
                            AND s.source_system = 'shopfront'
                            AND s.external_id = shopfront_sale.external_id
                            AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) = CAST(? AS date)
                        )
                      )
                    ORDER BY external_id
                    """, storeKey, day, outletId, day);
            Map<String, Map<String, Object>> nativeById = new LinkedHashMap<>();
            for (Map<String, Object> row : nativeRows) {
                nativeById.put(String.valueOf(row.get("external_id")), row);
            }
            Map<String, Map<String, Object>> mirrorById = new LinkedHashMap<>();
            for (Map<String, Object> row : mirrorRows) {
                mirrorById.put(String.valueOf(row.get("external_id")), row);
            }
            List<Map<String, Object>> onlyNative = new ArrayList<>();
            List<Map<String, Object>> onlyMirror = new ArrayList<>();
            List<Map<String, Object>> amountMismatch = new ArrayList<>();
            List<Map<String, Object>> statusMismatch = new ArrayList<>();
            BigDecimal nativeSum = BigDecimal.ZERO;
            BigDecimal mirrorSum = BigDecimal.ZERO;
            BigDecimal payloadSum = BigDecimal.ZERO;
            int nativeCompleted = 0;
            int mirrorCompleted = 0;
            for (Map.Entry<String, Map<String, Object>> entry : nativeById.entrySet()) {
                Map<String, Object> nativeRow = entry.getValue();
                BigDecimal nativeTotal = decimalObject(nativeRow.get("total_price"));
                if ("COMPLETED".equalsIgnoreCase(String.valueOf(nativeRow.get("status")))) {
                    nativeCompleted++;
                    nativeSum = nativeSum.add(nativeTotal);
                }
                Map<String, Object> mirrorRow = mirrorById.get(entry.getKey());
                if (mirrorRow == null) {
                    Map<String, Object> miss = new LinkedHashMap<>(nativeRow);
                    onlyNative.add(miss);
                    continue;
                }
                BigDecimal mirrorTotal = decimalObject(mirrorRow.get("total_price"));
                BigDecimal payloadTotal = decimalObject(mirrorRow.get("payload_total"));
                if (isMirrorCompleted(mirrorRow.get("status"))) {
                    mirrorCompleted++;
                    mirrorSum = mirrorSum.add(mirrorTotal);
                    payloadSum = payloadSum.add(payloadTotal);
                }
                if (nativeTotal.subtract(payloadTotal).abs().compareTo(new BigDecimal("0.009")) > 0
                        || nativeTotal.subtract(mirrorTotal).abs().compareTo(new BigDecimal("0.009")) > 0) {
                    Map<String, Object> mismatch = new LinkedHashMap<>();
                    mismatch.put("external_id", entry.getKey());
                    mismatch.put("native_total", nativeTotal);
                    mismatch.put("mirror_total", mirrorTotal);
                    mismatch.put("payload_total", payloadTotal);
                    mismatch.put("native_status", nativeRow.get("status"));
                    mismatch.put("mirror_status", mirrorRow.get("status"));
                    amountMismatch.add(mismatch);
                }
                String nativeStatus = String.valueOf(nativeRow.get("status"));
                String mappedMirror = mapMirrorStatus(String.valueOf(mirrorRow.get("status")));
                if (!nativeStatus.equalsIgnoreCase(mappedMirror)) {
                    Map<String, Object> mismatch = new LinkedHashMap<>();
                    mismatch.put("external_id", entry.getKey());
                    mismatch.put("native_status", nativeStatus);
                    mismatch.put("mirror_status", mirrorRow.get("status"));
                    mismatch.put("mapped_mirror_status", mappedMirror);
                    statusMismatch.add(mismatch);
                }
            }
            for (Map.Entry<String, Map<String, Object>> entry : mirrorById.entrySet()) {
                if (!nativeById.containsKey(entry.getKey())) {
                    onlyMirror.add(entry.getValue());
                    if (isMirrorCompleted(entry.getValue().get("status"))) {
                        mirrorCompleted++;
                        mirrorSum = mirrorSum.add(decimalObject(entry.getValue().get("total_price")));
                        payloadSum = payloadSum.add(decimalObject(entry.getValue().get("payload_total")));
                    }
                }
            }
            Map<String, Object> entryOut = new LinkedHashMap<>();
            entryOut.put("outlet_id", outletId);
            entryOut.put("native_count", nativeRows.size());
            entryOut.put("mirror_count", mirrorRows.size());
            entryOut.put("native_completed", nativeCompleted);
            entryOut.put("mirror_completed", mirrorCompleted);
            entryOut.put("native_revenue", nativeSum);
            entryOut.put("mirror_revenue", mirrorSum);
            entryOut.put("payload_revenue", payloadSum);
            entryOut.put("only_native_count", onlyNative.size());
            entryOut.put("only_mirror_count", onlyMirror.size());
            entryOut.put("amount_mismatch_count", amountMismatch.size());
            entryOut.put("status_mismatch_count", statusMismatch.size());
            entryOut.put("only_native", onlyNative.stream().limit(20).toList());
            entryOut.put("only_mirror", onlyMirror.stream().limit(20).toList());
            entryOut.put("amount_mismatch", amountMismatch.stream().limit(30).toList());
            entryOut.put("status_mismatch", statusMismatch.stream().limit(20).toList());
            byStore.put(storeKey, entryOut);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("day", day);
        result.put("by_store", byStore);
        return ApiResult.ok(result);
    }

    private static boolean isMirrorCompleted(Object status) {
        if (status == null) return false;
        String value = String.valueOf(status).trim().toUpperCase(Locale.ROOT);
        return Set.of("COMPLETED", "CLOSED", "PAID", "FINALISED", "FINALIZED").contains(value);
    }

    private static String mapMirrorStatus(String raw) {
        if (raw == null || raw.isBlank()) return "UNKNOWN";
        return switch (raw.trim().toUpperCase(Locale.ROOT)) {
            case "COMPLETED", "CLOSED", "PAID", "FINALISED", "FINALIZED" -> "COMPLETED";
            case "INCOMPLETE" -> "INCOMPLETE";
            case "PARKED", "OPEN", "SAVED" -> "PARKED";
            case "VOIDED", "VOID", "CANCELLED", "CANCELED" -> "VOIDED";
            case "REFUNDED" -> "REFUNDED";
            default -> "UNKNOWN";
        };
    }

    private static BigDecimal decimalObject(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal bd) return bd;
        if (value instanceof Number number) return new BigDecimal(number.toString());
        try {
            return new BigDecimal(String.valueOf(value).trim());
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }

    /**
     * Void leftover native UAT rows that are not Shopfront imports
     * ({@code source_system IS NULL} with {@code invoice_id} matching {@code REF-%}
     * or {@code INV-%}). Keeps dashboard COMPLETED totals aligned with the
     * Shopfront sale ledger when Sell-pad test checkouts or refund probes remain.
     */
    @PostMapping("/sales:void-orphan-ref-refunds")
    public ApiResult<Map<String, Object>> voidOrphanRefRefunds(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestBody(required = false) JsonNode body) {
        authorize(supplied);
        String day = body == null ? "" : body.path("day").asText("").trim();
        if (!day.isBlank() && !day.matches("\\d{4}-\\d{2}-\\d{2}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "day must be YYYY-MM-DD");
        }
        ensureMappingTable();
        List<Map<String, Object>> mappings = jdbc.queryForList(
                "SELECT store_key, outlet_id, enabled FROM shopfront_store_mapping ORDER BY store_key");
        Map<String, Object> byStore = new LinkedHashMap<>();
        int total = 0;
        for (Map<String, Object> mapping : mappings) {
            if (!isEnabled(mapping.get("enabled"))) continue;
            String storeKey = String.valueOf(mapping.get("store_key"));
            long outletId = longValue(mapping.get("outlet_id"));
            List<Object> args = new ArrayList<>();
            StringBuilder sql = new StringBuilder("""
                    UPDATE sale
                    SET status = 'VOIDED', outstanding = 0, updated_at = CURRENT_TIMESTAMP
                    WHERE outlet_id = ?
                      AND status = 'COMPLETED'
                      AND source_system IS NULL
                      AND (invoice_id LIKE 'REF-%' OR invoice_id LIKE 'INV-%')
                    """);
            args.add(outletId);
            if (!day.isBlank()) {
                sql.append("""
                         AND COALESCE(business_date, DATE(local_sold_at), DATE(created_at)) = CAST(? AS date)
                        """);
                args.add(day);
            }
            int voided = jdbc.update(sql.toString(), args.toArray());
            total += voided;
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("outlet_id", outletId);
            entry.put("voided", voided);
            byStore.put(storeKey, entry);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("day", day.isBlank() ? null : day);
        result.put("voided", total);
        result.put("by_store", byStore);
        return ApiResult.ok(result);
    }

    @PostMapping("/sales:promote-native")
    public ApiResult<Map<String, Object>> promoteNativeSales(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestBody(required = false) JsonNode body) {
        authorize(supplied);
        ensureMappingTable();
        ensureSaleBusinessDatesReady();
        String requestedStore = body == null ? "" : body.path("store_key").asText("").trim();
        String afterExternalId = body == null ? "" : body.path("after_external_id").asText("").trim();
        String businessDay = body == null ? "" : body.path("business_day").asText("").trim();
        int limit = body == null ? 500 : body.path("limit").asInt(500);
        List<Map<String, Object>> mappings = jdbc.queryForList(
                "SELECT store_key, company_id, outlet_id, enabled FROM shopfront_store_mapping ORDER BY store_key");
        Map<String, Object> byStore = new LinkedHashMap<>();
        int stores = 0;
        boolean hasMore = false;
        for (Map<String, Object> mapping : mappings) {
            if (!isEnabled(mapping.get("enabled"))) {
                continue;
            }
            String storeKey = String.valueOf(mapping.get("store_key"));
            if (!requestedStore.isBlank() && !requestedStore.equals(storeKey)) {
                continue;
            }
            long outletId = longValue(mapping.get("outlet_id"));
            if (outletId <= 0) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Shopfront mapping has no numeric POS outlet_id for store " + storeKey);
            }
            Map<String, Object> batch = nativeSaleImporter.promoteFromMirror(
                    storeKey, outletId,
                    afterExternalId.isBlank() ? null : afterExternalId,
                    limit,
                    businessDay.isBlank() ? null : businessDay);
            byStore.put(storeKey, batch);
            hasMore = hasMore || Boolean.TRUE.equals(batch.get("has_more"));
            stores++;
        }
        if (stores == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    requestedStore.isBlank()
                            ? "No enabled Shopfront store mappings found"
                            : "No enabled Shopfront store mapping for " + requestedStore);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "PROMOTED");
        result.put("stores", stores);
        result.put("has_more", hasMore);
        result.put("by_store", byStore);
        return ApiResult.ok(result);
    }

    @PostMapping("/suppliers:upsert")
    @Transactional
    public ApiResult<Map<String, Object>> suppliers(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                     @RequestBody JsonNode body) {
        return stage(supplied, "suppliers", body);
    }

    @PostMapping("/customers:upsert")
    @Transactional
    public ApiResult<Map<String, Object>> customers(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                     @RequestBody JsonNode body) {
        return stage(supplied, "customers", body);
    }

    @PostMapping("/customer-payments:upsert-native")
    @Transactional
    public ApiResult<Map<String, Object>> customerPayments(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                           @RequestBody JsonNode body) {
        authorize(supplied);
        String storeKey = body.path("store_key").asText("").trim();
        JsonNode items = body.path("items");
        if (!STORE_KEY.matcher(storeKey).matches() || !items.isArray() || items.size() > 250) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valid store_key and up to 250 items are required");
        }
        ensureMappingTable();
        List<Map<String, Object>> mappings = jdbc.queryForList(
                "SELECT outlet_id FROM shopfront_store_mapping WHERE store_key=? AND enabled=?", storeKey,
                isPostgres() ? Boolean.TRUE : 1);
        if (mappings.size() != 1 || longValue(mappings.getFirst().get("outlet_id")) <= 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Enabled Shopfront outlet mapping was not found");
        }
        try {
            return ApiResult.ok(nativeCustomerImportService.importPayments(
                    storeKey, longValue(mappings.getFirst().get("outlet_id")), items));
        } catch (Exception ex) {
            log.error("Shopfront native customer payment import failed store={}", storeKey, ex);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Unable to import Shopfront customer payments", ex);
        }
    }

    @PostMapping("/purchase-orders:upsert")
    @Transactional
    public ApiResult<Map<String, Object>> purchaseOrders(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                          @RequestBody JsonNode body) {
        return stage(supplied, "purchase_orders", body);
    }

    /**
     * Promote durable {@code shopfront_purchase_order} mirror rows into Orithos
     * {@code purchase_order} / {@code order_product} for one store. Batched so
     * callers can loop without gateway timeouts. Requires business-write.
     */
    @PostMapping("/purchase-orders:promote-native")
    @Transactional
    public ApiResult<Map<String, Object>> promotePurchaseOrders(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestBody(required = false) JsonNode body) {
        authorize(supplied);
        if (!businessWriteEnabled) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Shopfront business write is disabled; enable SHOPFRONT_BUSINESS_WRITE_ENABLED before promoting purchase orders");
        }
        ensureMappingTable();
        ensureShadowTables();
        ensurePurchaseOrderBusinessMappingTable();
        String storeKey = body == null ? "" : body.path("store_key").asText("").trim();
        String afterSourceId = body == null ? "" : body.path("after_source_id").asText("").trim();
        int limit = body == null ? 100 : body.path("limit").asInt(100);
        // Default only_unmapped=true so daily/backfill loops skip already-mapped
        // rows (full line remapping is expensive and gateway-times out).
        boolean onlyUnmapped = body == null || body.path("only_unmapped").isMissingNode()
                || body.path("only_unmapped").isNull()
                || body.path("only_unmapped").asBoolean(true);
        boolean retrySkipped = body != null && body.path("retry_skipped").asBoolean(false);
        if (!STORE_KEY.matcher(storeKey).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Valid store_key is required");
        }
        if (limit < 1 || limit > 250) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 250");
        }
        List<Map<String, Object>> mappings = jdbc.queryForList(
                "SELECT store_key, company_id, outlet_id, enabled FROM shopfront_store_mapping WHERE store_key = ?",
                storeKey);
        if (mappings.isEmpty() || !isEnabled(mappings.getFirst().get("enabled"))) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "No enabled Shopfront store mapping for " + storeKey);
        }
        Map<String, Object> mapping = mappings.getFirst();
        long outletId = longValue(mapping.get("outlet_id"));
        if (outletId <= 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Shopfront mapping has no numeric POS outlet_id for store " + storeKey);
        }
        StringBuilder sql = new StringBuilder(
                "SELECT source_id, supplier_source_id, status, order_date, total_cost, raw_payload "
                        + "FROM shopfront_purchase_order po WHERE store_key = ?");
        List<Object> args = new ArrayList<>();
        args.add(storeKey);
        if (!afterSourceId.isBlank()) {
            sql.append(" AND source_id > ?");
            args.add(afterSourceId);
        }
        if (onlyUnmapped) {
            if (retrySkipped) {
                sql.append("""
                         AND NOT EXISTS (
                            SELECT 1 FROM shopfront_purchase_order_business_mapping m
                            WHERE m.store_key = po.store_key
                              AND m.source_id = po.source_id
                              AND m.outlet_id = ?
                              AND m.purchase_order_id > 0
                        )
                        """);
            } else {
                sql.append("""
                         AND NOT EXISTS (
                            SELECT 1 FROM shopfront_purchase_order_business_mapping m
                            WHERE m.store_key = po.store_key
                              AND m.source_id = po.source_id
                              AND m.outlet_id = ?
                        )
                        """);
            }
            args.add(outletId);
        }
        sql.append(" ORDER BY source_id ASC LIMIT ?");
        args.add(limit);
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        var items = objectMapper.createArrayNode();
        int rebuildFailures = 0;
        String lastSourceId = afterSourceId;
        for (Map<String, Object> row : rows) {
            String sourceId = stringValue(row.get("source_id"));
            lastSourceId = sourceId;
            try {
                items.add(rebuildPurchaseOrderNode(row));
            } catch (Exception ex) {
                rebuildFailures++;
                log.warn("Failed to rebuild mirror purchase order for promote store={} source={} message={}",
                        storeKey, sourceId, ex.getMessage());
            }
        }
        Map<String, Object> imported = importBusinessPurchaseOrders(storeKey, mapping, items);
        Integer mirrorTotal = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_purchase_order WHERE store_key = ?", Integer.class, storeKey);
        Integer mappedTotal = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_purchase_order_business_mapping WHERE store_key = ? AND outlet_id = ? AND purchase_order_id > 0",
                Integer.class, storeKey, outletId);
        Integer skippedMarked = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_purchase_order_business_mapping WHERE store_key = ? AND outlet_id = ? AND purchase_order_id = 0",
                Integer.class, storeKey, outletId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "PROMOTED");
        result.put("store_key", storeKey);
        result.put("outlet_id", outletId);
        result.put("only_unmapped", onlyUnmapped);
        result.put("retry_skipped", retrySkipped);
        result.put("mirror_batch", rows.size());
        result.put("rebuild_failures", rebuildFailures);
        result.put("batch_size", limit);
        result.put("last_source_id", lastSourceId);
        result.put("has_more", rows.size() >= limit);
        result.put("mirror_total", mirrorTotal == null ? 0 : mirrorTotal);
        result.put("purchase_orders_mapped", mappedTotal == null ? 0 : mappedTotal);
        result.put("purchase_orders_skipped_marked", skippedMarked == null ? 0 : skippedMarked);
        result.put("business", imported);
        result.put("business_write", true);
        return ApiResult.ok(result);
    }

    /**
     * Copy sale money fields (and status/payload) from one mirror store_key to another
     * for a single Adelaide business day. Used to repair stale Demo mirror rows without
     * a full {@code mirror:copy} (which can gateway-timeout).
     */
    @PostMapping("/mirror:sync-sale-money")
    @Transactional
    public ApiResult<Map<String, Object>> syncMirrorSaleMoney(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestBody JsonNode body) {
        authorize(supplied);
        String source = body.path("source_store_key").asText("").trim();
        String target = body.path("target_store_key").asText("").trim();
        String day = body.path("business_day").asText("").trim();
        if (!STORE_KEY.matcher(source).matches() || !STORE_KEY.matcher(target).matches() || source.equals(target)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Distinct valid source_store_key and target_store_key are required");
        }
        if (!day.matches("\\d{4}-\\d{2}-\\d{2}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "business_day must be YYYY-MM-DD");
        }
        ensureMappingTable();
        ensureSaleBusinessDatesReady();
        int mirrorUpdated = jdbc.update("""
                UPDATE shopfront_sale AS tgt
                SET total_price = src.total_price,
                    total_tax = src.total_tax,
                    total_discount = src.total_discount,
                    total_cost = src.total_cost,
                    status = src.status,
                    raw_payload = src.raw_payload,
                    synced_at = CURRENT_TIMESTAMP
                FROM shopfront_sale AS src
                WHERE src.store_key = ?
                  AND tgt.store_key = ?
                  AND src.external_id = tgt.external_id
                  AND src.business_date = CAST(? AS date)
                  AND tgt.business_date = CAST(? AS date)
                """, source, target, day, day);
        Long targetOutlet = null;
        try {
            targetOutlet = jdbc.queryForObject(
                    "SELECT outlet_id::bigint FROM shopfront_store_mapping WHERE store_key = ? LIMIT 1",
                    Long.class, target);
        } catch (Exception ignored) {
            // mapping may store non-numeric outlet ids on fresh installs
        }
        int nativeUpdated = 0;
        if (targetOutlet != null && targetOutlet > 0) {
            nativeUpdated = jdbc.update("""
                    UPDATE sale s
                    SET total_price = m.total_price,
                        total_tax = m.total_tax,
                        total_discount = COALESCE(m.total_discount, 0),
                        total_cost = m.total_cost,
                        status = CASE
                            WHEN UPPER(COALESCE(m.status, '')) = 'INCOMPLETE' THEN 'INCOMPLETE'
                            WHEN UPPER(COALESCE(m.status, '')) IN ('PARKED', 'OPEN', 'SAVED') THEN 'PARKED'
                            WHEN UPPER(COALESCE(m.status, '')) IN ('VOIDED', 'VOID', 'CANCELLED', 'CANCELED') THEN 'VOIDED'
                            WHEN UPPER(COALESCE(m.status, '')) = 'REFUNDED' THEN 'REFUNDED'
                            WHEN UPPER(COALESCE(m.status, '')) IN ('COMPLETED', 'CLOSED', 'PAID', 'FINALISED', 'FINALIZED') THEN 'COMPLETED'
                            ELSE s.status
                        END,
                        updated_at = CURRENT_TIMESTAMP
                    FROM shopfront_sale m
                    WHERE s.outlet_id = ?
                      AND s.source_system = 'shopfront'
                      AND s.external_id = m.external_id
                      AND m.store_key = ?
                      AND m.business_date = CAST(? AS date)
                      AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) = CAST(? AS date)
                    """, targetOutlet, target, day, day);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("source_store_key", source);
        result.put("target_store_key", target);
        result.put("business_day", day);
        result.put("mirror_rows_updated", mirrorUpdated);
        result.put("native_rows_updated", nativeUpdated);
        result.put("target_outlet_id", targetOutlet);
        result.put("business_write", true);
        return ApiResult.ok(result);
    }

    @PostMapping("/mirror:copy")
    @Transactional
    public ApiResult<Map<String, Object>> copyShopfrontMirror(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestBody JsonNode body) {
        authorize(supplied);
        String source = body.path("source_store_key").asText("").trim();
        String target = body.path("target_store_key").asText("").trim();
        if (!STORE_KEY.matcher(source).matches() || !STORE_KEY.matcher(target).matches() || source.equals(target)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Distinct valid source_store_key and target_store_key are required");
        }
        if (!isPostgres()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Mirror copy requires PostgreSQL transactional table locks");
        }

        ensureMappingTable();
        ensureShadowTables();
        List<Map<String, Object>> mappings = jdbc.queryForList(
                "SELECT store_key, outlet_id, enabled FROM shopfront_store_mapping WHERE store_key IN (?, ?)", source, target);
        Map<String, Map<String, Object>> byStore = new HashMap<>();
        for (Map<String, Object> mapping : mappings) {
            byStore.put(String.valueOf(mapping.get("store_key")), mapping);
        }
        Map<String, Object> sourceMapping = byStore.get(source);
        Map<String, Object> targetMapping = byStore.get(target);
        if (sourceMapping == null || targetMapping == null
                || !isEnabled(sourceMapping.get("enabled")) || !isEnabled(targetMapping.get("enabled"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Both source and target must have enabled Shopfront store mappings");
        }
        if (String.valueOf(sourceMapping.get("outlet_id")).equals(String.valueOf(targetMapping.get("outlet_id")))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Source and target must map to different POS outlets");
        }

        jdbc.update("LOCK TABLE shopfront_sale_payment, shopfront_sale_item, shopfront_sale, shopfront_inventory, "
                + "shopfront_product, shopfront_supplier, shopfront_customer, shopfront_purchase_order, "
                + "shopfront_extended_record IN SHARE ROW EXCLUSIVE MODE");

        Map<String, Integer> counts = new LinkedHashMap<>();
        for (ShopfrontMirrorTable table : MIRROR_TABLES) {
            int sourceCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM " + table.name() + " WHERE store_key = ?", Integer.class, source);
            counts.put(table.name(), sourceCount);
        }
        for (ShopfrontMirrorTable table : List.of(
                MIRROR_TABLES.get(4), MIRROR_TABLES.get(3), MIRROR_TABLES.get(2),
                MIRROR_TABLES.get(1), MIRROR_TABLES.get(0), MIRROR_TABLES.get(5),
                MIRROR_TABLES.get(6), MIRROR_TABLES.get(7), MIRROR_TABLES.get(8))) {
            jdbc.update("DELETE FROM " + table.name() + " WHERE store_key = ?", target);
        }
        for (ShopfrontMirrorTable table : MIRROR_TABLES) {
            jdbc.update("INSERT INTO " + table.name() + " (store_key," + table.columns() + ") "
                    + "SELECT ?," + table.columns() + " FROM " + table.name() + " WHERE store_key = ?", target, source);
            int targetCount = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM " + table.name() + " WHERE store_key = ?", Integer.class, target);
            if (targetCount != counts.get(table.name())) {
                throw new IllegalStateException("Shopfront mirror copy count mismatch for " + table.name());
            }
        }

        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_mirror_run (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, "
                + "source_store_key VARCHAR(64) NOT NULL, target_store_key VARCHAR(64) NOT NULL, "
                + "record_counts TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
        String serializedCounts;
        try {
            serializedCounts = objectMapper.writeValueAsString(counts);
        } catch (Exception e) {
            throw new IllegalStateException("Shopfront mirror counts could not be serialized", e);
        }
        Long auditId = jdbc.queryForObject("INSERT INTO shopfront_mirror_run "
                + "(source_store_key,target_store_key,record_counts) VALUES (?,?,?) RETURNING id",
                Long.class, source, target, serializedCounts);
        log.info("Shopfront staging mirror copied: source={}, target={}, counts={}", source, target, counts);
        return ApiResult.ok(Map.of("source_store_key", source, "target_store_key", target,
                "record_counts", counts, "audit_id", auditId, "business_write", false));
    }

    @PostMapping("/extended:upsert")
    @Transactional
    public ApiResult<Map<String, Object>> extendedRecords(@RequestHeader("X-Shopfront-Integration-Token") String supplied,
                                                           @RequestBody JsonNode body) {
        authorize(supplied);
        String store = body.path("store_key").asText("").trim();
        String entityType = body.path("entity_type").asText("").trim();
        JsonNode items = body.path("items");
        if (store.isBlank() || !entityType.matches("[a-z][a-z0-9_]{0,63}") || !items.isArray() || items.size() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "store_key, entity_type and up to 200 items are required");
        }
        try {
            ensureShadowTables();
            boolean postgres = isPostgres();
            String sql = postgres
                    ? "INSERT INTO shopfront_extended_record (store_key,entity_type,source_id,raw_payload) VALUES (?,?,?,?) ON CONFLICT (store_key,entity_type,source_id) DO UPDATE SET raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                    : "INSERT INTO shopfront_extended_record (store_key,entity_type,source_id,raw_payload) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
            int accepted = 0;
            for (JsonNode item : items) {
                String sourceId = text(item, "source_id");
                if (sourceId == null || sourceId.isBlank() || sourceId.length() > 192) continue;
                JsonNode raw = item.path("raw_payload").isMissingNode() ? item : item.path("raw_payload");
                jdbc.update(sql, store, entityType, sourceId, objectMapper.writeValueAsString(raw));
                accepted++;
            }
            return ApiResult.ok(Map.of("status", "STAGED", "entity_type", entityType, "item_count", accepted, "business_write", false));
        } catch (Exception e) {
            log.error("Shopfront extended staging failed: entity_type={}, store={}, message={}", entityType, store, e.getMessage(), e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Unable to stage Shopfront extended records", e);
        }
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
        result.put("customers", count("shopfront_customer", storeKey));
        result.put("purchase_orders", count("shopfront_purchase_order", storeKey));
        result.put("extended_records", count("shopfront_extended_record", storeKey));
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
            case "customers" -> "shopfront_customer";
            case "purchase_orders" -> "shopfront_purchase_order";
            case "extended_records" -> "shopfront_extended_record";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown Shopfront data type");
        };
        String orderBy = switch (type) {
            case "products", "suppliers", "customers", "purchase_orders" -> "source_id ASC";
            case "inventory" -> "source_product_id ASC, outlet_id ASC";
            case "sales" -> "external_id ASC";
            case "sale_items" -> "external_sale_id ASC, line_key ASC";
            case "payments" -> "external_sale_id ASC, payment_key ASC";
            case "extended_records" -> "entity_type ASC, source_id ASC";
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
        Map<String, Object> productStats = jdbc.queryForMap("""
                SELECT COUNT(*) AS products,
                       COALESCE(SUM(CASE WHEN sp.name IS NULL OR TRIM(sp.name) = '' THEN 1 ELSE 0 END), 0) AS products_missing_name,
                       COALESCE(SUM(CASE WHEN sp.barcode IS NOT NULL AND EXISTS (
                           SELECT 1 FROM product_barcode pb WHERE pb.code = sp.barcode
                       ) THEN 1 ELSE 0 END), 0) AS barcode_matched,
                       COALESCE(SUM(CASE WHEN sp.barcode IS NULL OR NOT EXISTS (
                           SELECT 1 FROM product_barcode pb WHERE pb.code = sp.barcode
                       ) THEN 1 ELSE 0 END), 0) AS barcode_unmatched,
                       (SELECT COUNT(*) FROM shopfront_product_mapping pm
                        WHERE pm.store_key = ? AND pm.status = 'MAPPED') AS manually_mapped,
                       COALESCE(SUM(CASE WHEN NOT EXISTS (
                           SELECT 1 FROM shopfront_product_mapping pm
                           WHERE pm.store_key = sp.store_key
                             AND pm.source_product_id = sp.source_id
                             AND pm.status = 'MAPPED'
                       ) THEN 1 ELSE 0 END), 0) AS products_unmapped
                FROM shopfront_product sp
                WHERE sp.store_key = ?
                """, storeKey, storeKey);
        result.put("products", statisticCount(productStats, "products"));
        result.put("products_missing_name", statisticCount(productStats, "products_missing_name"));
        result.put("barcode_matched", statisticCount(productStats, "barcode_matched"));
        result.put("barcode_unmatched", statisticCount(productStats, "barcode_unmatched"));
        result.put("manually_mapped", statisticCount(productStats, "manually_mapped"));
        result.put("products_unmapped", statisticCount(productStats, "products_unmapped"));
        result.put("sales_with_unmatched_items", jdbc.queryForObject("""
                WITH unmatched_products AS (
                    SELECT sp.source_id
                    FROM shopfront_product sp
                    WHERE sp.store_key = ?
                      AND NOT EXISTS (
                          SELECT 1 FROM shopfront_product_mapping pm
                          WHERE pm.store_key = sp.store_key
                            AND pm.source_product_id = sp.source_id
                            AND pm.status = 'MAPPED'
                      )
                      AND (sp.barcode IS NULL OR NOT EXISTS (
                          SELECT 1 FROM product_barcode pb WHERE pb.code = sp.barcode
                      ))
                ), unmatched_sales AS (
                    SELECT DISTINCT si.external_sale_id
                    FROM shopfront_sale_item si
                    JOIN unmatched_products up ON up.source_id = si.source_product_id
                    WHERE si.store_key = ?
                    UNION
                    SELECT DISTINCT si.external_sale_id
                    FROM shopfront_sale_item si
                    WHERE si.store_key = ?
                      AND (si.source_product_id IS NULL OR TRIM(si.source_product_id) = '')
                )
                SELECT COUNT(*)
                FROM unmatched_sales us
                JOIN shopfront_sale ss
                  ON ss.store_key = ? AND ss.external_id = us.external_sale_id
                """, Integer.class, storeKey, storeKey, storeKey, storeKey));
        Map<String, Object> saleItemStats = jdbc.queryForMap("""
                SELECT COALESCE(SUM(CASE WHEN product_name IS NULL OR TRIM(product_name) = '' THEN 1 ELSE 0 END), 0) AS sale_items_missing_name,
                       COALESCE(SUM(CASE WHEN source_product_id IS NULL OR TRIM(source_product_id) = '' THEN 1 ELSE 0 END), 0) AS sale_items_missing_source_product
                FROM shopfront_sale_item
                WHERE store_key = ?
                """, storeKey);
        result.put("sale_items_missing_name", statisticCount(saleItemStats, "sale_items_missing_name"));
        result.put("sale_items_missing_source_product", statisticCount(saleItemStats, "sale_items_missing_source_product"));
        result.put("inventory_outlets", jdbc.queryForObject(
                "SELECT COUNT(DISTINCT outlet_id) FROM shopfront_inventory WHERE store_key = ?",
                Integer.class, storeKey));
        return ApiResult.ok(result);
    }

    private static int statisticCount(Map<String, Object> statistics, String name) {
        Object value = statistics.get(name);
        if (!(value instanceof Number count)) {
            throw new IllegalStateException("Missing numeric Shopfront match statistic: " + name);
        }
        return count.intValue();
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

    /**
     * Clone missing {@code shopfront_product_mapping} rows from one enabled store
     * onto another by matching barcodes on the target outlet. Used to repair
     * Demo/SKR dual-tenant drift without rewriting catalogue rows.
     *
     * <p>Cloudflare/proxy timeouts kill the historical all-at-once SQL, so callers
     * should pass {@code phase} ({@code target_barcodes}, {@code source_mappings},
     * {@code source_barcodes}) and {@code limit} (default 1500) and loop until
     * {@code more=false} for each phase.
     */
    @PostMapping("/product-mappings:clone")
    public ApiResult<Map<String, Object>> cloneProductMappings(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestBody JsonNode body) {
        authorize(supplied);
        ensureMappingTable();
        ensureShadowTables();
        String source = body.path("source_store_key").asText("").trim();
        String target = body.path("target_store_key").asText("").trim();
        if (!STORE_KEY.matcher(source).matches() || !STORE_KEY.matcher(target).matches() || source.equals(target)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Distinct valid source_store_key and target_store_key are required");
        }
        String phase = body.path("phase").asText("target_barcodes").trim().toLowerCase(Locale.ROOT);
        if (!Set.of("target_barcodes", "source_mappings", "source_barcodes").contains(phase)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "phase must be target_barcodes, source_mappings, or source_barcodes");
        }
        int limit = body.path("limit").asInt(1500);
        if (limit < 1 || limit > 5000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 5000");
        }
        List<Map<String, Object>> mappings = jdbc.queryForList(
                "SELECT store_key, outlet_id, enabled FROM shopfront_store_mapping WHERE store_key IN (?, ?)",
                source, target);
        Map<String, Map<String, Object>> byStore = new HashMap<>();
        for (Map<String, Object> mapping : mappings) {
            byStore.put(String.valueOf(mapping.get("store_key")), mapping);
        }
        Map<String, Object> sourceMapping = byStore.get(source);
        Map<String, Object> targetMapping = byStore.get(target);
        if (sourceMapping == null || targetMapping == null
                || !isEnabled(sourceMapping.get("enabled")) || !isEnabled(targetMapping.get("enabled"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Both source and target must have enabled Shopfront store mappings");
        }
        long targetOutletId = longValue(targetMapping.get("outlet_id"));
        if (targetOutletId <= 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Target Shopfront mapping has no numeric POS outlet_id");
        }
        int inserted = switch (phase) {
            case "source_mappings" -> cloneSourceMappingsBatch(source, target, targetOutletId, limit);
            case "source_barcodes" -> cloneSourceBarcodesBatch(source, target, targetOutletId, limit);
            default -> cloneTargetBarcodesBatch(target, targetOutletId, limit);
        };
        Integer sourceCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_product_mapping WHERE store_key = ? AND status = 'MAPPED'",
                Integer.class, source);
        Integer targetCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_product_mapping WHERE store_key = ? AND status = 'MAPPED'",
                Integer.class, target);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "CLONED");
        result.put("phase", phase);
        result.put("limit", limit);
        result.put("inserted", inserted);
        result.put("more", inserted >= limit);
        result.put("source_store_key", source);
        result.put("target_store_key", target);
        result.put("target_outlet_id", targetOutletId);
        result.put("cloned_from_source_mappings", "source_mappings".equals(phase) ? inserted : 0);
        result.put("mapped_from_target_barcodes", "target_barcodes".equals(phase) ? inserted : 0);
        result.put("mapped_from_source_barcodes", "source_barcodes".equals(phase) ? inserted : 0);
        result.put("source_mapped_count", sourceCount == null ? 0 : sourceCount);
        result.put("target_mapped_count", targetCount == null ? 0 : targetCount);
        return ApiResult.ok(result);
    }

    @GetMapping("/mapping-counts")
    public ApiResult<Map<String, Object>> mappingCounts(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestParam String storeKey) {
        authorize(supplied);
        ensureMappingTable();
        ensureShadowTables();
        ensurePurchaseOrderBusinessMappingTable();
        if (!STORE_KEY.matcher(storeKey).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid storeKey");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("store_key", storeKey);
        result.put("products", count("shopfront_product", storeKey));
        Integer mapped = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_product_mapping WHERE store_key = ? AND status = 'MAPPED'",
                Integer.class, storeKey);
        result.put("products_mapped", mapped == null ? 0 : mapped);
        Integer unmapped = jdbc.queryForObject("""
                SELECT COUNT(*) FROM shopfront_product sp
                WHERE sp.store_key = ?
                  AND NOT EXISTS (
                    SELECT 1 FROM shopfront_product_mapping pm
                    WHERE pm.store_key = sp.store_key
                      AND pm.source_product_id = sp.source_id
                      AND pm.status = 'MAPPED'
                  )
                """, Integer.class, storeKey);
        result.put("products_unmapped", unmapped == null ? 0 : unmapped);
        Integer suppliersMapped = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_supplier_business_mapping WHERE store_key = ?",
                Integer.class, storeKey);
        result.put("suppliers_mapped", suppliersMapped == null ? 0 : suppliersMapped);
        Integer ordersMapped = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_purchase_order_business_mapping WHERE store_key = ?",
                Integer.class, storeKey);
        result.put("purchase_orders_mapped", ordersMapped == null ? 0 : ordersMapped);
        return ApiResult.ok(result);
    }

    private int cloneTargetBarcodesBatch(String target, long targetOutletId, int limit) {
        return jdbc.update("""
                INSERT INTO shopfront_product_mapping (store_key, source_product_id, pos_product_id, match_type, status)
                SELECT ?, source_id, pos_product_id, 'BARCODE', 'MAPPED'
                FROM (
                    SELECT DISTINCT ON (sp.source_id)
                           sp.source_id,
                           pb.product_id AS pos_product_id
                    FROM shopfront_product sp
                    JOIN product_barcode pb ON pb.code = sp.barcode AND pb.outlet_id = ?
                    JOIN product p ON p.id = pb.product_id AND p.outlet_id = ? AND p.deleted_at IS NULL
                    WHERE sp.store_key = ?
                      AND sp.barcode IS NOT NULL
                      AND TRIM(sp.barcode) <> ''
                      AND NOT EXISTS (
                          SELECT 1 FROM shopfront_product_mapping existing
                          WHERE existing.store_key = ?
                            AND existing.source_product_id = sp.source_id
                            AND existing.status = 'MAPPED'
                      )
                    ORDER BY sp.source_id, pb.product_id
                    LIMIT ?
                ) resolved
                ON CONFLICT (store_key, source_product_id) DO UPDATE
                SET pos_product_id = EXCLUDED.pos_product_id,
                    match_type = 'BARCODE',
                    status = 'MAPPED',
                    updated_at = CURRENT_TIMESTAMP
                """, target, targetOutletId, targetOutletId, target, target, limit);
    }

    private int cloneSourceMappingsBatch(String source, String target, long targetOutletId, int limit) {
        // DISTINCT ON avoids "ON CONFLICT cannot affect row a second time" when a
        // source product has multiple barcodes that all resolve on the target outlet.
        return jdbc.update("""
                INSERT INTO shopfront_product_mapping (store_key, source_product_id, pos_product_id, match_type, status)
                SELECT ?, source_product_id, pos_product_id, 'CLONE', 'MAPPED'
                FROM (
                    SELECT DISTINCT ON (m.source_product_id)
                           m.source_product_id,
                           pb_target.product_id AS pos_product_id
                    FROM shopfront_product_mapping m
                    JOIN product_barcode pb_source ON pb_source.product_id = m.pos_product_id
                    JOIN product p_source ON p_source.id = pb_source.product_id AND p_source.deleted_at IS NULL
                    JOIN product_barcode pb_target ON pb_target.code = pb_source.code AND pb_target.outlet_id = ?
                    JOIN product p_target ON p_target.id = pb_target.product_id
                        AND p_target.outlet_id = ?
                        AND p_target.deleted_at IS NULL
                    WHERE m.store_key = ?
                      AND m.status = 'MAPPED'
                      AND NOT EXISTS (
                          SELECT 1 FROM shopfront_product_mapping existing
                          WHERE existing.store_key = ?
                            AND existing.source_product_id = m.source_product_id
                            AND existing.status = 'MAPPED'
                      )
                    ORDER BY m.source_product_id, pb_target.product_id
                    LIMIT ?
                ) resolved
                ON CONFLICT (store_key, source_product_id) DO UPDATE
                SET pos_product_id = EXCLUDED.pos_product_id,
                    match_type = 'CLONE',
                    status = 'MAPPED',
                    updated_at = CURRENT_TIMESTAMP
                """, target, targetOutletId, targetOutletId, source, target, limit);
    }

    private int cloneSourceBarcodesBatch(String source, String target, long targetOutletId, int limit) {
        // Shared Shopfront catalog: use the source-store shadow barcode (same
        // source_id) when the target POS product already carries that code.
        return jdbc.update("""
                INSERT INTO shopfront_product_mapping (store_key, source_product_id, pos_product_id, match_type, status)
                SELECT ?, source_product_id, pos_product_id, 'CLONE_SOURCE_BARCODE', 'MAPPED'
                FROM (
                    SELECT DISTINCT ON (m.source_product_id)
                           m.source_product_id,
                           pb_target.product_id AS pos_product_id
                    FROM shopfront_product_mapping m
                    JOIN shopfront_product sp ON sp.store_key = ? AND sp.source_id = m.source_product_id
                    JOIN product_barcode pb_target ON pb_target.code = sp.barcode AND pb_target.outlet_id = ?
                    JOIN product p_target ON p_target.id = pb_target.product_id
                        AND p_target.outlet_id = ?
                        AND p_target.deleted_at IS NULL
                    WHERE m.store_key = ?
                      AND m.status = 'MAPPED'
                      AND sp.barcode IS NOT NULL
                      AND TRIM(sp.barcode) <> ''
                      AND NOT EXISTS (
                          SELECT 1 FROM shopfront_product_mapping existing
                          WHERE existing.store_key = ?
                            AND existing.source_product_id = m.source_product_id
                            AND existing.status = 'MAPPED'
                      )
                    ORDER BY m.source_product_id, pb_target.product_id
                    LIMIT ?
                ) resolved
                ON CONFLICT (store_key, source_product_id) DO UPDATE
                SET pos_product_id = EXCLUDED.pos_product_id,
                    match_type = 'CLONE_SOURCE_BARCODE',
                    status = 'MAPPED',
                    updated_at = CURRENT_TIMESTAMP
                """, target, source, targetOutletId, targetOutletId, source, target, limit);
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
            boolean businessWriteForType = businessWriteEnabled && Set.of("products", "inventory", "suppliers", "purchase_orders").contains(type);
            boolean postgres = isPostgres();
            jdbc.update(postgres
                    ? "CREATE TABLE IF NOT EXISTS shopfront_import_run (id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, store_key VARCHAR(64) NOT NULL, import_type VARCHAR(32) NOT NULL, status VARCHAR(32) NOT NULL, item_count INT NOT NULL, payload_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
                    : "CREATE TABLE IF NOT EXISTS shopfront_import_run (id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, store_key VARCHAR(64) NOT NULL, import_type VARCHAR(32) NOT NULL, status VARCHAR(32) NOT NULL, item_count INT NOT NULL, payload_json LONGTEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)");
            // Full inventory replaces can be 10k+ rows. Persist a compact audit
            // envelope instead of the entire source payload so staging cannot
            // OOM/timeout the request before shadow/business writes finish.
            boolean completeInventorySnapshot = "inventory".equals(type)
                    && body.path("replace").asBoolean(false)
                    && body.path("snapshot_complete").asBoolean(false);
            var audit = objectMapper.createObjectNode();
            audit.put("store_key", store);
            audit.put("type", type);
            audit.put("item_count", items.size());
            audit.put("replace", body.path("replace").asBoolean(false));
            audit.put("snapshot_complete", body.path("snapshot_complete").asBoolean(false));
            if (!completeInventorySnapshot && items.size() <= 200) {
                audit.set("items", items);
            }
            var json = objectMapper.writeValueAsString(audit);
            String status = mappingReady ? "STAGED" : "BLOCKED_MAPPING";
            Map<String, Object> business = Map.of("enabled", false, "created", 0, "updated", 0, "skipped", 0);
            Map<String, Object> nativeLedger = Map.of("enabled", false, "created", 0, "updated", 0, "skipped", 0);
            if (mappingReady) {
                ensureShadowTables();
                persistShadow(type, store, mappingRows.get(0), items, completeInventorySnapshot);
                if (businessWriteForType) {
                    if ("purchase_orders".equals(type)) {
                        business = importBusinessPurchaseOrders(store, mappingRows.get(0), items);
                        nativeLedger = business;
                    } else {
                        business = importBusiness(type, store, mappingRows.get(0), items, completeInventorySnapshot);
                        if ("suppliers".equals(type)) {
                            nativeLedger = business;
                        }
                    }
                }
                if ("sales".equals(type)) {
                    long outletId = longValue(mappingRows.get(0).get("outlet_id"));
                    if (outletId <= 0) {
                        throw new IllegalArgumentException("Shopfront mapping has no numeric POS outlet_id");
                    }
                    Map<String, Object> upserted = nativeSaleImporter.upsertSales(store, outletId, items);
                    Map<String, Object> nativeResult = new LinkedHashMap<>(upserted);
                    nativeResult.put("enabled", true);
                    nativeLedger = nativeResult;
                } else if ("customers".equals(type)) {
                    long outletId = longValue(mappingRows.get(0).get("outlet_id"));
                    if (outletId <= 0) {
                        throw new IllegalArgumentException("Shopfront mapping has no numeric POS outlet_id");
                    }
                    nativeLedger = nativeCustomerImportService.importCustomers(store, outletId, items);
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
            result.put("business_write", businessWriteForType && mappingReady);
            result.put("shadow_write", mappingReady);
            result.put("native_ledger", nativeLedger);
            result.put("business", business);
            return ApiResult.ok(result);
        } catch (Exception e) {
            if (e instanceof ResponseStatusException responseStatusException) throw responseStatusException;
            if (e instanceof IllegalArgumentException) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, e.getMessage());
            }
            Throwable root = e;
            while (root.getCause() != null && root.getCause() != root) root = root.getCause();
            String sqlState = root instanceof java.sql.SQLException sql ? sql.getSQLState() : "";
            log.error("SHOPFRONT_STAGING_DIAG type={} store={} exception={} sqlState={} message={}", type, store,
                    root.getClass().getSimpleName(), sqlState, root.getMessage());
            log.error("Shopfront staging failed: type={}, store={}, message={}", type, store, e.getMessage(), e);
            // Keep the client message free of raw DB text (passwords, connection URLs).
            String safeDetail = root.getClass().getSimpleName()
                    + (sqlState == null || sqlState.isBlank() ? "" : (" sqlState=" + sqlState));
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Unable to stage Shopfront import (" + type + "): " + safeDetail, e);
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
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_sale (store_key VARCHAR(64) NOT NULL, external_id " + key + " NOT NULL, invoice_id VARCHAR(128), status VARCHAR(64), created_at VARCHAR(64), updated_at VARCHAR(64), business_date DATE, total_price DECIMAL(18,4), total_tax DECIMAL(18,4), total_discount DECIMAL(18,4), total_cost DECIMAL(18,4), customer_reference VARCHAR(255), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, external_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_sale_item (store_key VARCHAR(64) NOT NULL, external_sale_id " + key + " NOT NULL, line_key VARCHAR(64) NOT NULL, source_product_id " + key + ", product_name VARCHAR(255), quantity DECIMAL(18,4), unit_price DECIMAL(18,4), line_total DECIMAL(18,4), cost DECIMAL(18,4), tax DECIMAL(18,4), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, external_sale_id, line_key))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_sale_payment (store_key VARCHAR(64) NOT NULL, external_sale_id " + key + " NOT NULL, payment_key VARCHAR(64) NOT NULL, amount DECIMAL(18,4), status VARCHAR(64), subtype VARCHAR(128), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, external_sale_id, payment_key))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_supplier (store_key VARCHAR(64) NOT NULL, source_id " + key + " NOT NULL, name VARCHAR(255), business_number VARCHAR(128), status VARCHAR(64), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_supplier_business_mapping (store_key VARCHAR(64) NOT NULL, source_id " + key + " NOT NULL, outlet_id BIGINT NOT NULL, supplier_id BIGINT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id, outlet_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_customer (store_key VARCHAR(64) NOT NULL, source_id " + key + " NOT NULL, client_id VARCHAR(255), code VARCHAR(128), name VARCHAR(255), email VARCHAR(255), phone VARCHAR(128), mobile VARCHAR(128), deleted BOOLEAN, raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_purchase_order (store_key VARCHAR(64) NOT NULL, source_id " + key + " NOT NULL, supplier_source_id " + key + ", status VARCHAR(64), order_date VARCHAR(64), total_cost DECIMAL(18,4), raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_extended_record (store_key VARCHAR(64) NOT NULL, entity_type VARCHAR(64) NOT NULL, source_id VARCHAR(192) NOT NULL, raw_payload TEXT NOT NULL, synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, entity_type, source_id))");
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_product_mapping (store_key VARCHAR(64) NOT NULL, source_product_id " + key + " NOT NULL, pos_product_id BIGINT NOT NULL, match_type VARCHAR(32) NOT NULL, status VARCHAR(32) NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (store_key, source_product_id))");
        if (!postgres) {
            try {
                jdbc.update("ALTER TABLE shopfront_sale ADD COLUMN business_date DATE NULL");
            } catch (Exception ignored) {
                // Column already present on MySQL reference schemas.
            }
        }
    }

    /**
     * Backfill Adelaide {@code business_date} in bounded batches so day-scoped
     * promote/totals stay on the indexed column without gateway-timing out the
     * first request after deploy.
     */
    private int backfillSaleBusinessDates(int maxRows) {
        if (!isPostgres() || maxRows <= 0) {
            return 0;
        }
        int limit = Math.min(maxRows, 5000);
        return jdbc.update("""
                UPDATE shopfront_sale AS target
                SET business_date = src.computed_date
                FROM (
                  SELECT store_key, external_id,
                         CASE
                           WHEN NULLIF(created_at, '') ~* '([zZ]|[+-][0-9]{2}:?[0-9]{2})$'
                             THEN (timezone('Australia/Adelaide', created_at::timestamptz))::date
                           WHEN NULLIF(TRIM(created_at), '') IS NOT NULL
                             THEN DATE(created_at::timestamp)
                           ELSE NULL
                         END AS computed_date
                  FROM shopfront_sale
                  WHERE business_date IS NULL
                    AND created_at IS NOT NULL
                    AND TRIM(created_at) <> ''
                  ORDER BY store_key, external_id
                  LIMIT ?
                ) AS src
                WHERE target.store_key = src.store_key
                  AND target.external_id = src.external_id
                """, limit);
    }

    private void ensureSaleBusinessDatesReady() {
        ensureShadowTables();
        // A few bounded passes cover historical mirrors without blocking the
        // request the way a single full-table UPDATE did on first deploy.
        for (int i = 0; i < 8; i++) {
            if (backfillSaleBusinessDates(5000) <= 0) {
                break;
            }
        }
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
        if ("suppliers".equals(type)) {
            return importBusinessSuppliers(store, outletId, mapping.get("company_id"), items);
        }
        Map<String, Long> taxRates = new LinkedHashMap<>();
        List<String> errors = new ArrayList<>();
        int created = 0;
        int updated = 0;
        int skipped = 0;
        if ("products".equals(type)) {
            com.fasterxml.jackson.databind.node.ArrayNode eligible = objectMapper.createArrayNode();
            for (JsonNode item : items) {
                try {
                    validateProductBusinessFields(item, outletId, taxRates);
                    eligible.add(item);
                } catch (IllegalArgumentException ex) {
                    skipped++;
                    if (errors.size() < 25) errors.add(ex.getMessage());
                }
            }
            if (!eligible.isEmpty()) {
                BusinessImportPlan plan = resolveBusinessProductIds(store, outletId, eligible);
                Set<String> rejected = collectProductAliasConflicts(eligible, store, plan.productIds(), errors);
                com.fasterxml.jackson.databind.node.ArrayNode importable = objectMapper.createArrayNode();
                for (JsonNode item : eligible) {
                    String sourceId = text(item, "source_id");
                    if (rejected.contains(sourceId)) {
                        skipped++;
                        continue;
                    }
                    importable.add(item);
                }
                if (!importable.isEmpty()) {
                    plan = resolveBusinessProductIds(store, outletId, importable);
                }
                ProductImportBatch batch = new ProductImportBatch();
                for (JsonNode item : importable) {
                    String sourceId = text(item, "source_id");
                    try {
                        Long resolvedProductId = plan.productIds().get(sourceId);
                        String identity = productIdentityKey(item);
                        if (resolvedProductId == null) {
                            resolvedProductId = batch.productIdsByIdentity.get(identity);
                        }
                        boolean mappingExisted = plan.existingProductMappings().contains(sourceId);
                        boolean productExisted = mappingExisted || resolvedProductId != null;
                        long productId = upsertBusinessProduct(item, outletId, taxRates, resolvedProductId, batch);
                        batch.productIdsByIdentity.putIfAbsent(identity, productId);
                        if (!mappingExisted) {
                            batch.sourceMappings.put(sourceId, new Object[]{store, sourceId, productId});
                        }
                        if (productExisted) updated++; else created++;
                    } catch (IllegalArgumentException ex) {
                        skipped++;
                        if (errors.size() < 25) errors.add(ex.getMessage());
                    }
                }
                flushBusinessProductBatch(batch, outletId);
            }
        } else if ("inventory".equals(type)) {
            if (completeInventorySnapshot && items.isEmpty()) {
                throw new IllegalArgumentException("A complete inventory snapshot cannot be empty");
            }
            Map<String, Long> inventoryMappings = validateInventoryTargetConflicts(items, store, outletId, errors);
            skipped += Math.max(0, items.size() - inventoryMappings.size());
            if (completeInventorySnapshot) {
                jdbc.update("DELETE FROM product_inventory WHERE outlet_id=? AND product_id IN (SELECT pos_product_id FROM shopfront_product_mapping WHERE store_key=?)", outletId, store);
            }
            List<Object[]> inventoryRows = new ArrayList<>();
            for (JsonNode item : items) {
                String sourceId = text(item, "source_id");
                Long productId = inventoryMappings.get(sourceId);
                if (productId == null || productId <= 0) continue;
                inventoryRows.add(new Object[]{productId, outletId, decimal(item, "quantity", BigDecimal.ZERO),
                        decimal(item, "reorder_level"), decimal(item, "reorder_amount"),
                        decimal(item, "reorder_limit"), decimal(item, "max_quantity"),
                        decimal(item, "on_order", BigDecimal.ZERO)});
            }
            if (!inventoryRows.isEmpty()) {
                jdbc.batchUpdate("INSERT INTO product_inventory (product_id,outlet_id,quantity,reorder_level,reorder_amount,reorder_limit,max_quantity,on_order) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (product_id,outlet_id) DO UPDATE SET quantity=EXCLUDED.quantity,reorder_level=EXCLUDED.reorder_level,reorder_amount=EXCLUDED.reorder_amount,reorder_limit=EXCLUDED.reorder_limit,max_quantity=EXCLUDED.max_quantity,on_order=EXCLUDED.on_order", inventoryRows);
                updated += inventoryRows.size();
            }
        } else {
            validateBusinessImport(type, items, store, outletId, completeInventorySnapshot, taxRates);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("enabled", true);
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        result.put("errors", errors);
        return result;
    }

    private Map<String, Object> importBusinessSuppliers(String store, long outletId, Object mappedCompanyId, JsonNode items) {
        Long vendorId = jdbc.queryForObject("SELECT vendor_id FROM outlet WHERE id=? AND deleted_at IS NULL", Long.class, outletId);
        if (vendorId == null || vendorId <= 0 || !String.valueOf(vendorId).equals(String.valueOf(mappedCompanyId))) {
            throw new IllegalArgumentException("Shopfront supplier mapping does not match the outlet tenant");
        }
        List<Map<String, Object>> existingRows = jdbc.queryForList(
                "SELECT id,name,business_number FROM supplier WHERE outlet_id=? AND deleted_at IS NULL", outletId);
        Map<String, List<Long>> byBusinessNumber = new HashMap<>();
        Map<String, List<Long>> byName = new HashMap<>();
        for (Map<String, Object> row : existingRows) {
            long id = longValue(row.get("id"));
            String businessNumber = normalizeSupplierIdentity(String.valueOf(row.getOrDefault("business_number", "")));
            String name = normalizeSupplierIdentity(String.valueOf(row.getOrDefault("name", "")));
            if (!businessNumber.isBlank()) byBusinessNumber.computeIfAbsent(businessNumber, ignored -> new ArrayList<>()).add(id);
            if (!name.isBlank()) byName.computeIfAbsent(name, ignored -> new ArrayList<>()).add(id);
        }

        int created = 0;
        int updated = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();
        for (JsonNode item : items) {
            String sourceId = text(item, "source_id");
            String name = text(item, "name");
            if (sourceId == null || sourceId.isBlank() || name == null || name.isBlank()) {
                skipped++;
                if (errors.size() < 25) errors.add("Supplier source_id and name are required");
                continue;
            }
            List<Map<String, Object>> priorMappings = jdbc.queryForList(
                    "SELECT supplier_id FROM shopfront_supplier_business_mapping WHERE store_key=? AND source_id=? AND outlet_id=?",
                    store, sourceId, outletId);

            JsonNode raw = item.path("raw_payload").isObject() ? item.path("raw_payload") : item;
            String businessNumber = text(item, "business_number");
            if (businessNumber == null || businessNumber.isBlank()) businessNumber = text(raw, "businessNumber");
            String normalizedBusinessNumber = normalizeSupplierIdentity(businessNumber == null ? "" : businessNumber);
            String normalizedName = normalizeSupplierIdentity(name);
            List<Long> matches = !normalizedBusinessNumber.isBlank()
                    ? byBusinessNumber.getOrDefault(normalizedBusinessNumber, List.of())
                    : byName.getOrDefault(normalizedName, List.of());
            if (matches.size() > 1) {
                skipped++;
                if (errors.size() < 25) errors.add("Supplier " + sourceId + " matches multiple Orithos suppliers");
                continue;
            }

            Long supplierId;
            boolean existingSupplier;
            if (!priorMappings.isEmpty()) {
                supplierId = longValue(priorMappings.getFirst().get("supplier_id"));
                existingSupplier = true;
            } else if (matches.size() == 1) {
                supplierId = matches.getFirst();
                existingSupplier = true;
            } else {
                JsonNode contact = raw.path("contact");
                Long contactId = null;
                if (contact.isObject() && hasSupplierContact(contact)) {
                    String contactSql = "INSERT INTO contact (outlet_id,email,phone,mobile,fax,website,address_street1,address_street2,address_suburb,address_city,address_postcode,address_region,address_country,twitter,facebook) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id";
                    contactId = jdbc.queryForObject(contactSql, Long.class, outletId,
                            text(contact, "email"), text(contact, "phone"), text(contact, "mobile"), text(contact, "fax"),
                            text(contact, "website"), text(contact, "addressStreet1"), text(contact, "addressStreet2"),
                            text(contact, "addressSuburb"), text(contact, "addressCity"), text(contact, "addressPostcode"),
                            text(contact, "addressRegion"), text(contact, "addressCountry"), text(contact, "twitter"), text(contact, "facebook"));
                }
                String supplierSql = "INSERT INTO supplier (outlet_id,name,status,contact_id,business_number,order_notes,default_order_tax,comments,minimum_order_value,maximum_order_value,default_days_until_due) VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id";
                supplierId = jdbc.queryForObject(supplierSql, Long.class, outletId, name,
                        text(item, "status") == null ? text(raw, "status") : text(item, "status"), contactId,
                        businessNumber, text(raw, "orderNotes"), text(raw, "defaultOrderTax"), text(raw, "comments"),
                        decimal(raw, "minimumOrderValue"), decimal(raw, "maximumOrderValue"), integerValue(raw, "defaultDaysUntilDue"));
                if (supplierId == null || supplierId <= 0) {
                    throw new IllegalStateException("Orithos did not return a supplier id for " + sourceId);
                }
                created++;
                existingSupplier = false;
                if (!normalizedBusinessNumber.isBlank()) byBusinessNumber.computeIfAbsent(normalizedBusinessNumber, ignored -> new ArrayList<>()).add(supplierId);
                byName.computeIfAbsent(normalizedName, ignored -> new ArrayList<>()).add(supplierId);
            }
            if (existingSupplier) {
                int changed = jdbc.update("UPDATE supplier SET name=?,status=COALESCE(?,status),business_number=COALESCE(?,business_number),order_notes=COALESCE(?,order_notes),default_order_tax=COALESCE(?,default_order_tax),comments=COALESCE(?,comments),minimum_order_value=COALESCE(?,minimum_order_value),maximum_order_value=COALESCE(?,maximum_order_value),default_days_until_due=COALESCE(?,default_days_until_due) WHERE id=? AND outlet_id=? AND deleted_at IS NULL",
                        name, text(item, "status") == null ? text(raw, "status") : text(item, "status"), businessNumber,
                        text(raw, "orderNotes"), text(raw, "defaultOrderTax"), text(raw, "comments"),
                        decimal(raw, "minimumOrderValue"), decimal(raw, "maximumOrderValue"),
                        integerValue(raw, "defaultDaysUntilDue"), supplierId, outletId);
                if (changed != 1) {
                    throw new IllegalArgumentException("Mapped Shopfront supplier does not belong to the mapped outlet");
                }
                JsonNode contact = raw.path("contact");
                if (contact.isObject() && hasSupplierContact(contact)) {
                    jdbc.update("UPDATE contact SET email=COALESCE(?,email),phone=COALESCE(?,phone),mobile=COALESCE(?,mobile),fax=COALESCE(?,fax),website=COALESCE(?,website),address_street1=COALESCE(?,address_street1),address_street2=COALESCE(?,address_street2),address_suburb=COALESCE(?,address_suburb),address_city=COALESCE(?,address_city),address_postcode=COALESCE(?,address_postcode),address_region=COALESCE(?,address_region),address_country=COALESCE(?,address_country),twitter=COALESCE(?,twitter),facebook=COALESCE(?,facebook) WHERE id=(SELECT contact_id FROM supplier WHERE id=? AND outlet_id=? AND deleted_at IS NULL) AND outlet_id=?",
                            text(contact, "email"), text(contact, "phone"), text(contact, "mobile"), text(contact, "fax"),
                            text(contact, "website"), text(contact, "addressStreet1"), text(contact, "addressStreet2"),
                            text(contact, "addressSuburb"), text(contact, "addressCity"), text(contact, "addressPostcode"),
                            text(contact, "addressRegion"), text(contact, "addressCountry"), text(contact, "twitter"),
                            text(contact, "facebook"), supplierId, outletId, outletId);
                }
                updated++;
            }
            String mappingSql = isPostgres()
                    ? "INSERT INTO shopfront_supplier_business_mapping (store_key,source_id,outlet_id,supplier_id) VALUES (?,?,?,?) ON CONFLICT (store_key,source_id,outlet_id) DO UPDATE SET supplier_id=EXCLUDED.supplier_id,updated_at=CURRENT_TIMESTAMP"
                    : "INSERT INTO shopfront_supplier_business_mapping (store_key,source_id,outlet_id,supplier_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE supplier_id=VALUES(supplier_id),updated_at=CURRENT_TIMESTAMP";
            jdbc.update(mappingSql, store, sourceId, outletId, supplierId);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("enabled", true);
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        result.put("errors", errors);
        return result;
    }

    private Map<String, Object> importBusinessPurchaseOrders(String store, Map<String, Object> mapping, JsonNode items) {
        long outletId = longValue(mapping.get("outlet_id"));
        Object mappedCompanyId = mapping.get("company_id");
        Long vendorId = jdbc.queryForObject("SELECT vendor_id FROM outlet WHERE id=? AND deleted_at IS NULL", Long.class, outletId);
        if (outletId <= 0 || vendorId == null || !String.valueOf(vendorId).equals(String.valueOf(mappedCompanyId))) {
            throw new IllegalArgumentException("Shopfront purchase-order mapping does not match the outlet tenant");
        }
        ensurePurchaseOrderBusinessMappingTable();
        int created = 0;
        int updated = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        // Prefetch once per batch — historical POs can have hundreds of lines and
        // per-line mappedProductId/mappedSupplierId round-trips gateway-timeout.
        Map<String, Long> supplierCache = preloadSupplierMappings(store, outletId);
        Map<String, Long> productCache = preloadProductMappings(store, outletId);
        for (JsonNode item : items) {
            String sourceId = text(item, "source_id");
            JsonNode raw = item.path("raw_payload").isObject() ? item.path("raw_payload") : item;
            if (sourceId == null || sourceId.isBlank() || !seen.add(sourceId)) {
                skipped++;
                if (errors.size() < 25) {
                    errors.add("Purchase-order source IDs must be present and unique");
                }
                continue;
            }
            JsonNode sourceLines = raw.path("products");
            if (!sourceLines.isArray()) {
                skipped++;
                markPurchaseOrderSkipped(store, sourceId, outletId, "no_products_array");
                if (errors.size() < 25) {
                    errors.add("Purchase order " + sourceId + " has no source products array");
                }
                continue;
            }
            String supplierSourceId = text(item, "supplier_source_id");
            if (supplierSourceId == null || supplierSourceId.isBlank()) {
                for (JsonNode line : sourceLines) {
                    String candidate = text(line.path("supplier"), "id");
                    if (candidate != null && !candidate.isBlank()) {
                        supplierSourceId = candidate;
                        break;
                    }
                }
            }
            Long supplierId = cachedMappedSupplierId(store, supplierSourceId, outletId, supplierCache);
            if (supplierId == null) {
                skipped++;
                markPurchaseOrderSkipped(store, sourceId, outletId, "unmapped_supplier");
                if (errors.size() < 25) {
                    errors.add("Purchase order " + sourceId + " has no mapped Orithos supplier");
                }
                continue;
            }

            List<Object[]> lineRows = new ArrayList<>();
            BigDecimal orderedTotal = BigDecimal.ZERO;
            BigDecimal receivedTotal = BigDecimal.ZERO;
            int skippedLines = 0;
            // Keep importing mapped lines when a historical Shopfront row still
            // references deleted/unmapped catalogue ids; only skip the whole PO
            // when nothing usable remains.
            for (JsonNode line : sourceLines) {
                String lineSupplierSourceId = text(line.path("supplier"), "id");
                Long lineSupplierId = cachedMappedSupplierId(store,
                        lineSupplierSourceId == null || lineSupplierSourceId.isBlank() ? supplierSourceId : lineSupplierSourceId,
                        outletId, supplierCache);
                if (lineSupplierId == null || !supplierId.equals(lineSupplierId)) {
                    skippedLines++;
                    if (errors.size() < 25) {
                        errors.add("Purchase order " + sourceId + " skipped a line with an unmapped or different supplier");
                    }
                    continue;
                }
                String productSourceId = text(line.path("item"), "id");
                Long productId = cachedMappedProductId(store, productSourceId, outletId, productCache);
                if (productId == null) {
                    skippedLines++;
                    if (errors.size() < 25) {
                        errors.add("Purchase order " + sourceId + " skipped unmapped product " + productSourceId);
                    }
                    continue;
                }
                BigDecimal ordered = decimal(line, "orderedQuantity");
                BigDecimal received = decimal(line, "receivedQuantity");
                if (ordered == null || ordered.signum() < 0 || (received != null && received.signum() < 0)) {
                    skippedLines++;
                    if (errors.size() < 25) {
                        errors.add("Purchase order " + sourceId + " skipped a line with an invalid quantity");
                    }
                    continue;
                }
                received = received == null ? BigDecimal.ZERO : received;
                orderedTotal = orderedTotal.add(ordered);
                receivedTotal = receivedTotal.add(received);
                lineRows.add(new Object[]{productId, lineSupplierId, text(line.path("item"), "mdbId"),
                        decimal(line, "caseQuantity"), ordered, received, decimal(line, "baseCost"),
                        decimal(line, "orderedCost"), outletId});
            }
            if (lineRows.isEmpty()) {
                skipped++;
                markPurchaseOrderSkipped(store, sourceId, outletId,
                        "no_importable_lines:" + skippedLines);
                if (errors.size() < 25) {
                    errors.add("Purchase order " + sourceId + " has no importable lines"
                            + (skippedLines > 0 ? " (" + skippedLines + " skipped)" : ""));
                }
                continue;
            }
            boolean allReceived = !lineRows.isEmpty();
            for (Object[] lineRow : lineRows) {
                BigDecimal ordered = (BigDecimal) lineRow[4];
                BigDecimal received = (BigDecimal) lineRow[5];
                if (received.compareTo(ordered) < 0) {
                    allReceived = false;
                    break;
                }
            }

            // Include imported-line cardinality so newly mapped catalogue rows
            // can expand a previously partial PO on the next upsert. Re-digest
            // so the value still fits source_hash VARCHAR(64).
            String hash = purchaseOrderSourceHash(
                    purchaseOrderSourceHash(raw) + ":imported=" + lineRows.size() + ":skipped=" + skippedLines);
            List<Map<String, Object>> prior = jdbc.queryForList(
                    "SELECT purchase_order_id,source_hash FROM shopfront_purchase_order_business_mapping WHERE store_key=? AND source_id=? AND outlet_id=?",
                    store, sourceId, outletId);
            if (!prior.isEmpty() && hash.equals(String.valueOf(prior.getFirst().get("source_hash")))) {
                updated++;
                continue;
            }
            Long orderId = prior.isEmpty() ? null : longValue(prior.getFirst().get("purchase_order_id"));
            if (orderId != null) {
                Integer receipts = jdbc.queryForObject("SELECT COUNT(*) FROM purchase_receipt WHERE order_id=?", Integer.class, orderId);
                if (receipts != null && receipts > 0) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "Shopfront purchase order " + sourceId + " changed after an Orithos receipt was created");
                }
            }

            String status = purchaseOrderStatus(raw, lineRows.size(), receivedTotal, allReceived);
            String invoiceNumber = text(raw, "invoiceNumber");
            if (invoiceNumber == null || invoiceNumber.isBlank()) invoiceNumber = sourceId;
            if (invoiceNumber.length() > 64 || sourceId.length() > 128) {
                throw new IllegalArgumentException("Purchase order " + sourceId + " has an identifier that exceeds Orithos limits");
            }
            java.sql.Date orderDate = sqlDate(text(raw, "orderDate"));
            java.sql.Date dueDate = sqlDate(text(raw, "dueDate"));
            BigDecimal totalCost = decimal(raw, "totalCost");
            BigDecimal expectedTotal = decimal(raw, "expectedTotal");
            if (expectedTotal == null) expectedTotal = totalCost;
            // purchase_order.include_freight is SMALLINT/INT2 in Orithos schemas.
            int includeFreight = raw.path("includeFreight").asBoolean(false) ? 1 : 0;
            String notes = text(raw, "notes");
            if (orderId == null) {
                String sql = isPostgres()
                        ? "INSERT INTO purchase_order (type,status,from_id,to_id,order_date,due_date,entered_as,invoice_number,reference,notes,internal_notes,include_freight,total_cost,expected_total,line_count,created_by_id,outlet_id) VALUES ('ORDER',?,?,?,?,?,'SHOPFRONT',?,?,?,NULL,?,?,?,?,NULL,?) RETURNING id"
                        : "INSERT INTO purchase_order (type,status,from_id,to_id,order_date,due_date,entered_as,invoice_number,reference,notes,internal_notes,include_freight,total_cost,expected_total,line_count,created_by_id,outlet_id) VALUES ('ORDER',?,?,?,?,?,'SHOPFRONT',?,?,?,NULL,?,?,?,?,NULL,?)";
                Object[] args = {status, supplierId, outletId, orderDate, dueDate, invoiceNumber, sourceId, notes,
                        includeFreight, totalCost, expectedTotal, lineRows.size(), outletId};
                if (isPostgres()) {
                    orderId = jdbc.queryForObject(sql, Long.class, args);
                } else {
                    jdbc.update(sql, args);
                    orderId = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
                }
                if (orderId == null || orderId <= 0) throw new IllegalStateException("Orithos did not return a purchase order id");
                created++;
            } else {
                int changed = jdbc.update("UPDATE purchase_order SET status=?,from_id=?,to_id=?,order_date=?,due_date=?,entered_as='SHOPFRONT',invoice_number=?,reference=?,notes=?,include_freight=?,total_cost=?,expected_total=?,line_count=? WHERE id=? AND outlet_id=? AND type='ORDER'",
                        status, supplierId, outletId, orderDate, dueDate, invoiceNumber, sourceId, notes,
                        includeFreight, totalCost, expectedTotal, lineRows.size(), orderId, outletId);
                if (changed != 1) throw new IllegalArgumentException("Mapped Shopfront order does not belong to the mapped outlet");
                jdbc.update("DELETE FROM order_product WHERE order_id=? AND outlet_id=?", orderId, outletId);
                updated++;
            }
            for (Object[] line : lineRows) {
                jdbc.update("INSERT INTO order_product (order_id,product_id,supplier_id,supplier_code,case_quantity,ordered_quantity,received_quantity,base_cost,ordered_cost,outlet_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        orderId, line[0], line[1], line[2], line[3], line[4], line[5], line[6], line[7], line[8]);
            }
            String mappingSql = isPostgres()
                    ? "INSERT INTO shopfront_purchase_order_business_mapping (store_key,source_id,outlet_id,purchase_order_id,source_hash) VALUES (?,?,?,?,?) ON CONFLICT (store_key,source_id,outlet_id) DO UPDATE SET purchase_order_id=EXCLUDED.purchase_order_id,source_hash=EXCLUDED.source_hash,updated_at=CURRENT_TIMESTAMP"
                    : "INSERT INTO shopfront_purchase_order_business_mapping (store_key,source_id,outlet_id,purchase_order_id,source_hash) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE purchase_order_id=VALUES(purchase_order_id),source_hash=VALUES(source_hash),updated_at=CURRENT_TIMESTAMP";
            jdbc.update(mappingSql, store, sourceId, outletId, orderId, hash);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("enabled", true);
        result.put("created", created);
        result.put("updated", updated);
        result.put("skipped", skipped);
        result.put("errors", errors);
        return result;
    }

    private void ensurePurchaseOrderBusinessMappingTable() {
        jdbc.update("CREATE TABLE IF NOT EXISTS shopfront_purchase_order_business_mapping (store_key VARCHAR(64) NOT NULL,source_id VARCHAR(192) NOT NULL,outlet_id BIGINT NOT NULL,purchase_order_id BIGINT NOT NULL,source_hash VARCHAR(64) NOT NULL,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (store_key,source_id,outlet_id))");
    }

    /**
     * Persist a sentinel mapping ({@code purchase_order_id=0}) so {@code only_unmapped}
     * promote loops do not keep reprocessing permanently unimportable historical POs.
     */
    private void markPurchaseOrderSkipped(String store, String sourceId, long outletId, String reason) {
        String hash = purchaseOrderSourceHash("SKIPPED:" + reason + ":" + sourceId);
        String mappingSql = isPostgres()
                ? "INSERT INTO shopfront_purchase_order_business_mapping (store_key,source_id,outlet_id,purchase_order_id,source_hash) VALUES (?,?,?,?,?) ON CONFLICT (store_key,source_id,outlet_id) DO UPDATE SET purchase_order_id=EXCLUDED.purchase_order_id,source_hash=EXCLUDED.source_hash,updated_at=CURRENT_TIMESTAMP"
                : "INSERT INTO shopfront_purchase_order_business_mapping (store_key,source_id,outlet_id,purchase_order_id,source_hash) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE purchase_order_id=VALUES(purchase_order_id),source_hash=VALUES(source_hash),updated_at=CURRENT_TIMESTAMP";
        jdbc.update(mappingSql, store, sourceId, outletId, 0L, hash);
    }

    private Map<String, Long> preloadSupplierMappings(String store, long outletId) {
        Map<String, Long> cache = new HashMap<>();
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT m.source_id, m.supplier_id
                FROM shopfront_supplier_business_mapping m
                JOIN supplier s ON s.id = m.supplier_id AND s.outlet_id = m.outlet_id AND s.deleted_at IS NULL
                WHERE m.store_key = ? AND m.outlet_id = ?
                """, store, outletId);
        for (Map<String, Object> row : rows) {
            String sourceId = stringValue(row.get("source_id"));
            Long supplierId = longValue(row.get("supplier_id"));
            if (sourceId != null && !sourceId.isBlank() && supplierId != null && supplierId > 0) {
                cache.put(sourceId, supplierId);
            }
        }
        return cache;
    }

    private Map<String, Long> preloadProductMappings(String store, long outletId) {
        Map<String, Long> cache = new HashMap<>();
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT m.source_product_id, m.pos_product_id
                FROM shopfront_product_mapping m
                JOIN product p ON p.id = m.pos_product_id AND p.outlet_id = ? AND p.deleted_at IS NULL
                WHERE m.store_key = ? AND m.status = 'MAPPED'
                """, outletId, store);
        for (Map<String, Object> row : rows) {
            String sourceId = stringValue(row.get("source_product_id"));
            Long productId = longValue(row.get("pos_product_id"));
            if (sourceId != null && !sourceId.isBlank() && productId != null && productId > 0) {
                cache.put(sourceId, productId);
            }
        }
        return cache;
    }

    private Long cachedMappedSupplierId(String store, String sourceId, long outletId, Map<String, Long> cache) {
        String key = sourceId == null ? "" : sourceId;
        if (cache.containsKey(key)) {
            return cache.get(key);
        }
        // Negative cache empty keys / misses so we do not re-query the same
        // unmapped supplier for every line in a large historical PO.
        if (key.isBlank()) {
            cache.put(key, null);
            return null;
        }
        Long mapped = mappedSupplierId(store, sourceId, outletId);
        cache.put(key, mapped);
        return mapped;
    }

    private Long cachedMappedProductId(String store, String sourceId, long outletId, Map<String, Long> cache) {
        String key = sourceId == null ? "" : sourceId;
        if (cache.containsKey(key)) {
            return cache.get(key);
        }
        // After batch preload, treat misses as unmapped. Do not fall back to
        // per-line mappedProductId/barcode-lazy queries — historical POs with
        // hundreds of retired catalogue ids otherwise gateway-timeout.
        cache.put(key, null);
        return null;
    }

    private Long mappedSupplierId(String store, String sourceId, long outletId) {
        if (sourceId == null || sourceId.isBlank()) return null;
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT m.supplier_id FROM shopfront_supplier_business_mapping m JOIN supplier s ON s.id=m.supplier_id AND s.outlet_id=m.outlet_id AND s.deleted_at IS NULL WHERE m.store_key=? AND m.source_id=? AND m.outlet_id=?",
                store, sourceId, outletId);
        return rows.isEmpty() ? null : longValue(rows.getFirst().get("supplier_id"));
    }

    private Long mappedProductId(String store, String sourceId, long outletId) {
        if (sourceId == null || sourceId.isBlank()) return null;
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT m.pos_product_id FROM shopfront_product_mapping m JOIN product p ON p.id=m.pos_product_id AND p.outlet_id=? AND p.deleted_at IS NULL WHERE m.store_key=? AND m.source_product_id=? AND m.status='MAPPED'",
                outletId, store, sourceId);
        if (!rows.isEmpty()) {
            return longValue(rows.getFirst().get("pos_product_id"));
        }
        // Lazy barcode resolve so Demo dual-write POs do not hard-skip while
        // product-mappings:clone is still catching up behind the proxy timeout.
        List<Map<String, Object>> byBarcode = jdbc.queryForList("""
                SELECT pb.product_id AS pos_product_id
                FROM shopfront_product sp
                JOIN product_barcode pb ON pb.code = sp.barcode AND pb.outlet_id = ?
                JOIN product p ON p.id = pb.product_id AND p.outlet_id = ? AND p.deleted_at IS NULL
                WHERE sp.source_id = ?
                  AND sp.barcode IS NOT NULL
                  AND TRIM(sp.barcode) <> ''
                ORDER BY CASE WHEN sp.store_key = ? THEN 0 ELSE 1 END, sp.store_key
                LIMIT 1
                """, outletId, outletId, sourceId, store);
        if (byBarcode.isEmpty()) {
            return null;
        }
        Long productId = longValue(byBarcode.getFirst().get("pos_product_id"));
        if (productId == null || productId <= 0) {
            return null;
        }
        String sql = isPostgres()
                ? "INSERT INTO shopfront_product_mapping (store_key,source_product_id,pos_product_id,match_type,status) VALUES (?,?,?, 'BARCODE_LAZY', 'MAPPED') ON CONFLICT (store_key,source_product_id) DO UPDATE SET pos_product_id=EXCLUDED.pos_product_id,match_type='BARCODE_LAZY',status='MAPPED',updated_at=CURRENT_TIMESTAMP"
                : "INSERT INTO shopfront_product_mapping (store_key,source_product_id,pos_product_id,match_type,status) VALUES (?,?,?, 'BARCODE_LAZY', 'MAPPED') ON DUPLICATE KEY UPDATE pos_product_id=VALUES(pos_product_id),match_type='BARCODE_LAZY',status='MAPPED',updated_at=CURRENT_TIMESTAMP";
        jdbc.update(sql, store, sourceId, productId);
        return productId;
    }

    private String purchaseOrderSourceHash(JsonNode raw) {
        try {
            return purchaseOrderSourceHash(objectMapper.writeValueAsBytes(raw));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to fingerprint Shopfront purchase order", ex);
        }
    }

    private String purchaseOrderSourceHash(String material) {
        return purchaseOrderSourceHash(material.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private String purchaseOrderSourceHash(byte[] material) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(material);
            return HexFormat.of().formatHex(digest);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to fingerprint Shopfront purchase order", ex);
        }
    }

    private java.sql.Date sqlDate(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return java.sql.Date.valueOf(java.time.LocalDate.parse(value.substring(0, Math.min(10, value.length()))));
        } catch (RuntimeException ex) {
            throw new IllegalArgumentException("Shopfront purchase order contains an invalid date");
        }
    }

    private String purchaseOrderStatus(JsonNode raw, int lineCount, BigDecimal received, boolean allReceived) {
        String status = text(raw, "status");
        String normalized = status == null ? "" : status.toUpperCase(Locale.ROOT);
        if (normalized.contains("CANCEL") || normalized.contains("VOID")) return "CANCELLED";
        if (normalized.contains("RECEIV") || normalized.contains("COMPLET") || normalized.equals("CLOSED")) return "RECEIVED";
        if (lineCount > 0 && allReceived) return "RECEIVED";
        if (received.signum() > 0) return "PARTIALLY_RECEIVED";
        if (text(raw, "sentAt") != null) return "SENT";
        return "OPEN";
    }

    private boolean hasSupplierContact(JsonNode contact) {
        for (String field : List.of("email", "phone", "mobile", "fax", "website", "addressStreet1", "addressStreet2", "addressSuburb", "addressCity", "addressPostcode", "addressRegion", "addressCountry")) {
            String value = text(contact, field);
            if (value != null && !value.isBlank()) return true;
        }
        return false;
    }

    private String normalizeSupplierIdentity(String value) {
        return value == null ? "" : value.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }

    private Integer integerValue(JsonNode node, String key) {
        try {
            JsonNode value = node.get(key);
            return value == null || value.isNull() || value.asText().isBlank() ? null : value.asInt();
        } catch (Exception ignored) {
            return null;
        }
    }

    private void validateProductBusinessFields(JsonNode item, long outletId, Map<String, Long> taxRates) {
        String sourceId = text(item, "source_id");
        String name = text(item, "name");
        BigDecimal caseQuantity = decimal(item, "case_quantity");
        BigDecimal price = decimal(item, "price");
        String taxRateName = text(item, "tax_rate_name");
        String sourceStatus = text(item, "source_status");
        if (sourceId == null || sourceId.isBlank() || name == null || name.isBlank()) {
            throw new IllegalArgumentException("Product source_id and name are required");
        }
        if (caseQuantity == null || caseQuantity.signum() <= 0) {
            throw new IllegalArgumentException("Product " + sourceId + " has no valid case quantity");
        }
        if ((price == null || price.signum() < 0) && !hasUnitPrice(item)) {
            throw new IllegalArgumentException("Product " + sourceId + " has no valid shelf price");
        }
        if (taxRateName == null || taxRateName.isBlank()) {
            throw new IllegalArgumentException("Product " + sourceId + " has no mapped GST rate");
        }
        if (sourceStatus == null || sourceStatus.isBlank()) {
            throw new IllegalArgumentException("Product " + sourceId + " has no source status");
        }
        requireTaxRate(taxRateName, outletId, sourceId, taxRates);
        String costTaxRateName = text(item, "cost_tax_rate_name");
        if (costTaxRateName != null && !costTaxRateName.isBlank()) {
            requireTaxRate(costTaxRateName, outletId, sourceId, taxRates);
        }
    }

    private BusinessImportPlan validateBusinessImport(String type, JsonNode items, String store, long outletId,
                                                      boolean completeInventorySnapshot, Map<String, Long> taxRates) {
        if ("products".equals(type)) {
            for (JsonNode item : items) {
                validateProductBusinessFields(item, outletId, taxRates);
            }
            BusinessImportPlan plan = resolveBusinessProductIds(store, outletId, items);
            validateProductAliasConflicts(items, store, plan.productIds());
            return plan;
        } else if ("inventory".equals(type) && completeInventorySnapshot) {
            if (items.isEmpty()) {
                throw new IllegalArgumentException("A complete inventory snapshot cannot be empty");
            }
        }
        if ("inventory".equals(type)) {
            Map<String, Long> inventoryMappings = validateInventoryTargetConflicts(items, store, outletId, null);
            return new BusinessImportPlan(inventoryMappings, Set.of());
        }
        return new BusinessImportPlan(Map.of(), Set.of());
    }

    private void validateProductAliasConflicts(JsonNode items, String store, Map<String, Long> resolvedProducts) {
        List<String> errors = new ArrayList<>();
        Set<String> rejected = collectProductAliasConflicts(items, store, resolvedProducts, errors);
        if (!rejected.isEmpty()) {
            throw new IllegalArgumentException(errors.isEmpty()
                    ? "Shopfront products resolve to the same Orithos product with conflicting business attributes"
                    : errors.get(0));
        }
    }

    /**
     * Soft alias-conflict collector for business import. Conflicting source rows are
     * skipped instead of 422-ing the whole upsert batch so Demo/SKR catalogue sync
     * can continue while owner data is cleaned up.
     */
    private Set<String> collectProductAliasConflicts(JsonNode items, String store, Map<String, Long> resolvedProducts,
                                                     List<String> errors) {
        Map<String, String> incomingSignatures = new LinkedHashMap<>();
        Map<String, Set<String>> incomingSources = new LinkedHashMap<>();
        Set<Long> targetIds = new HashSet<>();
        Set<String> sourceIds = new HashSet<>();
        Set<String> rejected = new LinkedHashSet<>();

        for (JsonNode item : items) {
            String sourceId = text(item, "source_id");
            sourceIds.add(sourceId);
            Long targetId = resolvedProducts.get(sourceId);
            String targetKey = targetId == null ? productIdentityKey(item) : "product:" + targetId;
            if (targetId != null) targetIds.add(targetId);
            String signature = productBusinessSignature(item);
            String existing = incomingSignatures.putIfAbsent(targetKey, signature);
            Set<String> targetSources = incomingSources.computeIfAbsent(targetKey, ignored -> new LinkedHashSet<>());
            targetSources.add(sourceId);
            if (existing != null && !existing.equals(signature)) {
                rejected.addAll(targetSources);
                if (errors != null && errors.size() < 25) {
                    errors.add("Shopfront products resolving to " + targetKey
                            + " have conflicting business attributes");
                }
            }
        }

        if (targetIds.isEmpty()) return rejected;
        List<Map<String, Object>> mappingRows = queryRowsInChunks(
                "SELECT pos_product_id, source_product_id FROM shopfront_product_mapping "
                        + "WHERE store_key=? AND status='MAPPED' AND pos_product_id IN (%s)",
                List.of(store), new ArrayList<>(targetIds));
        Map<String, Long> existingAliases = new LinkedHashMap<>();
        for (Map<String, Object> row : mappingRows) {
            String sourceId = String.valueOf(row.get("source_product_id"));
            if (sourceIds.contains(sourceId)) continue;
            existingAliases.put(sourceId, longValue(row.get("pos_product_id")));
        }
        if (existingAliases.isEmpty()) return rejected;
        List<Map<String, Object>> sourceRows = queryRowsInChunks(
                "SELECT source_id, raw_payload FROM shopfront_product WHERE store_key=? AND source_id IN (%s)",
                List.of(store), new ArrayList<>(existingAliases.keySet()));
        for (Map<String, Object> row : sourceRows) {
            String sourceId = String.valueOf(row.get("source_id"));
            long targetId = existingAliases.get(sourceId);
            String incomingSignature = incomingSignatures.get("product:" + targetId);
            Set<String> incomingTargetSources = incomingSources.get("product:" + targetId);
            if (incomingSignature == null || incomingTargetSources == null || incomingTargetSources.stream().anyMatch(rejected::contains)) continue;
            try {
                JsonNode existing = objectMapper.readTree(String.valueOf(row.get("raw_payload")));
                if (!incomingSignature.equals(productBusinessSignature(existing))) {
                    rejected.addAll(incomingTargetSources);
                    if (errors != null && errors.size() < 25) {
                        errors.add("Shopfront product " + sourceId + " is already mapped to Orithos product "
                                + targetId + " with conflicting business attributes");
                    }
                }
            } catch (IllegalArgumentException e) {
                rejected.addAll(incomingTargetSources);
                if (errors != null && errors.size() < 25) errors.add(e.getMessage());
            } catch (Exception e) {
                rejected.addAll(incomingTargetSources);
                if (errors != null && errors.size() < 25) {
                    errors.add("Unable to verify attributes for mapped Shopfront product " + sourceId);
                }
            }
        }
        return rejected;
    }

    private Map<String, Long> validateInventoryTargetConflicts(JsonNode items, String store, long outletId, List<String> errors) {
        if (!items.isArray()) throw new IllegalArgumentException("Inventory items must be an array");
        Set<String> seenSources = new HashSet<>();
        Map<Long, String> targetSignatures = new LinkedHashMap<>();
        Map<Long, String> targetSources = new LinkedHashMap<>();
        List<String> sourceIds = new ArrayList<>();
        for (JsonNode item : items) {
            String sourceId = text(item, "source_id");
            if (sourceId == null || sourceId.isBlank() || !seenSources.add(sourceId)) {
                String message = "Inventory snapshot has a missing or duplicate source product id";
                if (errors == null) throw new IllegalArgumentException(message);
                if (errors.size() < 25) errors.add(message);
                continue;
            }
            if (decimal(item, "quantity") == null) {
                String message = "Inventory product " + sourceId + " has no quantity";
                if (errors == null) throw new IllegalArgumentException(message);
                if (errors.size() < 25) errors.add(message);
                continue;
            }
            sourceIds.add(sourceId);
        }
        Map<String, Long> mappings = resolveInventoryProductIds(store, outletId, sourceIds);
        Map<String, Long> accepted = new LinkedHashMap<>();
        for (JsonNode item : items) {
            String sourceId = text(item, "source_id");
            if (sourceId == null || !sourceIds.contains(sourceId)) continue;
            Long targetId = mappings.get(sourceId);
            if (targetId == null || targetId <= 0) {
                String message = "Inventory product " + sourceId + " has no Orithos product mapping";
                if (errors == null) throw new IllegalArgumentException(message);
                if (errors.size() < 25) errors.add(message);
                continue;
            }
            String signature = inventoryBusinessSignature(item);
            String prior = targetSignatures.putIfAbsent(targetId, signature);
            if (prior != null && !prior.equals(signature)) {
                String message = "Shopfront inventory products " + targetSources.get(targetId) + " and " + sourceId
                        + " map to Orithos product " + targetId + " with conflicting stock attributes";
                if (errors == null) throw new IllegalArgumentException(message);
                if (errors.size() < 25) errors.add(message);
                accepted.remove(targetSources.get(targetId));
                continue;
            }
            targetSources.putIfAbsent(targetId, sourceId);
            accepted.put(sourceId, targetId);
        }
        return accepted;
    }

    private BusinessImportPlan resolveBusinessProductIds(String store, long outletId, JsonNode items) {
        List<String> sourceIds = new ArrayList<>();
        Map<String, JsonNode> itemBySource = new LinkedHashMap<>();
        for (JsonNode item : items) {
            String sourceId = text(item, "source_id");
            sourceIds.add(sourceId);
            itemBySource.put(sourceId, item);
        }

        Map<String, Long> productIds = new LinkedHashMap<>();
        Set<String> existingMappings = new HashSet<>();
        List<Map<String, Object>> mappedRows = queryRowsInChunks(
                "SELECT m.source_product_id, m.pos_product_id FROM shopfront_product_mapping m "
                        + "JOIN product p ON p.id=m.pos_product_id AND p.outlet_id=? AND p.deleted_at IS NULL "
                        + "WHERE m.store_key=? AND m.status='MAPPED' AND m.source_product_id IN (%s)",
                List.of(outletId, store), sourceIds);
        for (Map<String, Object> row : mappedRows) {
            String sourceId = String.valueOf(row.get("source_product_id"));
            productIds.put(sourceId, longValue(row.get("pos_product_id")));
            existingMappings.add(sourceId);
        }

        Set<String> barcodes = new java.util.LinkedHashSet<>();
        Set<Integer> skus = new java.util.LinkedHashSet<>();
        Set<String> names = new java.util.LinkedHashSet<>();
        for (String sourceId : sourceIds) {
            if (productIds.containsKey(sourceId)) continue;
            JsonNode item = itemBySource.get(sourceId);
            String barcode = firstBarcode(item);
            if (barcode != null && !barcode.isBlank()) barcodes.add(barcode);
            Integer sku = integerValue(item.get("sku"));
            if (sku != null) skus.add(sku);
            String name = text(item, "name");
            if (name != null && !name.isBlank()) names.add(name.trim().toLowerCase(Locale.ROOT));
        }

        Map<String, Long> barcodeOwners = new LinkedHashMap<>();
        for (Map<String, Object> row : queryRowsInChunks(
                "SELECT code, product_id FROM product_barcode WHERE outlet_id=? AND code IN (%s)",
                List.of(outletId), new ArrayList<>(barcodes))) {
            barcodeOwners.putIfAbsent(String.valueOf(row.get("code")), longValue(row.get("product_id")));
        }
        for (String sourceId : sourceIds) {
            if (productIds.containsKey(sourceId)) continue;
            String barcode = firstBarcode(itemBySource.get(sourceId));
            Long targetId = barcode == null ? null : barcodeOwners.get(barcode);
            if (targetId != null && targetId > 0) productIds.put(sourceId, targetId);
        }

        Map<String, Long> skuOwners = new LinkedHashMap<>();
        for (Map<String, Object> row : queryRowsInChunks(
                "SELECT mdb_id, id FROM product WHERE outlet_id=? AND deleted_at IS NULL AND mdb_id IN (%s) ORDER BY id",
                List.of(outletId), new ArrayList<>(skus))) {
            skuOwners.putIfAbsent(String.valueOf(row.get("mdb_id")), longValue(row.get("id")));
        }
        for (String sourceId : sourceIds) {
            if (productIds.containsKey(sourceId)) continue;
            Integer sku = integerValue(itemBySource.get(sourceId).get("sku"));
            Long targetId = sku == null ? null : skuOwners.get(String.valueOf(sku));
            if (targetId != null && targetId > 0) productIds.put(sourceId, targetId);
        }

        Map<String, Long> nameOwners = new LinkedHashMap<>();
        for (Map<String, Object> row : queryRowsInChunks(
                "SELECT lower(trim(name)) AS normalized_name, id FROM product "
                        + "WHERE outlet_id=? AND deleted_at IS NULL AND lower(trim(name)) IN (%s) ORDER BY id",
                List.of(outletId), new ArrayList<>(names))) {
            nameOwners.putIfAbsent(String.valueOf(row.get("normalized_name")), longValue(row.get("id")));
        }
        for (String sourceId : sourceIds) {
            if (productIds.containsKey(sourceId)) continue;
            String name = text(itemBySource.get(sourceId), "name");
            Long targetId = name == null ? null : nameOwners.get(name.trim().toLowerCase(Locale.ROOT));
            if (targetId != null && targetId > 0) productIds.put(sourceId, targetId);
        }
        for (String sourceId : sourceIds) productIds.putIfAbsent(sourceId, null);
        return new BusinessImportPlan(productIds, existingMappings);
    }

    private Map<String, Long> resolveInventoryProductIds(String store, long outletId, List<String> sourceIds) {
        Map<String, Long> mappings = new LinkedHashMap<>();
        for (Map<String, Object> row : queryRowsInChunks(
                "SELECT m.source_product_id, m.pos_product_id FROM shopfront_product_mapping m "
                        + "JOIN product p ON p.id=m.pos_product_id AND p.outlet_id=? AND p.deleted_at IS NULL "
                        + "WHERE m.store_key=? AND m.status='MAPPED' AND m.source_product_id IN (%s)",
                List.of(outletId, store), sourceIds)) {
            mappings.put(String.valueOf(row.get("source_product_id")), longValue(row.get("pos_product_id")));
        }
        return mappings;
    }

    private List<Map<String, Object>> queryRowsInChunks(String sqlPattern, List<?> fixedArgs, List<?> values) {
        if (values.isEmpty()) return List.of();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int start = 0; start < values.size(); start += 400) {
            List<?> chunk = values.subList(start, Math.min(start + 400, values.size()));
            String placeholders = String.join(",", java.util.Collections.nCopies(chunk.size(), "?"));
            List<Object> args = new ArrayList<>(fixedArgs);
            args.addAll(chunk);
            rows.addAll(jdbc.queryForList(sqlPattern.formatted(placeholders), args.toArray()));
        }
        return rows;
    }

    private String productIdentityKey(JsonNode item) {
        String barcode = firstBarcode(item);
        if (barcode != null && !barcode.isBlank()) return "barcode:" + barcode.trim().toLowerCase(Locale.ROOT);
        Integer sku = integerValue(item.get("sku"));
        if (sku != null) return "sku:" + sku;
        String name = text(item, "name");
        return "name:" + (name == null ? "" : name.trim().toLowerCase(Locale.ROOT));
    }

    private String productBusinessSignature(JsonNode item) {
        List<String> values = new ArrayList<>();
        JsonNode raw = item.path("raw_payload");
        for (String field : List.of("source_type", "category", "brand", "family", "tax_rate_name", "cost_tax_rate_name",
                "cost", "case_quantity", "cost_percentage", "track_inventory", "use_scales", "use_barcode_templates",
                "prevent_manual_discounts", "request_price", "request_quantity", "source_status")) {
            String value = text(item, field);
            if ((value == null || value.isBlank()) && raw.isObject()) {
                String rawField = switch (field) {
                    case "source_type" -> "type";
                    case "track_inventory" -> "trackInventory";
                    case "use_scales" -> "useScales";
                    case "use_barcode_templates" -> "useBarcodeTemplates";
                    case "prevent_manual_discounts" -> "preventManualDiscounts";
                    case "request_price" -> "requestPrice";
                    case "request_quantity" -> "requestQuantity";
                    case "cost_percentage" -> "costPercentage";
                    case "case_quantity" -> "caseQuantity";
                    case "tax_rate_name" -> "taxRate";
                    case "cost_tax_rate_name" -> "costTaxRate";
                    case "source_status" -> "status";
                    default -> field;
                };
                JsonNode rawValue = raw.path(rawField);
                if (rawValue.isObject() && rawValue.has("name")) value = rawValue.path("name").asText();
                else if (!rawValue.isMissingNode() && !rawValue.isNull()) value = rawValue.asText();
            }
            if ("tax_rate_name".equals(field) || "cost_tax_rate_name".equals(field) || "source_type".equals(field)
                    || "source_status".equals(field) || "category".equals(field) || "brand".equals(field) || "family".equals(field)) {
                value = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
            } else if ("cost".equals(field) || "case_quantity".equals(field)) {
                BigDecimal number = decimal(item, field);
                value = number == null ? "" : number.stripTrailingZeros().toPlainString();
            }
            if (List.of("track_inventory", "use_scales", "use_barcode_templates", "prevent_manual_discounts",
                    "request_price", "request_quantity", "cost_percentage").contains(field)) {
                boolean fallback = "track_inventory".equals(field);
                JsonNode rawValue = raw.path(field.equals("track_inventory") ? "trackInventory" : field);
                value = value == null && rawValue.isBoolean()
                        ? String.valueOf(rawValue.asBoolean() ? 1 : 0)
                        : String.valueOf(flag(item, field, fallback));
            }
            values.add(field + "=" + (value == null ? "" : value));
        }
        boolean deleted = flag(item, "source_deleted", false) == 1 || raw.path("deleted").asBoolean(false)
                || !raw.path("deletedAt").isMissingNode() && !raw.path("deletedAt").isNull();
        values.add("source_deleted=" + deleted);
        List<String> prices = new ArrayList<>();
        JsonNode tiers = item.path("prices");
        if (tiers.isArray()) {
            for (JsonNode tier : tiers) {
                BigDecimal priceEx = decimal(tier, "price_ex");
                if (priceEx == null) priceEx = decimal(tier, "priceEx");
                prices.add(decimal(tier, "quantity", BigDecimal.ZERO).stripTrailingZeros().toPlainString() + ":"
                        + decimal(tier, "price", BigDecimal.ZERO).stripTrailingZeros().toPlainString() + ":"
                        + (priceEx == null ? "" : priceEx.stripTrailingZeros().toPlainString()));
            }
        }
        if (prices.isEmpty()) {
            BigDecimal basePrice = decimal(item, "price");
            if (basePrice != null) prices.add("1:" + basePrice.stripTrailingZeros().toPlainString() + ":");
        }
        java.util.Collections.sort(prices);
        values.add("prices=" + String.join(",", prices));
        return String.join("|", values);
    }

    private String inventoryBusinessSignature(JsonNode item) {
        List<String> values = new ArrayList<>();
        for (String field : List.of("quantity", "reorder_level", "reorder_amount", "reorder_limit", "max_quantity", "on_order")) {
            BigDecimal number = decimal(item, field);
            values.add(field + "=" + (number == null ? "" : number.stripTrailingZeros().toPlainString()));
        }
        return String.join("|", values);
    }

    private void requireTaxRate(String taxRateName, long outletId, String sourceId, Map<String, Long> taxRates) {
        String key = taxRateName.trim().toLowerCase(Locale.ROOT);
        if (taxRates.containsKey(key)) return;
        Long taxRateId = findTaxRateId(taxRateName, outletId);
        if (taxRateId == null) {
            throw new IllegalArgumentException("Product " + sourceId + " has no matching Orithos GST rate: " + taxRateName);
        }
        taxRates.put(key, taxRateId);
    }

    private boolean hasUnitPrice(JsonNode item) {
        JsonNode prices = item.path("prices");
        if (!prices.isArray()) return false;
        for (JsonNode price : prices) {
            BigDecimal quantity = decimal(price, "quantity");
            BigDecimal value = decimal(price, "price");
            if (quantity != null && quantity.compareTo(BigDecimal.ONE) == 0
                    && value != null && value.signum() >= 0) return true;
        }
        return false;
    }

    private long upsertBusinessProduct(JsonNode item, long outletId, Map<String, Long> taxRates,
                                       Long resolvedProductId, ProductImportBatch batch) throws Exception {
        String sourceId = text(item, "source_id");
        String name = text(item, "name");
        if (sourceId == null || sourceId.isBlank() || name == null || name.isBlank()) return 0;
        Long productId = resolvedProductId;
        Integer mdbId = integerValue(item.get("sku"));
        Long categoryId = ensureLookup("category", text(item, "category"), outletId, batch.lookupIds);
        Long brandId = ensureLookup("brand", text(item, "brand"), outletId, batch.lookupIds);
        JsonNode family = item.get("family");
        Long familyId = ensureLookup("family", family == null ? null : family.asText(null), outletId, batch.lookupIds);
        Long taxRateId = ensureTaxRate(text(item, "tax_rate_name"), taxRates);
        Long costTaxRateId = ensureTaxRate(text(item, "cost_tax_rate_name"), taxRates);
        BigDecimal caseQuantity = decimal(item, "case_quantity");
        BigDecimal cost = decimal(item, "cost");
        String type = text(item, "source_type");
        if (type == null || type.isBlank()) type = "STANDARD";
        String description = text(item, "description");
        String image = text(item, "image");
        String sourceStatus = text(item, "source_status");
        JsonNode rawPayload = item.path("raw_payload");
        boolean sourceDeleted = flag(item, "source_deleted", false) == 1
                || rawPayload.path("deleted").asBoolean(false)
                || !rawPayload.path("deletedAt").isMissingNode() && !rawPayload.path("deletedAt").isNull();
        String productStatus = "ACTIVE".equalsIgnoreCase(sourceStatus) && !sourceDeleted ? "ACTIVE" : "INACTIVE";
        String alternateImages = item.has("alternate_images") ? objectMapper.writeValueAsString(item.get("alternate_images")) : "[]";
        if (productId == null) {
            String sql = "INSERT INTO product (name,type,status,description,category_id,brand_id,family_id,tax_rate_id,cost_tax_rate_id,cost,case_quantity,cost_percentage,track_inventory,use_scales,use_barcode_templates,prevent_manual_discounts,request_price,request_quantity,order_notes,invoice_notes,image,alternate_images,mdb_id,outlet_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?) RETURNING id";
            productId = jdbc.queryForObject(sql, Long.class, name, type, productStatus, description, categoryId, brandId, familyId, taxRateId, costTaxRateId, cost, caseQuantity, flag(item, "cost_percentage", false), flag(item, "track_inventory", true), flag(item, "use_scales", false), flag(item, "use_barcode_templates", false), flag(item, "prevent_manual_discounts", false), flag(item, "request_price", false), flag(item, "request_quantity", false), text(item, "order_notes"), text(item, "invoice_notes"), image, alternateImages, mdbId, outletId);
        } else {
            batch.productUpdates.put(productId, new Object[]{name, type, productStatus, description, categoryId, brandId, familyId, taxRateId, costTaxRateId, cost, caseQuantity, flag(item, "cost_percentage", false), flag(item, "track_inventory", true), flag(item, "use_scales", false), flag(item, "use_barcode_templates", false), flag(item, "prevent_manual_discounts", false), flag(item, "request_price", false), flag(item, "request_quantity", false), text(item, "order_notes"), text(item, "invoice_notes"), image, alternateImages, mdbId, outletId, productId});
        }
        collectProductPrices(productId, item, outletId, batch);
        collectProductBarcodes(productId, item, batch);
        collectProductTags(productId, item, outletId, batch);
        return productId;
    }

    private void flushBusinessProductBatch(ProductImportBatch batch, long outletId) {
        if (!batch.productUpdates.isEmpty()) {
            jdbc.batchUpdate("UPDATE product SET name=?,type=?,status=?,description=?,category_id=?,brand_id=?,family_id=?,tax_rate_id=?,cost_tax_rate_id=?,cost=?,case_quantity=?,cost_percentage=?,track_inventory=?,use_scales=?,use_barcode_templates=?,prevent_manual_discounts=?,request_price=?,request_quantity=?,order_notes=?,invoice_notes=?,image=COALESCE(?,image),alternate_images=?::jsonb,mdb_id=?,outlet_id=? WHERE id=?",
                    new ArrayList<>(batch.productUpdates.values()));
        }

        if (!batch.pricesByProduct.isEmpty()) {
            deleteProductPrices(new ArrayList<>(batch.pricesByProduct.keySet()), outletId);
            List<Object[]> prices = batch.pricesByProduct.values().stream().flatMap(List::stream).toList();
            if (!prices.isEmpty()) {
                jdbc.batchUpdate("INSERT INTO product_price (product_id,quantity,price,price_ex,outlet_id) VALUES (?,?,?,?,?)", prices);
            }
        }

        if (!batch.barcodes.isEmpty()) {
            Set<String> codes = new LinkedHashSet<>();
            for (BarcodeWrite barcode : batch.barcodes) codes.add(barcode.code());
            Map<String, Long> owners = new LinkedHashMap<>();
            for (Map<String, Object> row : queryRowsInChunks(
                    "SELECT code, product_id FROM product_barcode WHERE outlet_id=? AND code IN (%s)",
                    List.of(outletId), new ArrayList<>(codes))) {
                owners.put(String.valueOf(row.get("code")), longValue(row.get("product_id")));
            }
            Map<String, BarcodeWrite> inserts = new LinkedHashMap<>();
            Map<String, BarcodeWrite> updates = new LinkedHashMap<>();
            for (BarcodeWrite barcode : batch.barcodes) {
                Long owner = owners.get(barcode.code());
                if (owner != null && owner != barcode.productId()) continue;
                if (owner == null) {
                    owners.put(barcode.code(), barcode.productId());
                    inserts.put(barcode.code(), barcode);
                } else if (inserts.containsKey(barcode.code())) {
                    inserts.put(barcode.code(), barcode);
                } else {
                    updates.put(barcode.code(), barcode);
                }
            }
            if (!inserts.isEmpty()) {
                jdbc.batchUpdate("INSERT INTO product_barcode (product_id,code,quantity,outlet_id) VALUES (?,?,?,?)",
                        inserts.values().stream().map(value -> new Object[]{value.productId(), value.code(), value.quantity(), outletId}).toList());
            }
            if (!updates.isEmpty()) {
                jdbc.batchUpdate("UPDATE product_barcode SET quantity=? WHERE product_id=? AND code=? AND outlet_id=?",
                        updates.values().stream().map(value -> new Object[]{value.quantity(), value.productId(), value.code(), outletId}).toList());
            }
        }

        if (!batch.productsWithTags.isEmpty()) {
            deleteProductTags(new ArrayList<>(batch.productsWithTags));
            List<Object[]> tags = batch.tagsByProduct.values().stream()
                    .flatMap(byTag -> byTag.values().stream()).toList();
            if (!tags.isEmpty()) {
                jdbc.batchUpdate("INSERT INTO product_tag (product_id,tag_id) VALUES (?,?)", tags);
            }
        }

        if (!batch.sourceMappings.isEmpty()) {
            jdbc.batchUpdate("INSERT INTO shopfront_product_mapping (store_key,source_product_id,pos_product_id,match_type,status) VALUES (?,?,?,'SHOPFRONT','MAPPED') ON CONFLICT (store_key,source_product_id) DO UPDATE SET pos_product_id=EXCLUDED.pos_product_id,match_type='SHOPFRONT',status='MAPPED',updated_at=CURRENT_TIMESTAMP",
                    new ArrayList<>(batch.sourceMappings.values()));
        }
    }

    private void collectProductPrices(long productId, JsonNode item, long outletId, ProductImportBatch batch) {
        List<Object[]> prices = new ArrayList<>();
        boolean hasUnitPrice = false;
        JsonNode sourcePrices = item.get("prices");
        if (sourcePrices != null && sourcePrices.isArray()) {
            for (JsonNode price : sourcePrices) {
                BigDecimal quantity = decimal(price, "quantity");
                BigDecimal value = decimal(price, "price");
                if (quantity == null || quantity.signum() <= 0 || value == null) continue;
                BigDecimal priceEx = decimal(price, "price_ex");
                if (priceEx == null) priceEx = decimal(price, "priceEx");
                prices.add(new Object[]{productId, quantity, value, priceEx, outletId});
                if (quantity.compareTo(BigDecimal.ONE) == 0) hasUnitPrice = true;
            }
        }
        BigDecimal shelfPrice = decimal(item, "price");
        if (!hasUnitPrice && shelfPrice != null && shelfPrice.signum() >= 0) {
            prices.add(new Object[]{productId, BigDecimal.ONE, shelfPrice, null, outletId});
        }
        batch.pricesByProduct.put(productId, prices);
    }

    private void collectProductBarcodes(long productId, JsonNode item, ProductImportBatch batch) {
        JsonNode barcodes = item.get("barcodes");
        if (barcodes == null || !barcodes.isArray()) return;
        for (JsonNode barcode : barcodes) {
            String code = text(barcode, "code");
            if (code != null && !code.isBlank()) {
                batch.barcodes.add(new BarcodeWrite(productId, code, decimal(barcode, "quantity", BigDecimal.ONE)));
            }
        }
    }

    private void collectProductTags(long productId, JsonNode item, long outletId, ProductImportBatch batch) {
        JsonNode tags = item.get("tags");
        if (tags == null || !tags.isArray()) return;
        batch.productsWithTags.add(productId);
        Map<Long, Object[]> values = new LinkedHashMap<>();
        try {
            for (JsonNode tag : tags) {
                String name = tag.isTextual() ? tag.asText() : text(tag, "name");
                if (name == null || name.isBlank()) continue;
                Long tagId = ensureLookup("tag", name, outletId, batch.lookupIds);
                if (tagId != null) values.put(tagId, new Object[]{productId, tagId});
            }
            batch.tagsByProduct.put(productId, values);
        } catch (Exception e) {
            log.warn("Shopfront tag sync skipped for product {}: {}", productId, e.getMessage());
        }
    }

    private void deleteProductPrices(List<Long> productIds, long outletId) {
        deleteByProductIds("product_price", productIds, outletId);
    }

    private void deleteProductTags(List<Long> productIds) {
        deleteByProductIds("product_tag", productIds, null);
    }

    private void deleteByProductIds(String table, List<Long> productIds, Long outletId) {
        for (int start = 0; start < productIds.size(); start += 400) {
            List<Long> chunk = productIds.subList(start, Math.min(start + 400, productIds.size()));
            String placeholders = String.join(",", java.util.Collections.nCopies(chunk.size(), "?"));
            List<Object> args = new ArrayList<>();
            if (outletId != null) args.add(outletId);
            args.addAll(chunk);
            String sql = "DELETE FROM " + table + (outletId == null ? " WHERE product_id IN (" : " WHERE outlet_id=? AND product_id IN (")
                    + placeholders + ")";
            jdbc.update(sql, args.toArray());
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

    private Long ensureLookup(String table, String name, long outletId, Map<String, Long> cache) {
        if (name == null || name.isBlank()) return null;
        String key = table + ":" + name.trim().toLowerCase(Locale.ROOT);
        if (cache.containsKey(key)) return cache.get(key);
        Long id = ensureLookup(table, name, outletId);
        cache.put(key, id);
        return id;
    }

    private Long ensureTaxRate(String name, Map<String, Long> taxRates) {
        if (name == null || name.isBlank()) return null;
        Long taxRateId = taxRates.get(name.trim().toLowerCase(Locale.ROOT));
        if (taxRateId == null) throw new IllegalArgumentException("No matching Orithos tax rate for source tax code: " + name);
        return taxRateId;
    }

    private Long findTaxRateId(String name, long outletId) {
        if (name == null || name.isBlank()) return null;
        List<Long> matches = jdbc.queryForList(
                "SELECT id FROM tax_rate WHERE lower(trim(name))=lower(trim(?)) AND deleted_at IS NULL AND outlet_id IN (?,1) ORDER BY CASE WHEN outlet_id=? THEN 0 ELSE 1 END LIMIT 1",
                Long.class, name, outletId, outletId);
        return matches.isEmpty() ? null : matches.get(0);
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
    private String firstText(JsonNode node, String... keys) {
        for (String key : keys) {
            String value = text(node, key);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private BigDecimal firstDecimal(JsonNode node, String... keys) {
        for (String key : keys) {
            BigDecimal value = decimal(node, key, null);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private BigDecimal decimal(JsonNode node, String key) { return decimal(node, key, null); }
    private BigDecimal decimal(JsonNode node, String key, BigDecimal fallback) {
        try {
            JsonNode value = node.get(key);
            if (value == null || value.isNull()) return fallback;
            if (value.isTextual()) {
                String text = value.asText().trim();
                return text.isBlank() ? fallback : new BigDecimal(text);
            }
            if (value.isNumber()) {
                // Prefer textual JSON digits when present to avoid Double binary drift.
                String text = value.asText();
                if (text != null && !text.isBlank()) {
                    return new BigDecimal(text);
                }
                return value.decimalValue();
            }
            String text = value.asText();
            return text == null || text.isBlank() ? fallback : new BigDecimal(text.trim());
        } catch (Exception e) {
            return fallback;
        }
    }

    private int count(String table, String store) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE store_key = ?", Integer.class, store);
        return count == null ? 0 : count;
    }

    private void persistShadow(String type, String store, Map<String, Object> mapping, JsonNode items, boolean completeInventorySnapshot) throws Exception {
        boolean postgres = isPostgres();
        String outlet = String.valueOf(mapping.getOrDefault("outlet_id", ""));
        if ("products".equals(type)) {
            String sql = postgres
                    ? "INSERT INTO shopfront_product (store_key,source_id,name,sku,barcode,category,brand,cost,price,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (store_key,source_id) DO UPDATE SET name=EXCLUDED.name,sku=EXCLUDED.sku,barcode=EXCLUDED.barcode,category=EXCLUDED.category,brand=EXCLUDED.brand,cost=EXCLUDED.cost,price=EXCLUDED.price,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                    : "INSERT INTO shopfront_product (store_key,source_id,name,sku,barcode,category,brand,cost,price,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),sku=VALUES(sku),barcode=VALUES(barcode),category=VALUES(category),brand=VALUES(brand),cost=VALUES(cost),price=VALUES(price),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
            List<Object[]> rows = new ArrayList<>();
            for (JsonNode item : items) {
                String source = text(item, "source_id");
                if (source.isBlank()) continue;
                rows.add(new Object[]{store, source, text(item, "name"), text(item, "sku"),
                        text(item, "barcode"), text(item, "category"), text(item, "brand"),
                        decimal(item, "cost"), decimal(item, "price"), objectMapper.writeValueAsString(item)});
            }
            if (!rows.isEmpty()) jdbc.batchUpdate(sql, rows);
            // Product batches can arrive after their historical sales. Repair
            // those durable sale-line mirrors from the source ID in one
            // idempotent statement so old lines do not stay unnamed forever.
            jdbc.update("UPDATE shopfront_sale_item si SET product_name=(SELECT sp.name FROM shopfront_product sp WHERE sp.store_key=si.store_key AND sp.source_id=si.source_product_id), synced_at=CURRENT_TIMESTAMP WHERE si.store_key=? AND (si.product_name IS NULL OR TRIM(si.product_name)='') AND EXISTS (SELECT 1 FROM shopfront_product sp WHERE sp.store_key=si.store_key AND sp.source_id=si.source_product_id AND sp.name IS NOT NULL AND TRIM(sp.name)<>'')", store);
        } else if ("inventory".equals(type)) {
            if (completeInventorySnapshot) {
                jdbc.update("DELETE FROM shopfront_inventory WHERE store_key = ?", store);
            }
            String sql = postgres
                    ? "INSERT INTO shopfront_inventory (store_key,source_product_id,outlet_id,quantity,snapshot_at,raw_payload) VALUES (?,?,?,?,?,?) ON CONFLICT (store_key,source_product_id,outlet_id) DO UPDATE SET quantity=EXCLUDED.quantity,snapshot_at=EXCLUDED.snapshot_at,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                    : "INSERT INTO shopfront_inventory (store_key,source_product_id,outlet_id,quantity,snapshot_at,raw_payload) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity),snapshot_at=VALUES(snapshot_at),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
            List<Object[]> rows = new ArrayList<>();
            for (JsonNode item : items) {
                String source = text(item, "source_id");
                if (source.isBlank()) continue;
                String itemOutlet = text(item, "outlet_id");
                if (itemOutlet == null || itemOutlet.isBlank()) itemOutlet = outlet;
                rows.add(new Object[]{store, source, itemOutlet, decimal(item, "quantity"),
                        text(item, "timestamp"), objectMapper.writeValueAsString(item)});
            }
            if (!rows.isEmpty()) jdbc.batchUpdate(sql, rows);
        } else if ("sales".equals(type)) {
            for (JsonNode sale : items) {
                String external = text(sale, "external_id");
                if (external.isBlank()) continue;
                boolean sourceComplete = sale.path("source_complete").asBoolean(false);
                String createdAt = firstText(sale, "created_at", "createdAt");
                java.sql.Date businessDate = null;
                ShopfrontNativeSaleImporter.SoldAt soldAt = ShopfrontNativeSaleImporter.parseSoldAt(createdAt);
                if (soldAt != null) {
                    businessDate = java.sql.Date.valueOf(soldAt.businessDate());
                }
                String sql = postgres
                        ? "INSERT INTO shopfront_sale (store_key,external_id,invoice_id,status,created_at,updated_at,business_date,total_price,total_tax,total_discount,total_cost,customer_reference,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (store_key,external_id) DO UPDATE SET invoice_id=EXCLUDED.invoice_id,status=EXCLUDED.status,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,business_date=EXCLUDED.business_date,total_price=EXCLUDED.total_price,total_tax=EXCLUDED.total_tax,total_discount=EXCLUDED.total_discount,total_cost=EXCLUDED.total_cost,customer_reference=EXCLUDED.customer_reference,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                        : "INSERT INTO shopfront_sale (store_key,external_id,invoice_id,status,created_at,updated_at,business_date,total_price,total_tax,total_discount,total_cost,customer_reference,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE invoice_id=VALUES(invoice_id),status=VALUES(status),created_at=VALUES(created_at),updated_at=VALUES(updated_at),business_date=VALUES(business_date),total_price=VALUES(total_price),total_tax=VALUES(total_tax),total_discount=VALUES(total_discount),total_cost=VALUES(total_cost),customer_reference=VALUES(customer_reference),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                jdbc.update(sql, store, external,
                        firstText(sale, "invoice_id", "invoiceId"),
                        firstText(sale, "status"),
                        createdAt,
                        firstText(sale, "updated_at", "updatedAt"),
                        businessDate,
                        firstDecimal(sale, "total_price", "totalPrice"),
                        firstDecimal(sale, "total_tax", "totalTax"),
                        firstDecimal(sale, "total_discount", "totalDiscount"),
                        firstDecimal(sale, "total_cost", "totalCost"),
                        firstText(sale, "customer_reference", "customerReference"),
                        objectMapper.writeValueAsString(sale));
                JsonNode saleItems = sale.path("items");
                Set<String> currentLineKeys = new HashSet<>();
                if (saleItems.isArray()) {
                    int index = 0;
                    for (JsonNode item : saleItems) {
                        String lineKey = childKey(item, "id", index);
                        currentLineKeys.add(lineKey);
                        String itemSql = postgres
                                ? "INSERT INTO shopfront_sale_item (store_key,external_sale_id,line_key,source_product_id,product_name,quantity,unit_price,line_total,cost,tax,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (store_key,external_sale_id,line_key) DO UPDATE SET source_product_id=EXCLUDED.source_product_id,product_name=EXCLUDED.product_name,quantity=EXCLUDED.quantity,unit_price=EXCLUDED.unit_price,line_total=EXCLUDED.line_total,cost=EXCLUDED.cost,tax=EXCLUDED.tax,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                                : "INSERT INTO shopfront_sale_item (store_key,external_sale_id,line_key,source_product_id,product_name,quantity,unit_price,line_total,cost,tax,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE source_product_id=VALUES(source_product_id),product_name=VALUES(product_name),quantity=VALUES(quantity),unit_price=VALUES(unit_price),line_total=VALUES(line_total),cost=VALUES(cost),tax=VALUES(tax),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                        jdbc.update(itemSql, store, external, lineKey, text(item,"source_product_id"), text(item,"name"), decimal(item,"quantity"), decimal(item,"unit_price"), decimal(item,"line_total"), decimal(item,"cost"), decimal(item,"tax"), objectMapper.writeValueAsString(item));
                        index++;
                    }
                }
                if (sourceComplete) reconcileSaleChildren("shopfront_sale_item", "line_key", store, external, currentLineKeys);
                JsonNode payments = sale.path("payments");
                Set<String> currentPaymentKeys = new HashSet<>();
                if (payments.isArray()) {
                    int index = 0;
                    for (JsonNode payment : payments) {
                        String paymentKey = childKey(payment, "id", index);
                        currentPaymentKeys.add(paymentKey);
                        String paymentSql = postgres
                                ? "INSERT INTO shopfront_sale_payment (store_key,external_sale_id,payment_key,amount,status,subtype,raw_payload) VALUES (?,?,?,?,?,?,?) ON CONFLICT (store_key,external_sale_id,payment_key) DO UPDATE SET amount=EXCLUDED.amount,status=EXCLUDED.status,subtype=EXCLUDED.subtype,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                                : "INSERT INTO shopfront_sale_payment (store_key,external_sale_id,payment_key,amount,status,subtype,raw_payload) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE amount=VALUES(amount),status=VALUES(status),subtype=VALUES(subtype),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                        jdbc.update(paymentSql, store, external, paymentKey, decimal(payment,"amount"), text(payment,"status"), text(payment,"subtype"), objectMapper.writeValueAsString(payment));
                        index++;
                    }
                }
                if (sourceComplete) reconcileSaleChildren("shopfront_sale_payment", "payment_key", store, external, currentPaymentKeys);
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
        } else if ("customers".equals(type)) {
            for (JsonNode item : items) {
                String source = text(item, "source_id");
                if (source == null || source.isBlank()) continue;
                String sql = postgres
                        ? "INSERT INTO shopfront_customer (store_key,source_id,client_id,code,name,email,phone,mobile,deleted,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (store_key,source_id) DO UPDATE SET client_id=EXCLUDED.client_id,code=EXCLUDED.code,name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,mobile=EXCLUDED.mobile,deleted=EXCLUDED.deleted,raw_payload=EXCLUDED.raw_payload,synced_at=CURRENT_TIMESTAMP"
                        : "INSERT INTO shopfront_customer (store_key,source_id,client_id,code,name,email,phone,mobile,deleted,raw_payload) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE client_id=VALUES(client_id),code=VALUES(code),name=VALUES(name),email=VALUES(email),phone=VALUES(phone),mobile=VALUES(mobile),deleted=VALUES(deleted),raw_payload=VALUES(raw_payload),synced_at=CURRENT_TIMESTAMP";
                jdbc.update(sql, store, source, text(item, "client_id"), text(item, "code"),
                        text(item, "name"), text(item, "email"), text(item, "phone"), text(item, "mobile"),
                        item.hasNonNull("deleted") ? item.get("deleted").asBoolean() : null,
                        objectMapper.writeValueAsString(item.path("raw_payload").isMissingNode()
                                ? item : item.path("raw_payload")));
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

    private void reconcileSaleChildren(String table, String keyColumn, String store, String external, Set<String> currentKeys) {
        if (currentKeys.isEmpty()) {
            jdbc.update("DELETE FROM " + table + " WHERE store_key = ? AND external_sale_id = ?", store, external);
            return;
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(currentKeys.size(), "?"));
        List<Object> args = new ArrayList<>();
        args.add(store);
        args.add(external);
        args.addAll(currentKeys);
        jdbc.update("DELETE FROM " + table + " WHERE store_key = ? AND external_sale_id = ? AND " + keyColumn + " NOT IN (" + placeholders + ")", args.toArray());
    }

    private String childKey(JsonNode child, String idField, int index) {
        JsonNode id = child.path(idField);
        if (id.isMissingNode() || id.isNull()) id = child.path("raw_payload").path(idField);
        return id.isMissingNode() || id.isNull() || id.asText().isBlank() ? Integer.toString(index) : id.asText();
    }

    private com.fasterxml.jackson.databind.node.ObjectNode rebuildPurchaseOrderNode(Map<String, Object> row) {
        JsonNode raw = parseJsonObject(row.get("raw_payload"));
        var node = objectMapper.createObjectNode();
        String sourceId = firstNonBlank(stringValue(row.get("source_id")), text(raw, "id"));
        if (sourceId == null || sourceId.isBlank()) {
            throw new IllegalArgumentException("Purchase order mirror row is missing source_id");
        }
        node.put("source_id", sourceId);
        String supplierSourceId = firstNonBlank(stringValue(row.get("supplier_source_id")), text(raw, "supplier_source_id"));
        if (supplierSourceId == null || supplierSourceId.isBlank()) {
            JsonNode products = raw.path("products");
            if (products.isArray()) {
                for (JsonNode line : products) {
                    String candidate = text(line.path("supplier"), "id");
                    if (candidate != null && !candidate.isBlank()) {
                        supplierSourceId = candidate;
                        break;
                    }
                }
            }
        }
        if (supplierSourceId != null && !supplierSourceId.isBlank()) {
            node.put("supplier_source_id", supplierSourceId);
        }
        putText(node, "status", firstNonBlank(stringValue(row.get("status")), text(raw, "status")));
        putText(node, "order_date", firstNonBlank(stringValue(row.get("order_date")), text(raw, "orderDate"), text(raw, "order_date")));
        BigDecimal totalCost = row.get("total_cost") != null
                ? decimalObject(row.get("total_cost"))
                : firstDecimal(raw, "totalCost", "total_cost");
        if (totalCost != null) {
            node.put("total_cost", totalCost);
        }
        node.set("raw_payload", raw.isMissingNode() || raw.isNull() ? objectMapper.createObjectNode() : raw);
        return node;
    }

    private JsonNode parseJsonObject(Object raw) {
        if (raw == null) {
            return objectMapper.createObjectNode();
        }
        if (raw instanceof JsonNode node) {
            return node.isObject() ? node : objectMapper.createObjectNode();
        }
        String text = String.valueOf(raw).trim();
        if (text.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            JsonNode parsed = objectMapper.readTree(text);
            return parsed.isObject() ? parsed : objectMapper.createObjectNode();
        } catch (Exception ex) {
            throw new IllegalArgumentException("Purchase order raw_payload is not valid JSON", ex);
        }
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

    private void putText(com.fasterxml.jackson.databind.node.ObjectNode node, String field, String value) {
        if (value != null && !value.isBlank()) {
            node.put(field, value);
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
