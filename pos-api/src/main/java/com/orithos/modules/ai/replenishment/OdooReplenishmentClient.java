package com.orithos.modules.ai.replenishment;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds a read-only replenishment plan from Odoo POS sales + stock (service account),
 * aligned with the Next.js {@code rules_v1_weighted_velocity} page algorithm.
 */
@Component
public class OdooReplenishmentClient {

    private static final Logger log = LoggerFactory.getLogger(OdooReplenishmentClient.class);
    private static final DateTimeFormatter ODOO_UTC = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int HISTORY_DAYS = 56;
    private static final int PERIOD_DAYS = 28;
    private static final int DEFAULT_COVERAGE_DAYS = 21;
    private static final int MAX_PRODUCTS = 500;
    private static final List<String> PAID_STATES = List.of("paid", "done", "invoiced");

    private final ObjectMapper objectMapper;
    private final VendorMapper vendorMapper;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final String baseUrl;
    private final String database;
    private final String username;
    private final String password;

    public OdooReplenishmentClient(
            ObjectMapper objectMapper,
            VendorMapper vendorMapper,
            @Value("${ODOO_BASE_URL:}") String baseUrl,
            @Value("${ODOO_DATABASE:aipos}") String database,
            @Value("${ODOO_SERVICE_USERNAME:}") String username,
            @Value("${ODOO_SERVICE_PASSWORD:}") String password) {
        this.objectMapper = objectMapper;
        this.vendorMapper = vendorMapper;
        this.baseUrl = baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
        this.database = database == null ? "" : database.trim();
        this.username = username == null ? "" : username.trim();
        this.password = password == null ? "" : password;
    }

    /** Test constructor without Spring wiring. */
    OdooReplenishmentClient(ObjectMapper objectMapper, VendorMapper vendorMapper) {
        this(objectMapper, vendorMapper, "", "aipos", "", "");
    }

    public boolean isConfigured() {
        return !baseUrl.isBlank() && !database.isBlank() && !username.isBlank() && !password.isBlank();
    }

    public ReplenishmentPlan plan(TenantContext tenant) {
        return plan(tenant, DEFAULT_COVERAGE_DAYS);
    }

    public ReplenishmentPlan plan(TenantContext tenant, int coverageDays) {
        if (tenant == null || !isConfigured()) {
            return null;
        }
        Vendor vendor = vendorMapper.findById(tenant.vendorId());
        if (vendor == null || vendor.getOdooCompanyId() == null || vendor.getOdooCompanyId() <= 0
                || !"ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())) {
            return null;
        }
        int cover = coverageDays > 0 ? coverageDays : DEFAULT_COVERAGE_DAYS;
        try {
            long companyId = vendor.getOdooCompanyId();
            String sessionId = authenticate();
            Map<String, Object> context = context(companyId, vendor.getOdooWarehouseId());
            Instant now = Instant.now();
            String recentFrom = ODOO_UTC.format(now.minus(Duration.ofDays(PERIOD_DAYS)).atZone(ZoneOffset.UTC));
            String previousFrom = ODOO_UTC.format(now.minus(Duration.ofDays(HISTORY_DAYS)).atZone(ZoneOffset.UTC));

            List<Object> salesBase = List.of(
                    List.of("order_id.company_id", "=", companyId),
                    List.of("order_id.state", "in", PAID_STATES));
            List<Object> recentDomain = new ArrayList<>(salesBase);
            recentDomain.add(List.of("order_id.date_order", ">=", recentFrom));
            List<Object> previousDomain = new ArrayList<>(salesBase);
            previousDomain.add(List.of("order_id.date_order", ">=", previousFrom));
            previousDomain.add(List.of("order_id.date_order", "<", recentFrom));

            List<Map<String, Object>> recentSales = readGroup(sessionId, "pos.order.line", recentDomain,
                    List.of("qty:sum"), List.of("product_id"), context, MAX_PRODUCTS);
            List<Map<String, Object>> previousSales = readGroup(sessionId, "pos.order.line", previousDomain,
                    List.of("qty:sum"), List.of("product_id"), context, MAX_PRODUCTS);
            List<Map<String, Object>> products = searchRead(sessionId, "product.product",
                    List.of(
                            List.of("available_in_pos", "=", true),
                            List.of("company_id", "=", companyId)),
                    List.of("id", "name", "display_name", "default_code", "qty_available", "virtual_available", "uom_id"),
                    context, MAX_PRODUCTS, "name asc, id asc");

            Map<Long, Double> recentSold = soldMap(recentSales);
            Map<Long, Double> previousSold = soldMap(previousSales);
            List<ReplenishmentSuggestion> suggestions = new ArrayList<>();
            for (Map<String, Object> product : products) {
                long id = longId(product.get("id"));
                if (id <= 0) {
                    continue;
                }
                double recentUnits = recentSold.getOrDefault(id, 0d);
                double previousUnits = previousSold.getOrDefault(id, 0d);
                double onHand = decimal(product.get("qty_available"));
                Double virtual = optionalDecimal(product.get("virtual_available"));
                double forecastStock = virtual != null ? virtual : onHand;
                double recentUnitsPerDay = recentUnits / PERIOD_DAYS;
                double previousUnitsPerDay = previousUnits / PERIOD_DAYS;
                double unitsPerDay = recentUnits > 0 && previousUnits > 0
                        ? recentUnitsPerDay * 0.7 + previousUnitsPerDay * 0.3
                        : (recentUnitsPerDay > 0 ? recentUnitsPerDay : previousUnitsPerDay);
                int suggestedQuantity = (int) Math.max(0, Math.ceil(unitsPerDay * cover - forecastStock));
                if (suggestedQuantity <= 0) {
                    continue;
                }
                Double daysOfStock = unitsPerDay > 0 ? forecastStock / unitsPerDay : null;
                String name = text(product.get("display_name"));
                if (name.isBlank()) {
                    name = text(product.get("name"));
                }
                if (name.isBlank()) {
                    name = "Product";
                }
                suggestions.add(new ReplenishmentSuggestion(
                        id, name, unitName(product.get("uom_id")), suggestedQuantity, daysOfStock, unitsPerDay));
            }
            suggestions.sort(Comparator
                    .comparingDouble(ReplenishmentSuggestion::suggestedQuantity).reversed()
                    .thenComparing(Comparator.comparingDouble(ReplenishmentSuggestion::unitsPerDay).reversed())
                    .thenComparing(ReplenishmentSuggestion::name));
            int needing = suggestions.size();
            List<ReplenishmentSuggestion> top = suggestions.stream().limit(3).toList();
            return new ReplenishmentPlan(cover, needing, top);
        } catch (Exception e) {
            log.warn("Odoo replenishment brief unavailable vendorId={} causeType={}",
                    tenant.vendorId(), e.getClass().getSimpleName());
            return null;
        }
    }

    /** Pure plan assembly for unit tests (no network). */
    static ReplenishmentPlan fromMaps(
            List<Map<String, Object>> products,
            Map<Long, Double> recentSold,
            Map<Long, Double> previousSold,
            int coverageDays) {
        int cover = coverageDays > 0 ? coverageDays : DEFAULT_COVERAGE_DAYS;
        List<ReplenishmentSuggestion> suggestions = new ArrayList<>();
        for (Map<String, Object> product : products) {
            long id = longId(product.get("id"));
            if (id <= 0) {
                continue;
            }
            double recentUnits = recentSold.getOrDefault(id, 0d);
            double previousUnits = previousSold.getOrDefault(id, 0d);
            double onHand = decimal(product.get("qty_available"));
            Double virtual = optionalDecimal(product.get("virtual_available"));
            double forecastStock = virtual != null ? virtual : onHand;
            double recentUnitsPerDay = recentUnits / PERIOD_DAYS;
            double previousUnitsPerDay = previousUnits / PERIOD_DAYS;
            double unitsPerDay = recentUnits > 0 && previousUnits > 0
                    ? recentUnitsPerDay * 0.7 + previousUnitsPerDay * 0.3
                    : (recentUnitsPerDay > 0 ? recentUnitsPerDay : previousUnitsPerDay);
            int suggestedQuantity = (int) Math.max(0, Math.ceil(unitsPerDay * cover - forecastStock));
            if (suggestedQuantity <= 0) {
                continue;
            }
            Double daysOfStock = unitsPerDay > 0 ? forecastStock / unitsPerDay : null;
            String name = text(product.get("display_name"));
            if (name.isBlank()) {
                name = text(product.get("name"));
            }
            suggestions.add(new ReplenishmentSuggestion(
                    id, name.isBlank() ? "Product" : name, unitName(product.get("uom_id")),
                    suggestedQuantity, daysOfStock, unitsPerDay));
        }
        suggestions.sort(Comparator
                .comparingDouble(ReplenishmentSuggestion::suggestedQuantity).reversed()
                .thenComparing(ReplenishmentSuggestion::name));
        return new ReplenishmentPlan(cover, suggestions.size(), suggestions.stream().limit(3).toList());
    }

    private Map<Long, Double> soldMap(List<Map<String, Object>> rows) {
        Map<Long, Double> map = new HashMap<>();
        for (Map<String, Object> row : rows) {
            Long productId = relationId(row.get("product_id"));
            if (productId == null) {
                continue;
            }
            map.put(productId, decimal(row.get("qty")));
        }
        return map;
    }

    private String authenticate() throws Exception {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("db", database);
        params.put("login", username);
        params.put("password", password);
        HttpResponse<String> response = post("/web/session/authenticate", params, null);
        JsonNode root = objectMapper.readTree(response.body());
        if (root.path("result").path("uid").asLong(0) <= 0) {
            throw new IllegalStateException("Odoo service account authentication failed");
        }
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

    private List<Map<String, Object>> readGroup(
            String session, String model, List<Object> domain, List<String> fields, List<String> groupBy,
            Map<String, Object> context, int limit) throws Exception {
        Map<String, Object> kwargs = new LinkedHashMap<>();
        kwargs.put("lazy", false);
        kwargs.put("limit", limit);
        kwargs.put("context", context);
        return convertRows(call(session, model, "read_group", List.of(domain, fields, groupBy), kwargs));
    }

    private List<Map<String, Object>> searchRead(
            String session, String model, List<Object> domain, List<String> fields,
            Map<String, Object> context, int limit, String order) throws Exception {
        Map<String, Object> kwargs = new LinkedHashMap<>();
        kwargs.put("fields", fields);
        kwargs.put("limit", limit);
        kwargs.put("order", order);
        kwargs.put("context", context);
        return convertRows(call(session, model, "search_read", List.of(domain), kwargs));
    }

    private JsonNode call(String session, String model, String method, List<?> args, Map<String, Object> kwargs)
            throws Exception {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("model", model);
        params.put("method", method);
        params.set("args", objectMapper.valueToTree(args));
        params.set("kwargs", objectMapper.valueToTree(kwargs));
        JsonNode root = objectMapper.readTree(post("/web/dataset/call_kw", params, session).body());
        if (root.hasNonNull("error")) {
            throw new IllegalStateException("Odoo RPC error on " + model + "." + method);
        }
        JsonNode result = root.get("result");
        if (result == null || !result.isArray()) {
            throw new IllegalStateException("Invalid Odoo response for " + model + "." + method);
        }
        return result;
    }

    private HttpResponse<String> post(String path, ObjectNode params, String session) throws Exception {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("jsonrpc", "2.0");
        body.put("method", "call");
        body.set("params", params);
        body.put("id", System.currentTimeMillis());
        HttpRequest.Builder request = HttpRequest.newBuilder().uri(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(20)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        String correlationId = MDC.get("correlationId");
        if (correlationId != null) {
            request.header("X-Correlation-ID", correlationId);
        }
        if (session != null) {
            request.header("Cookie", "session_id=" + session);
        }
        HttpResponse<String> response = httpClient.send(request.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IllegalStateException("Odoo HTTP " + response.statusCode());
        }
        return response;
    }

    private List<Map<String, Object>> convertRows(JsonNode rows) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (JsonNode row : rows) {
            result.add(objectMapper.convertValue(row, new TypeReference<>() {}));
        }
        return result;
    }

    private static Map<String, Object> context(long companyId, Long warehouseId) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("allowed_company_ids", List.of(companyId));
        context.put("force_company", companyId);
        if (warehouseId != null && warehouseId > 0) {
            context.put("warehouse", warehouseId);
        }
        return context;
    }

    private static Long relationId(Object relation) {
        if (relation instanceof List<?> pair && !pair.isEmpty() && pair.get(0) instanceof Number id) {
            return id.longValue();
        }
        return null;
    }

    private static String unitName(Object uom) {
        if (uom instanceof List<?> pair && pair.size() > 1 && pair.get(1) != null) {
            return pair.get(1).toString().trim();
        }
        return "Units";
    }

    private static long longId(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        return 0L;
    }

    private static String text(Object value) {
        return value == null ? "" : value.toString().trim();
    }

    private static double decimal(Object value) {
        Double parsed = optionalDecimal(value);
        return parsed == null ? 0d : parsed;
    }

    private static Double optionalDecimal(Object value) {
        if (value == null || Boolean.FALSE.equals(value)) {
            return null;
        }
        try {
            return new BigDecimal(value.toString()).setScale(4, RoundingMode.HALF_UP).doubleValue();
        } catch (Exception e) {
            return null;
        }
    }
}
