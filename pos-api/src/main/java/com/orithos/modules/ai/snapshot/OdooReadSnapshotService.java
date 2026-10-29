package com.orithos.modules.ai.snapshot;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.PermissionAccess;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only Odoo synchronisation for deterministic pricing/replenishment inputs.
 * The service appends immutable snapshots and never calls a write RPC.
 */
@Service
public class OdooReadSnapshotService {
    private static final Logger log = LoggerFactory.getLogger(OdooReadSnapshotService.class);
    private static final DateTimeFormatter ODOO_UTC = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final List<String> PAID_STATES = List.of("paid", "done", "invoiced");
    private static final int LIMIT = 1000;

    private final ObjectMapper mapper;
    private final VendorMapper vendors;
    private final JdbcTemplate jdbc;
    private final PermissionAccess permissions;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final String baseUrl;
    private final String database;
    private final String username;
    private final String password;

    public OdooReadSnapshotService(ObjectMapper mapper, VendorMapper vendors, JdbcTemplate jdbc,
                                   PermissionAccess permissions,
                                   @Value("${ODOO_BASE_URL:}") String baseUrl,
                                   @Value("${ODOO_DATABASE:aipos}") String database,
                                   @Value("${ODOO_SERVICE_USERNAME:}") String username,
                                   @Value("${ODOO_SERVICE_PASSWORD:}") String password) {
        this.mapper = mapper;
        this.vendors = vendors;
        this.jdbc = jdbc;
        this.permissions = permissions;
        this.baseUrl = trim(baseUrl);
        this.database = trim(database);
        this.username = trim(username);
        this.password = password == null ? "" : password;
    }

    public SyncResult sync(TenantContext tenant) {
        permissions.requirePermission("ai.report.query");
        if (tenant == null || tenant.requireOutletId() == null) {
            throw new BusinessException(40010, "A store outlet is required");
        }
        Vendor vendor = vendors.findById(tenant.vendorId());
        if (vendor == null || vendor.getOdooCompanyId() == null || vendor.getOdooCompanyId() <= 0
                || !"ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())) {
            throw new BusinessException(50320, "Odoo tenant binding is unavailable");
        }
        if (baseUrl.isBlank() || database.isBlank() || username.isBlank() || password.isBlank()) {
            throw new BusinessException(50320, "Odoo read synchronisation is not configured");
        }
        Instant asOf = Instant.now();
        try {
            String session = authenticate();
            Map<String, Object> context = context(vendor);
            List<Map<String, Object>> products = searchRead(session, "product.product",
                    List.of(List.of("available_in_pos", "=", true),
                            List.of("company_id", "=", vendor.getOdooCompanyId())),
                    List.of("id", "name", "display_name", "default_code", "barcode", "list_price",
                            "standard_price", "qty_available", "virtual_available", "uom_id", "write_date"),
                    context, LIMIT, "id asc");
            List<Map<String, Object>> sales = readGroup(session, "pos.order.line",
                    List.of(List.of("order_id.company_id", "=", vendor.getOdooCompanyId()),
                            List.of("order_id.state", "in", PAID_STATES),
                            List.of("order_id.date_order", ">=", ODOO_UTC.format(asOf.minus(Duration.ofDays(56)).atZone(ZoneOffset.UTC)))),
                    List.of("qty:sum", "price_subtotal:sum"), List.of("product_id"), context, LIMIT);
            int productRows = 0;
            int inventoryRows = 0;
            int priceRows = 0;
            for (Map<String, Object> product : products) {
                String id = String.valueOf(product.getOrDefault("id", ""));
                if (id.isBlank()) continue;
                insert(tenant, "PRODUCT", id, product, asOf);
                productRows++;
                insert(tenant, "INVENTORY", id, Map.of(
                        "productId", product.get("id"),
                        "qtyAvailable", product.get("qty_available"),
                        "virtualAvailable", product.get("virtual_available"),
                        "uom", product.get("uom_id")), asOf);
                inventoryRows++;
                // Keep the price fact separate so pricing decisions can be replayed
                // without treating a later product snapshot as the historical price.
                Map<String, Object> price = new LinkedHashMap<>();
                price.put("productId", product.get("id"));
                price.put("listPrice", product.get("list_price"));
                price.put("currency", "AUD");
                price.put("sourceWriteDate", product.get("write_date"));
                insert(tenant, "PRICE", id, price, asOf);
                priceRows++;
            }
            int saleRows = 0;
            for (Map<String, Object> sale : sales) {
                Object relation = sale.get("product_id");
                String id = relationId(relation);
                if (id == null) continue;
                insert(tenant, "SALE_LINE", id, sale, asOf);
                saleRows++;
            }
            return new SyncResult(tenant.vendorId(), tenant.requireOutletId(), asOf,
                    productRows, inventoryRows, priceRows, saleRows, "VALID");
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Odoo read snapshot sync failed vendorId={} outletId={} causeType={}",
                    tenant.vendorId(), tenant.requireOutletId(), e.getClass().getSimpleName());
            throw new BusinessException(50320, "Odoo read synchronisation failed");
        }
    }

    private void insert(TenantContext tenant, String type, String sourceId, Object payload, Instant asOf)
            throws JsonProcessingException {
        String json = mapper.writeValueAsString(payload);
        jdbc.update("""
                INSERT INTO odoo_read_snapshot
                (vendor_id, outlet_id, object_type, source_record_id, source_version,
                 event_time, ingested_at, data_quality_status, payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
                """, tenant.vendorId(), tenant.requireOutletId(), type, sourceId,
                sha256(json), asOf, asOf, "VALID", json);
    }

    private String authenticate() throws Exception {
        ObjectNode params = mapper.createObjectNode();
        params.put("db", database); params.put("login", username); params.put("password", password);
        HttpResponse<String> response = post("/web/session/authenticate", params, null);
        JsonNode root = mapper.readTree(response.body());
        if (root.path("result").path("uid").asLong(0) <= 0) throw new IllegalStateException("Odoo authentication failed");
        for (String cookie : response.headers().allValues("set-cookie")) {
            int start = cookie.indexOf("session_id=");
            if (start >= 0) {
                String value = cookie.substring(start + 11);
                int end = value.indexOf(';');
                return end < 0 ? value : value.substring(0, end);
            }
        }
        throw new IllegalStateException("Odoo session cookie missing");
    }

    private List<Map<String, Object>> searchRead(String session, String model, List<?> domain, List<String> fields,
                                                  Map<String, Object> context, int limit, String order) throws Exception {
        Map<String, Object> kwargs = new LinkedHashMap<>();
        kwargs.put("fields", fields); kwargs.put("limit", limit); kwargs.put("order", order); kwargs.put("context", context);
        return rows(call(session, model, "search_read", List.of(domain), kwargs));
    }

    private List<Map<String, Object>> readGroup(String session, String model, List<?> domain, List<String> fields,
                                                 List<String> groupBy, Map<String, Object> context, int limit) throws Exception {
        Map<String, Object> kwargs = new LinkedHashMap<>();
        kwargs.put("lazy", false); kwargs.put("limit", limit); kwargs.put("context", context);
        return rows(call(session, model, "read_group", List.of(domain, fields, groupBy), kwargs));
    }

    private JsonNode call(String session, String model, String method, List<?> args, Map<String, Object> kwargs) throws Exception {
        ObjectNode params = mapper.createObjectNode(); params.put("model", model); params.put("method", method);
        params.set("args", mapper.valueToTree(args)); params.set("kwargs", mapper.valueToTree(kwargs));
        JsonNode root = mapper.readTree(post("/web/dataset/call_kw", params, session).body());
        if (root.hasNonNull("error") || !root.path("result").isArray()) throw new IllegalStateException("Odoo read RPC failed");
        return root.path("result");
    }

    private HttpResponse<String> post(String path, ObjectNode params, String session) throws Exception {
        ObjectNode body = mapper.createObjectNode(); body.put("jsonrpc", "2.0"); body.put("method", "call");
        body.set("params", params); body.put("id", System.currentTimeMillis());
        HttpRequest.Builder request = HttpRequest.newBuilder().uri(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(25)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        if (session != null) request.header("Cookie", "session_id=" + session);
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private List<Map<String, Object>> rows(JsonNode node) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (JsonNode row : node) result.add(mapper.convertValue(row, Map.class));
        return result;
    }

    private static Map<String, Object> context(Vendor vendor) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("allowed_company_ids", List.of(vendor.getOdooCompanyId()));
        context.put("force_company", vendor.getOdooCompanyId());
        if (vendor.getOdooWarehouseId() != null) context.put("warehouse", vendor.getOdooWarehouseId());
        return context;
    }

    private static String relationId(Object relation) {
        if (relation instanceof List<?> list && !list.isEmpty() && list.get(0) != null) return String.valueOf(list.get(0));
        return null;
    }

    private static String trim(String value) { return value == null ? "" : value.trim().replaceAll("/+$", ""); }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) { throw new IllegalStateException("snapshot hash unavailable", e); }
    }

    public record SyncResult(long vendorId, long outletId, Instant dataAsOf,
                             int products, int inventories, int prices, int sales, String dataQualityStatus) { }
}
