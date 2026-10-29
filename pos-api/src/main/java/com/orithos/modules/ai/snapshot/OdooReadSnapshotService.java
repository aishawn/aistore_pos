package com.orithos.modules.ai.snapshot;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.odoo.OdooSalesDomain;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Pulls a bounded, tenant-scoped read model from Odoo into PostgreSQL.
 * Odoo is never written by this service and all domains are bound to the
 * provisioned company before the RPC is sent.
 */
@Service
public class OdooReadSnapshotService {
    private static final Logger log = LoggerFactory.getLogger(OdooReadSnapshotService.class);
    private static final int MAX_PRODUCTS = 2_000;
    private static final int MAX_SALES_GROUPS = 2_000;
    private static final int MAX_SUPPLIER_ROWS = 5_000;
    private static final int MAX_PURCHASE_LINES = 5_000;
    private static final int DEFAULT_HISTORY_DAYS = 56;

    private final ObjectMapper mapper;
    private final VendorMapper vendorMapper;
    private final JdbcTemplate jdbc;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final String baseUrl;
    private final String database;
    private final String username;
    private final String password;

    public OdooReadSnapshotService(
            ObjectMapper mapper,
            VendorMapper vendorMapper,
            JdbcTemplate jdbc,
            @Value("${ODOO_BASE_URL:}") String baseUrl,
            @Value("${ODOO_DATABASE:aipos}") String database,
            @Value("${ODOO_SERVICE_USERNAME:}") String username,
            @Value("${ODOO_SERVICE_PASSWORD:}") String password) {
        this.mapper = mapper;
        this.vendorMapper = vendorMapper;
        this.jdbc = jdbc;
        this.baseUrl = normalize(baseUrl);
        this.database = database == null ? "" : database.trim();
        this.username = username == null ? "" : username.trim();
        this.password = password == null ? "" : password;
    }

    public boolean isConfigured() {
        return !baseUrl.isBlank() && !database.isBlank() && !username.isBlank() && !password.isBlank();
    }

    @Transactional
    public OdooReadSnapshotSyncResult sync(TenantContext tenant, int requestedHistoryDays) {
        if (tenant == null) throw new BusinessException(40100, "Unauthorized");
        Long outletId = tenant.requireOutletId();
        if (outletId == null || outletId <= 0) {
            throw new BusinessException(40010, "A current outlet is required for an AI data sync");
        }
        if (!isConfigured()) {
            throw new BusinessException(50320, "Odoo read snapshot source is not configured");
        }
        Vendor vendor = vendorMapper.findById(tenant.vendorId());
        if (vendor == null || vendor.getOdooCompanyId() == null || vendor.getOdooCompanyId() <= 0
                || !"ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())) {
            throw new BusinessException(50320, "Odoo tenant binding is not ready");
        }

        int historyDays = Math.max(1, Math.min(requestedHistoryDays, 180));
        Instant dataAsOf = Instant.now();
        String sourceVersion = "odoo-" + dataAsOf.toString();
        try {
            String session = authenticate();
            Map<String, Object> context = context(vendor.getOdooCompanyId(), vendor.getOdooWarehouseId());
            List<Map<String, Object>> products = products(session, vendor.getOdooCompanyId(), context);
            Map<Long, Long> templateByProduct = new LinkedHashMap<>();
            for (Map<String, Object> product : products) {
                long productId = longId(product.get("id"));
                Long templateId = relationId(product.get("product_tmpl_id"));
                if (productId > 0 && templateId != null && templateId > 0) templateByProduct.put(productId, templateId);
            }
            Map<Long, Map<String, Object>> suppliers = suppliers(session, vendor.getOdooCompanyId(),
                    templateByProduct, context);
            Map<Long, Map<String, Object>> purchases = purchaseLines(session, vendor.getOdooCompanyId(), context);
            int productCount = 0;
            int inventoryCount = 0;
            int priceCount = 0;
            int supplierCount = 0;
            int purchaseLineCount = 0;
            for (Map<String, Object> product : products) {
                long id = longId(product.get("id"));
                if (id <= 0) continue;
                String quality = productQuality(product);
                insert(tenant, "PRODUCT", id, sourceVersion, dataAsOf, quality, product);
                productCount++;

                Map<String, Object> inventory = new LinkedHashMap<>();
                inventory.put("productId", id);
                inventory.put("name", text(product.get("display_name"), product.get("name")));
                inventory.put("qtyAvailable", product.get("qty_available"));
                inventory.put("virtualAvailable", product.get("virtual_available"));
                Map<String, Object> supplier = suppliers.get(id);
                Map<String, Object> purchase = purchases.get(id);
                inventory.put("supplierAvailable", supplier != null);
                if (supplier != null) {
                    inventory.put("leadTimeDays", supplier.get("leadTimeDays"));
                    inventory.put("minimumOrderQty", supplier.get("minimumOrderQty"));
                }
                inventory.put("onOrder", purchase == null ? 0d : purchase.get("onOrder"));
                insert(tenant, "INVENTORY", id, sourceVersion, dataAsOf,
                        product.get("qty_available") == null ? "INCOMPLETE" : quality, inventory);
                inventoryCount++;

                if (supplier != null) {
                    insert(tenant, "SUPPLIER", id, sourceVersion, dataAsOf, "VALID", supplier);
                    supplierCount++;
                }
                if (purchase != null) {
                    insert(tenant, "PURCHASE_LINE", id, sourceVersion, dataAsOf, "VALID", purchase);
                    purchaseLineCount++;
                }

                Map<String, Object> price = new LinkedHashMap<>();
                price.put("productId", id);
                price.put("name", text(product.get("display_name"), product.get("name")));
                price.put("listPrice", product.get("list_price"));
                price.put("standardPrice", product.get("standard_price"));
                price.put("taxes", product.get("taxes_id"));
                insert(tenant, "PRICE", id, sourceVersion, dataAsOf,
                        product.get("list_price") == null ? "INCOMPLETE" : quality, price);
                priceCount++;
            }

            String from = dataAsOf.minus(historyDays, ChronoUnit.DAYS).toString();
            List<Object> domain = OdooSalesDomain.forCompany(vendor.getOdooCompanyId(),
                    vendor.getOdooPosConfigId(), List.of("paid", "done", "invoiced"));
            domain.add(List.of("order_id.date_order", ">=", from.replace('T', ' ').substring(0, 19)));
            List<Map<String, Object>> sales = readGroup(session, "pos.order.line", domain,
                    List.of("qty:sum", "price_subtotal:sum"), List.of("product_id"), context, MAX_SALES_GROUPS);
            int salesCount = 0;
            String salesQuality = vendor.getOdooPosConfigId() != null && vendor.getOdooPosConfigId() > 0
                    ? "VALID" : "PARTIAL_SCOPE";
            for (Map<String, Object> sale : sales) {
                Long productId = relationId(sale.get("product_id"));
                if (productId == null || productId <= 0) continue;
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("productId", productId);
                payload.put("units", sale.get("qty"));
                payload.put("netSales", sale.get("price_subtotal"));
                payload.put("historyDays", historyDays);
                insert(tenant, "SALE_LINE", productId, sourceVersion, dataAsOf,
                        sale.get("qty") == null ? "INCOMPLETE" : salesQuality, payload);
                salesCount++;
            }
            Map<String, String> quality = new LinkedHashMap<>();
            quality.put("products", productCount == products.size() ? "VALID" : "PARTIAL");
            quality.put("sales", salesQuality);
            quality.put("suppliers", suppliers.isEmpty() ? "INCOMPLETE" : "VALID");
            quality.put("purchaseLines", "VALID");
            return new OdooReadSnapshotSyncResult("SYNCED", tenant.vendorId(), outletId, sourceVersion,
                    dataAsOf, productCount, inventoryCount, priceCount, salesCount,
                    supplierCount, purchaseLineCount, quality);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Odoo AI snapshot sync failed vendorId={} outletId={} causeType={}",
                    tenant.vendorId(), outletId, e.getClass().getSimpleName(), e);
            throw new BusinessException(50320, "Odoo read snapshot is temporarily unavailable");
        }
    }

    private void insert(TenantContext tenant, String type, long sourceId, String version, Instant eventTime,
                        String quality, Map<String, Object> payload) throws Exception {
        jdbc.update("""
                INSERT INTO odoo_read_snapshot
                  (vendor_id, outlet_id, object_type, source_record_id, source_version,
                   event_time, data_quality_status, payload)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)
                """, tenant.vendorId(), tenant.requireOutletId(), type, String.valueOf(sourceId), version,
                eventTime, quality == null ? "VALID" : quality, mapper.writeValueAsString(payload));
    }

    private List<Map<String, Object>> products(String session, long companyId, Map<String, Object> context)
            throws Exception {
        return searchRead(session, "product.product", List.of(
                        List.of("available_in_pos", "=", true), List.of("company_id", "=", companyId)),
                List.of("id", "name", "display_name", "default_code", "list_price", "standard_price",
                        "qty_available", "virtual_available", "taxes_id", "write_date", "product_tmpl_id"),
                context, MAX_PRODUCTS, "id asc");
    }

    private Map<Long, Map<String, Object>> suppliers(String session, long companyId,
                                                       Map<Long, Long> templateByProduct,
                                                       Map<String, Object> context) throws Exception {
        if (templateByProduct.isEmpty()) return Map.of();
        List<Map<String, Object>> rows = searchRead(session, "product.supplierinfo",
                List.of("|", List.of("company_id", "=", false), List.of("company_id", "=", companyId)),
                List.of("id", "product_id", "product_tmpl_id", "partner_id", "delay", "min_qty", "price"),
                context, MAX_SUPPLIER_ROWS, "id asc");
        Map<Long, Map<String, Object>> byProduct = new LinkedHashMap<>();
        Map<Long, Map<String, Object>> byTemplate = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("supplierInfoId", longId(row.get("id")));
            payload.put("supplierId", relationId(row.get("partner_id")));
            payload.put("supplierName", relationName(row.get("partner_id")));
            payload.put("leadTimeDays", row.get("delay"));
            payload.put("minimumOrderQty", row.get("min_qty"));
            payload.put("unitCost", row.get("price"));
            Long productId = relationId(row.get("product_id"));
            Long templateId = relationId(row.get("product_tmpl_id"));
            if (productId != null && productId > 0) byProduct.putIfAbsent(productId, payload);
            if (templateId != null && templateId > 0) byTemplate.putIfAbsent(templateId, payload);
        }
        for (Map.Entry<Long, Long> entry : templateByProduct.entrySet()) {
            if (!byProduct.containsKey(entry.getKey()) && byTemplate.containsKey(entry.getValue())) {
                byProduct.put(entry.getKey(), new LinkedHashMap<>(byTemplate.get(entry.getValue())));
            }
        }
        return byProduct;
    }

    private Map<Long, Map<String, Object>> purchaseLines(String session, long companyId,
                                                          Map<String, Object> context) throws Exception {
        List<Map<String, Object>> rows = searchRead(session, "purchase.order.line",
                List.of(List.of("company_id", "=", companyId),
                        List.of("state", "in", List.of("purchase", "done"))),
                List.of("id", "product_id", "product_qty", "qty_received", "date_planned", "order_id"),
                context, MAX_PURCHASE_LINES, "date_planned asc, id asc");
        Map<Long, Map<String, Object>> result = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Long productId = relationId(row.get("product_id"));
            if (productId == null || productId <= 0) continue;
            Map<String, Object> payload = result.computeIfAbsent(productId, ignored -> {
                Map<String, Object> value = new LinkedHashMap<>();
                value.put("productId", productId);
                value.put("onOrder", 0d);
                value.put("purchaseLineCount", 0);
                return value;
            });
            double ordered = decimal(row.get("product_qty"));
            double received = decimal(row.get("qty_received"));
            payload.put("onOrder", decimal(payload.get("onOrder")) + Math.max(0d, ordered - received));
            payload.put("purchaseLineCount", ((Number) payload.get("purchaseLineCount")).intValue() + 1);
            if (!payload.containsKey("nextExpectedAt") && row.get("date_planned") != null) {
                payload.put("nextExpectedAt", row.get("date_planned"));
            }
        }
        return result;
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
                String value = cookie.substring(start + "session_id=".length());
                int end = value.indexOf(';');
                return end < 0 ? value : value.substring(0, end);
            }
        }
        throw new IllegalStateException("Odoo did not return a session cookie");
    }

    private List<Map<String, Object>> readGroup(String session, String model, List<Object> domain,
                                                 List<String> fields, List<String> groupBy,
                                                 Map<String, Object> context, int limit) throws Exception {
        Map<String, Object> kwargs = new LinkedHashMap<>();
        kwargs.put("lazy", false); kwargs.put("limit", limit); kwargs.put("context", context);
        return convertRows(call(session, model, "read_group", List.of(domain, fields, groupBy), kwargs));
    }

    private List<Map<String, Object>> searchRead(String session, String model, List<Object> domain,
                                                   List<String> fields, Map<String, Object> context,
                                                   int limit, String order) throws Exception {
        Map<String, Object> kwargs = new LinkedHashMap<>();
        kwargs.put("fields", fields); kwargs.put("limit", limit); kwargs.put("order", order); kwargs.put("context", context);
        return convertRows(call(session, model, "search_read", List.of(domain), kwargs));
    }

    private JsonNode call(String session, String model, String method, List<?> args, Map<String, Object> kwargs)
            throws Exception {
        ObjectNode params = mapper.createObjectNode();
        params.put("model", model); params.put("method", method);
        params.set("args", mapper.valueToTree(args)); params.set("kwargs", mapper.valueToTree(kwargs));
        JsonNode root = mapper.readTree(post("/web/dataset/call_kw", params, session).body());
        if (root.hasNonNull("error")) throw new IllegalStateException("Odoo RPC error");
        JsonNode result = root.get("result");
        if (result == null || !result.isArray()) throw new IllegalStateException("Invalid Odoo response");
        return result;
    }

    private HttpResponse<String> post(String path, ObjectNode params, String session) throws Exception {
        ObjectNode body = mapper.createObjectNode();
        body.put("jsonrpc", "2.0"); body.put("method", "call"); body.set("params", params);
        body.put("id", System.currentTimeMillis());
        HttpRequest.Builder request = HttpRequest.newBuilder().uri(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        String correlationId = MDC.get("correlationId");
        if (correlationId != null) request.header("X-Correlation-ID", correlationId);
        if (session != null) request.header("Cookie", "session_id=" + session);
        HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) throw new IllegalStateException("Odoo HTTP " + response.statusCode());
        return response;
    }

    private List<Map<String, Object>> convertRows(JsonNode rows) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (JsonNode row : rows) result.add(mapper.convertValue(row, new TypeReference<>() {}));
        return result;
    }

    private static Map<String, Object> context(long companyId, Long warehouseId) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("allowed_company_ids", List.of(companyId)); context.put("force_company", companyId);
        if (warehouseId != null && warehouseId > 0) context.put("warehouse", warehouseId);
        return context;
    }

    private static String productQuality(Map<String, Object> product) {
        return product.get("name") == null || product.get("list_price") == null ? "INCOMPLETE" : "VALID";
    }

    private static Long relationId(Object relation) {
        if (relation instanceof List<?> pair && !pair.isEmpty() && pair.get(0) instanceof Number id) return id.longValue();
        return null;
    }

    private static String relationName(Object relation) {
        return relation instanceof List<?> pair && pair.size() > 1 && pair.get(1) != null
                ? pair.get(1).toString().trim() : "";
    }

    private static long longId(Object value) { return value instanceof Number n ? n.longValue() : 0L; }

    private static double decimal(Object value) {
        if (value == null || Boolean.FALSE.equals(value)) return 0d;
        try { return Double.parseDouble(value.toString()); }
        catch (RuntimeException ignored) { return 0d; }
    }

    private static String text(Object primary, Object fallback) {
        String value = primary == null ? "" : primary.toString().trim();
        return value.isBlank() && fallback != null ? fallback.toString().trim() : value;
    }

    private static String normalize(String value) { return value == null ? "" : value.trim().replaceAll("/+$", ""); }
}
