package com.orithos.modules.ai.pricing;

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
import org.springframework.beans.factory.annotation.Autowired;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Narrow read-only price-suggestion slice for chat briefs (service account).
 * Prefer sold products with status raise / review_*; CTA still opens capped-pricing.
 */
@Component
public class OdooPriceSuggestionClient {

    private static final Logger log = LoggerFactory.getLogger(OdooPriceSuggestionClient.class);
    private static final DateTimeFormatter ODOO_UTC = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int HISTORY_DAYS = 28;
    private static final double DEFAULT_MARGIN = 0.30;
    private static final int SALES_LIMIT = 80;
    private static final int PRODUCT_LIMIT = 40;
    private static final List<String> PAID_STATES = List.of("paid", "done", "invoiced");

    private final ObjectMapper objectMapper;
    private final VendorMapper vendorMapper;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final String baseUrl;
    private final String database;
    private final String username;
    private final String password;

    @Autowired
    public OdooPriceSuggestionClient(
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

    public boolean isConfigured() {
        return !baseUrl.isBlank() && !database.isBlank() && !username.isBlank() && !password.isBlank();
    }

    public PriceReviewBrief review(TenantContext tenant) {
        return review(tenant, DEFAULT_MARGIN);
    }

    public PriceReviewBrief review(TenantContext tenant, double marginTarget) {
        if (tenant == null || !isConfigured()) {
            return null;
        }
        Vendor vendor = vendorMapper.findById(tenant.vendorId());
        if (vendor == null || vendor.getOdooCompanyId() == null || vendor.getOdooCompanyId() <= 0
                || !"ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())) {
            return null;
        }
        double margin = marginTarget > 0 && marginTarget < 1 ? marginTarget : DEFAULT_MARGIN;
        try {
            long companyId = vendor.getOdooCompanyId();
            String sessionId = authenticate();
            Map<String, Object> context = context(companyId, vendor.getOdooWarehouseId());
            String recentFrom = ODOO_UTC.format(
                    Instant.now().minus(Duration.ofDays(HISTORY_DAYS)).atZone(ZoneOffset.UTC));

            List<Object> salesDomain = List.of(
                    List.of("order_id.company_id", "=", companyId),
                    List.of("order_id.state", "in", PAID_STATES),
                    List.of("order_id.date_order", ">=", recentFrom));
            List<Map<String, Object>> sales = readGroup(sessionId, "pos.order.line", salesDomain,
                    List.of("qty:sum"), List.of("product_id"), context, SALES_LIMIT);
            Map<Long, Double> soldMap = new HashMap<>();
            List<Long> soldIds = new ArrayList<>();
            for (Map<String, Object> row : sales) {
                Long productId = relationId(row.get("product_id"));
                if (productId == null) {
                    continue;
                }
                double qty = decimal(row.get("qty"));
                soldMap.put(productId, qty);
                soldIds.add(productId);
            }
            soldIds.sort(Comparator.comparingDouble((Long id) -> soldMap.getOrDefault(id, 0d)).reversed());
            if (soldIds.size() > PRODUCT_LIMIT) {
                soldIds = soldIds.subList(0, PRODUCT_LIMIT);
            }

            List<Map<String, Object>> products;
            if (!soldIds.isEmpty()) {
                products = searchRead(sessionId, "product.product",
                        List.of(
                                List.of("id", "in", soldIds),
                                List.of("available_in_pos", "=", true),
                                List.of("company_id", "=", companyId)),
                        List.of("id", "name", "display_name", "list_price", "standard_price", "qty_available", "taxes_id"),
                        context, PRODUCT_LIMIT, "id asc");
            } else {
                products = searchRead(sessionId, "product.product",
                        List.of(
                                List.of("available_in_pos", "=", true),
                                List.of("company_id", "=", companyId)),
                        List.of("id", "name", "display_name", "list_price", "standard_price", "qty_available", "taxes_id"),
                        context, PRODUCT_LIMIT, "name asc, id asc");
            }

            Set<Long> taxIds = new HashSet<>();
            for (Map<String, Object> product : products) {
                taxIds.addAll(taxIdList(product.get("taxes_id")));
            }
            Map<Long, SuggestionTax> taxById = new HashMap<>();
            if (!taxIds.isEmpty()) {
                List<Map<String, Object>> taxes = searchRead(sessionId, "account.tax",
                        List.of(
                                List.of("id", "in", new ArrayList<>(taxIds)),
                                List.of("company_id", "=", companyId),
                                List.of("type_tax_use", "=", "sale")),
                        List.of("id", "amount", "amount_type", "price_include", "include_base_amount"),
                        context, taxIds.size(), "id asc");
                for (Map<String, Object> tax : taxes) {
                    long id = longId(tax.get("id"));
                    if (id <= 0) {
                        continue;
                    }
                    taxById.put(id, new SuggestionTax(
                            id,
                            decimal(tax.get("amount")),
                            text(tax.get("amount_type")),
                            bool(tax.get("price_include")),
                            bool(tax.get("include_base_amount"))));
                }
            }

            List<PriceReviewItem> reviews = buildReviewItems(products, soldMap, taxById, margin, true);
            reviews.sort(Comparator
                    .comparingDouble(PriceReviewItem::soldUnits).reversed()
                    .thenComparing(PriceReviewItem::name));
            List<PriceReviewItem> top = reviews.stream().limit(3).toList();
            return new PriceReviewBrief(margin, top);
        } catch (Exception e) {
            log.warn("Odoo pricing brief unavailable vendorId={} causeType={}",
                    tenant.vendorId(), e.getClass().getSimpleName());
            return null;
        }
    }

    /** Pure suggestion assembly for unit tests (no network). */
    static List<PriceReviewItem> buildReviewItems(
            List<Map<String, Object>> products,
            Map<Long, Double> soldMap,
            Map<Long, SuggestionTax> taxById,
            double marginTarget) {
        return buildReviewItems(products, soldMap, taxById, marginTarget, false);
    }

    private static List<PriceReviewItem> buildReviewItems(
            List<Map<String, Object>> products,
            Map<Long, Double> soldMap,
            Map<Long, SuggestionTax> taxById,
            double marginTarget,
            boolean enforcePolicy) {
        List<PriceReviewItem> out = new ArrayList<>();
        for (Map<String, Object> product : products) {
            PriceReviewItem item = toReviewItem(product, soldMap, taxById, marginTarget, enforcePolicy);
            if (item != null && needsReview(item.status())) {
                out.add(item);
            }
        }
        return out;
    }

    private static boolean needsReview(String status) {
        return "raise".equals(status) || (status != null && status.startsWith("review_"));
    }

    private static PriceReviewItem toReviewItem(
            Map<String, Object> product,
            Map<Long, Double> soldMap,
            Map<Long, SuggestionTax> taxById,
            double marginTarget) {
        return toReviewItem(product, soldMap, taxById, marginTarget, false);
    }

    private static PriceReviewItem toReviewItem(
            Map<String, Object> product,
            Map<Long, Double> soldMap,
            Map<Long, SuggestionTax> taxById,
            double marginTarget,
            boolean enforcePolicy) {
        long id = longId(product.get("id"));
        if (id <= 0) {
            return null;
        }
        String name = text(product.get("display_name"));
        if (name.isBlank()) {
            name = text(product.get("name"));
        }
        if (name.isBlank()) {
            name = "Product";
        }
        double listPrice = decimal(product.get("list_price"));
        double costRaw = decimal(product.get("standard_price"));
        boolean hasPrice = listPrice > 0;
        boolean hasCost = costRaw > 0;
        List<Long> productTaxIds = taxIdList(product.get("taxes_id"));
        List<SuggestionTax> productTaxes = new ArrayList<>();
        for (Long taxId : productTaxIds) {
            SuggestionTax tax = taxById.get(taxId);
            if (tax != null) {
                productTaxes.add(tax);
            }
        }
        double soldUnits = soldMap.getOrDefault(id, 0d);

        if (!hasPrice) {
            return new PriceReviewItem(id, name, soldUnits, null, null, "unsaleable");
        }
        if (!hasCost) {
            return new PriceReviewItem(id, name, soldUnits, listPrice, null, "missing_cost");
        }
        boolean taxReady = !productTaxIds.isEmpty()
                && productTaxes.size() == productTaxIds.size()
                && PriceSuggestionMath.suggestedListPrice(1, marginTarget, productTaxes) != null;
        if (!taxReady) {
            return new PriceReviewItem(id, name, soldUnits, listPrice, null, "review_tax");
        }

        PriceSuggestionMath.TaxTotals current = PriceSuggestionMath.computeSimpleTaxTotals(listPrice, productTaxes);
        if (current == null) {
            return new PriceReviewItem(id, name, soldUnits, null, null, "review_tax");
        }
        Double currentMargin = PriceSuggestionMath.netMargin(current.totalExcluded(), costRaw);
        PricingDecisionEngine.Decision policy = null;
        if (enforcePolicy && product.containsKey("qty_available")) {
            policy = PricingDecisionEngine.decide(
                    new PricingDecisionEngine.Input(listPrice, costRaw, soldUnits / HISTORY_DAYS,
                            decimal(product.get("qty_available")), false, false),
                    new PricingDecisionEngine.Limits(0.25, 30, 0.10, 2.0, 10,
                            0.05, marginTarget, 0.15, 0.25, 0.05));
            if (policy.status() == PricingDecisionEngine.Status.INSUFFICIENT_DATA) {
                return new PriceReviewItem(id, name, soldUnits, current.totalIncluded(), null, "review_data");
            }
        }
        Double proposedList = PriceSuggestionMath.suggestedListPrice(costRaw, marginTarget, productTaxes);
        Double suggestedShelf = null;
        if (proposedList != null && currentMargin != null && currentMargin + 0.005 < marginTarget) {
            PriceSuggestionMath.TaxTotals proposed = PriceSuggestionMath.computeSimpleTaxTotals(proposedList, productTaxes);
            if (proposed != null) {
                suggestedShelf = proposed.totalIncluded();
            }
        }
        if (currentMargin != null && currentMargin + 0.005 < marginTarget) {
            if (policy != null && policy.status() == PricingDecisionEngine.Status.HOLD) {
                return new PriceReviewItem(id, name, soldUnits, current.totalIncluded(), null, "review_policy");
            }
            if (suggestedShelf == null || suggestedShelf <= current.totalIncluded()) {
                return new PriceReviewItem(id, name, soldUnits, current.totalIncluded(), null, "review_cost");
            }
            return new PriceReviewItem(id, name, soldUnits, current.totalIncluded(), suggestedShelf, "raise");
        }
        return new PriceReviewItem(id, name, soldUnits, current.totalIncluded(), null, "ok");
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

    @SuppressWarnings("unchecked")
    private static List<Long> taxIdList(Object value) {
        if (!(value instanceof List<?> list) || list.isEmpty()) {
            return List.of();
        }
        if (list.get(0) instanceof Number) {
            List<Long> ids = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Number number) {
                    ids.add(number.longValue());
                }
            }
            return ids;
        }
        return List.of();
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

    private static boolean bool(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        return "true".equalsIgnoreCase(String.valueOf(value));
    }

    private static double decimal(Object value) {
        if (value == null || Boolean.FALSE.equals(value)) {
            return 0d;
        }
        try {
            return new BigDecimal(value.toString()).setScale(4, RoundingMode.HALF_UP).doubleValue();
        } catch (Exception e) {
            return 0d;
        }
    }
}
