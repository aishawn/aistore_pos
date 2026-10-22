package com.orithos.modules.ai.report;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orithos.common.AustraliaTime;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/** Read-only reporting against the Odoo company bound to the authenticated vendor. */
@Component
public class OdooReportQueryService {

    private static final Logger log = LoggerFactory.getLogger(OdooReportQueryService.class);
    private static final DateTimeFormatter ODOO_UTC = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter ODOO_DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final List<String> PAID_STATES = List.of("paid", "done", "invoiced");
    private static final int MAX_GROUPS = 1000;
    private static final int MAX_LIST_ROWS = 50;
    private static final long TIMEZONE_CACHE_MILLIS = Duration.ofMinutes(30).toMillis();

    private final ObjectMapper objectMapper;
    private final VendorMapper vendorMapper;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final String baseUrl;
    private final String database;
    private final String username;
    private final String password;
    private final ConcurrentMap<Long, CachedTimezone> timezoneCache = new ConcurrentHashMap<>();

    public OdooReportQueryService(
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

    public Result query(TenantContext tenant, String intent, Map<String, String> slots,
                        ReportPeriodResolver.Window window) {
        if (tenant == null || tenant.requireOutletId() == null) return Result.fail("NO_OUTLET");
        if (!tenant.canQueryReport()) return Result.fail("NO_PERMISSION");
        if (!configured()) return Result.fail("ODOO_REPORT_NOT_CONFIGURED");
        if ("report_adhoc".equals(intent)) return Result.fail("ODOO_REPORT_UNSUPPORTED");
        if ("report_stock".equals(intent)
                && (slots == null || slots.get("query") == null || slots.get("query").isBlank())) {
            return Result.fail("NEED_PRODUCT");
        }
        if (intent == null || !ReportTemplateRegistry.TEMPLATE_INTENTS.contains(intent)) {
            return Result.fail("UNKNOWN_TEMPLATE");
        }

        Vendor vendor = vendorMapper.findById(tenant.vendorId());
        if (vendor == null || vendor.getOdooCompanyId() == null
                || vendor.getOdooCompanyId() <= 0
                || !"ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())) {
            return Result.fail("ODOO_REPORT_STORE_UNLINKED");
        }

        try {
            long companyId = vendor.getOdooCompanyId();
            String sessionId = authenticate();
            ZoneId timezone = cachedTimezone(companyId);
            Map<String, Object> context = context(companyId, vendor.getOdooWarehouseId(), timezone);
            List<Map<String, Object>> rows = switch (intent == null ? "" : intent) {
                case "report_sales" -> sales(sessionId, companyId, vendor, slots, window, context);
                case "report_qty" -> quantities(sessionId, companyId, vendor, slots, window, context);
                case "report_aov" -> averageTicket(sessionId, companyId, vendor, window, context);
                case "report_stock" -> stock(sessionId, companyId, slots, context);
                case "report_dead_stock" -> deadStock(sessionId, companyId, vendor, window, context);
                default -> null;
            };
            return rows == null ? Result.fail("ODOO_REPORT_TOO_LARGE") : Result.ok(rows);
        } catch (Exception e) {
            OdooReportFailure failure = e instanceof OdooReportFailure reportFailure ? reportFailure : null;
            String failureKind = failure != null ? failure.kind()
                    : e instanceof HttpTimeoutException ? "ODOO_TIMEOUT"
                    : e instanceof IOException ? "ODOO_IO_ERROR" : "ODOO_UNEXPECTED_ERROR";
            log.warn("AI Odoo report failed vendorId={} intent={} failureKind={} httpStatus={} rpcCode={} "
                            + "rpcType={} rpcModel={} rpcMethod={} responseType={} causeType={} correlationId={}",
                    tenant.vendorId(), intent, failureKind,
                    failure == null ? "" : failure.httpStatus(),
                    failure == null ? "" : failure.rpcCode(),
                    failure == null ? "" : failure.rpcType(),
                    failure == null ? "" : failure.rpcModel(),
                    failure == null ? "" : failure.rpcMethod(),
                    failure == null ? "" : failure.responseType(),
                    e.getClass().getSimpleName(), correlationId());
            return Result.fail("ODOO_REPORT_UNAVAILABLE");
        }
    }

    /**
     * Count sellable POS products for the vendor company. Read-only; returns null when
     * Odoo is unavailable so callers can fall back to a catalogue CTA.
     */
    public Integer countSellableProducts(TenantContext tenant) {
        if (tenant == null || !configured()) {
            return null;
        }
        Vendor vendor = vendorMapper.findById(tenant.vendorId());
        if (vendor == null || vendor.getOdooCompanyId() == null
                || vendor.getOdooCompanyId() <= 0
                || !"ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())) {
            return null;
        }
        try {
            long companyId = vendor.getOdooCompanyId();
            String sessionId = authenticate();
            ZoneId timezone = cachedTimezone(companyId);
            Map<String, Object> context = context(companyId, vendor.getOdooWarehouseId(), timezone);
            return searchCount(sessionId, "product.product", productDomain(companyId), context);
        } catch (Exception e) {
            log.warn("AI product count failed vendorId={} causeType={}",
                    tenant.vendorId(), e.getClass().getSimpleName());
            return null;
        }
    }

    /**
     * Search sellable products by name fragment. Never invents rows; empty list on miss.
     */
    public List<Map<String, Object>> searchProducts(TenantContext tenant, String query, int limit) {
        if (tenant == null || query == null || query.isBlank() || !configured()) {
            return List.of();
        }
        Vendor vendor = vendorMapper.findById(tenant.vendorId());
        if (vendor == null || vendor.getOdooCompanyId() == null
                || vendor.getOdooCompanyId() <= 0
                || !"ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())) {
            return List.of();
        }
        int capped = Math.max(1, Math.min(limit <= 0 ? 8 : limit, MAX_LIST_ROWS));
        try {
            long companyId = vendor.getOdooCompanyId();
            String sessionId = authenticate();
            ZoneId timezone = cachedTimezone(companyId);
            Map<String, Object> context = context(companyId, vendor.getOdooWarehouseId(), timezone);
            List<Object> domain = productDomain(companyId);
            domain.add(List.of("name", "ilike", query.trim()));
            List<Map<String, Object>> products = searchRead(sessionId, "product.product", domain,
                    List.of("id", "display_name", "list_price", "qty_available"), context, capped,
                    "display_name asc");
            List<Map<String, Object>> rows = new ArrayList<>();
            for (Map<String, Object> product : products) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", product.get("id"));
                row.put("name", product.getOrDefault("display_name", ""));
                row.put("list_price", decimal(product.get("list_price")));
                row.put("quantity", decimal(product.get("qty_available")));
                rows.add(row);
            }
            return rows;
        } catch (Exception e) {
            log.warn("AI product search failed vendorId={} causeType={}",
                    tenant.vendorId(), e.getClass().getSimpleName());
            return List.of();
        }
    }

    public ZoneId businessTimezone(TenantContext tenant) {
        if (tenant == null || !tenant.canQueryReport() || !configured()) return AustraliaTime.ZONE;
        Vendor vendor = vendorMapper.findById(tenant.vendorId());
        if (vendor == null || vendor.getOdooCompanyId() == null || vendor.getOdooCompanyId() <= 0
                || !"ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())) {
            return AustraliaTime.ZONE;
        }
        long companyId = vendor.getOdooCompanyId();
        CachedTimezone cached = timezoneCache.get(companyId);
        if (cached != null && cached.expiresAtMillis() > System.currentTimeMillis()) return cached.zone();

        try {
            String sessionId = authenticate();
            Map<String, Object> lookupContext = context(companyId, vendor.getOdooWarehouseId(), ZoneOffset.UTC);
            List<Map<String, Object>> companies = searchRead(sessionId, "res.company",
                    List.of(List.of("id", "=", companyId)), List.of("partner_id"), lookupContext, 1, "id asc");
            Object partnerRelation = companies.isEmpty() ? null : companies.get(0).get("partner_id");
            Long partnerId = relationId(partnerRelation);
            if (partnerId == null) return AustraliaTime.ZONE;
            List<Map<String, Object>> partners = searchRead(sessionId, "res.partner",
                    List.of(List.of("id", "=", partnerId)), List.of("country_id", "state_id"), lookupContext, 1, "id asc");
            Map<String, Object> partner = partners.isEmpty() ? Map.of() : partners.get(0);
            ZoneId zone = timezoneForAddress(relationName(partner.get("country_id")),
                    relationName(partner.get("state_id")));
            timezoneCache.put(companyId, new CachedTimezone(zone,
                    System.currentTimeMillis() + TIMEZONE_CACHE_MILLIS));
            return zone;
        } catch (Exception e) {
            log.warn("AI report timezone lookup failed vendorId={} cause={}", tenant.vendorId(),
                    e.getClass().getSimpleName());
            return AustraliaTime.ZONE;
        }
    }

    private List<Map<String, Object>> sales(String session, long companyId, Vendor vendor,
                                             Map<String, String> slots,
                                             ReportPeriodResolver.Window window,
                                             Map<String, Object> context) throws Exception {
        String category = ReportTemplateRegistry.sanitizeCategory(slots == null ? null : slots.get("category"));
        if (category == null) {
            List<Map<String, Object>> grouped = readGroup(session, "pos.order",
                    orderDomain(companyId, vendor, window, timezone(context)),
                    List.of("amount_total:sum"), List.of("date_order:day"), context, 367);
            if (grouped.size() > 366) return null;
            List<Map<String, Object>> rows = new ArrayList<>();
            for (Map<String, Object> row : grouped) {
                rows.add(Map.of(
                        "date", row.getOrDefault("date_order:day", ""),
                        "sales", decimal(row.get("amount_total"))));
            }
            return rows;
        }
        return lineTotalsByBusinessDay(session, companyId, vendor, window, category,
                "price_subtotal_incl", "sales", context);
    }

    private List<Map<String, Object>> quantities(String session, long companyId, Vendor vendor,
                                                  Map<String, String> slots,
                                                  ReportPeriodResolver.Window window,
                                                  Map<String, Object> context) throws Exception {
        String category = ReportTemplateRegistry.sanitizeCategory(slots == null ? null : slots.get("category"));
        return lineTotalsByBusinessDay(session, companyId, vendor, window, category, "qty", "qty", context);
    }

    private List<Map<String, Object>> lineTotalsByBusinessDay(String session, long companyId, Vendor vendor,
                                                               ReportPeriodResolver.Window window,
                                                               String category, String field, String outputField,
                                                               Map<String, Object> context) throws Exception {
        List<Map<String, Object>> perOrder = readGroup(session, "pos.order.line",
                lineDomain(companyId, vendor, window, category, timezone(context)), List.of(field + ":sum"),
                List.of("order_id"), context, MAX_GROUPS + 1);
        if (perOrder.size() > MAX_GROUPS) return null;
        List<Long> orderIds = new ArrayList<>();
        for (Map<String, Object> row : perOrder) {
            Object order = row.get("order_id");
            if (order instanceof List<?> pair && !pair.isEmpty() && pair.get(0) instanceof Number id) {
                orderIds.add(id.longValue());
            }
        }
        if (orderIds.size() != perOrder.size()) return null;
        if (orderIds.isEmpty()) return List.of();

        List<Map<String, Object>> orders = searchRead(session, "pos.order",
                List.of(List.of("company_id", "=", companyId), List.of("id", "in", orderIds)),
                List.of("id", "date_order"), context, MAX_GROUPS + 1, "date_order asc");
        if (orders.size() > MAX_GROUPS) return null;
        Map<Long, LocalDate> dateByOrder = new LinkedHashMap<>();
        for (Map<String, Object> order : orders) {
            Object rawId = order.get("id");
            Object rawDate = order.get("date_order");
            if (rawId instanceof Number id && rawDate != null) {
                LocalDateTime utc = LocalDateTime.parse(rawDate.toString(), ODOO_DATETIME);
                dateByOrder.put(id.longValue(), utc.atZone(ZoneOffset.UTC)
                        .withZoneSameInstant(timezone(context)).toLocalDate());
            }
        }
        if (dateByOrder.size() != orderIds.size()) return null;

        Map<LocalDate, BigDecimal> totalByDate = new TreeMap<>();
        for (Map<String, Object> row : perOrder) {
            Object order = row.get("order_id");
            if (order instanceof List<?> pair && !pair.isEmpty() && pair.get(0) instanceof Number id) {
                LocalDate date = dateByOrder.get(id.longValue());
                if (date != null) totalByDate.merge(date, decimal(row.get(field)), BigDecimal::add);
            }
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        totalByDate.forEach((date, total) -> rows.add(Map.of("date", date.toString(), outputField, total)));
        return rows;
    }

    private List<Map<String, Object>> averageTicket(String session, long companyId, Vendor vendor,
                                                     ReportPeriodResolver.Window window,
                                                     Map<String, Object> context) throws Exception {
        List<Map<String, Object>> grouped = readGroup(session, "pos.order",
                orderDomain(companyId, vendor, window, timezone(context)),
                List.of("amount_total:sum"), List.of(), context, 1);
        Map<String, Object> row = grouped.isEmpty() ? Map.of() : grouped.get(0);
        BigDecimal sales = decimal(row.get("amount_total"));
        BigDecimal tickets = decimal(row.get("__count"));
        BigDecimal average = tickets.signum() == 0 ? BigDecimal.ZERO
                : sales.divide(tickets, 2, java.math.RoundingMode.HALF_UP);
        return List.of(Map.of("tickets", tickets, "sales", sales, "aov", average));
    }

    private List<Map<String, Object>> stock(String session, long companyId, Map<String, String> slots,
                                             Map<String, Object> context) throws Exception {
        String query = slots == null ? null : slots.get("query");
        if (query == null || query.isBlank()) return List.of();
        List<Object> domain = stockProductDomain(companyId);
        domain.add(List.of("name", "ilike", query.trim()));
        List<Map<String, Object>> products;
        try {
            products = searchRead(session, "product.product", domain,
                    List.of("id", "display_name", "free_qty", "qty_available"), context, MAX_LIST_ROWS + 1,
                    "display_name asc");
        } catch (Exception primaryFailure) {
            // Some Odoo service users can read the standard quantity but not the
            // stock-reserved computed field. Keep the report useful without
            // weakening the read-only or company scoping guarantees.
            products = searchRead(session, "product.product", domain,
                    List.of("id", "display_name", "qty_available"), context, MAX_LIST_ROWS + 1,
                    "display_name asc");
        }
        if (products.size() > MAX_LIST_ROWS) return null;
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> product : products) {
            rows.add(Map.of(
                    "id", product.get("id"),
                    "name", product.getOrDefault("display_name", ""),
                    "quantity", decimal(product.containsKey("free_qty")
                            ? product.get("free_qty") : product.get("qty_available"))));
        }
        return rows;
    }

    private List<Map<String, Object>> deadStock(String session, long companyId, Vendor vendor,
                                                 ReportPeriodResolver.Window window,
                                                 Map<String, Object> context) throws Exception {
        List<Map<String, Object>> products = searchRead(session, "product.product", stockProductDomain(companyId),
                List.of("id", "display_name", "free_qty", "qty_available"), context, MAX_GROUPS + 1,
                "display_name asc");
        if (products.size() > MAX_GROUPS) return null;

        List<Map<String, Object>> sold = readGroup(session, "pos.order.line",
                lineDomain(companyId, vendor, window, null, timezone(context)), List.of("qty:sum"),
                List.of("product_id"), context, MAX_GROUPS + 1);
        if (sold.size() > MAX_GROUPS) return null;
        Map<Long, BigDecimal> soldByProduct = new LinkedHashMap<>();
        for (Map<String, Object> row : sold) {
            Object product = row.get("product_id");
            if (product instanceof List<?> pair && !pair.isEmpty() && pair.get(0) instanceof Number id) {
                soldByProduct.put(id.longValue(), decimal(row.get("qty")));
            }
        }

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> product : products) {
            long id = ((Number) product.getOrDefault("id", 0)).longValue();
            BigDecimal quantity = decimal(product.containsKey("free_qty")
                    ? product.get("free_qty") : product.get("qty_available"));
            if (quantity.signum() > 0 && soldByProduct.getOrDefault(id, BigDecimal.ZERO).compareTo(BigDecimal.ONE) < 0) {
                rows.add(Map.of("id", id, "name", product.getOrDefault("display_name", ""),
                        "on_hand", quantity, "sold_qty", soldByProduct.getOrDefault(id, BigDecimal.ZERO)));
            }
        }
        rows.sort((a, b) -> decimal(b.get("on_hand")).compareTo(decimal(a.get("on_hand"))));
        return rows.size() > MAX_LIST_ROWS ? null : rows;
    }

    private List<Object> orderDomain(long companyId, Vendor vendor,
                                    ReportPeriodResolver.Window window, ZoneId timezone) {
        List<Object> domain = new ArrayList<>();
        domain.add(List.of("company_id", "=", companyId));
        domain.add(List.of("date_order", ">=", utc(window.from(), timezone)));
        domain.add(List.of("date_order", "<", utc(window.toExclusive(), timezone)));
        domain.add(List.of("state", "in", PAID_STATES));
        domain.add(List.of("amount_total", ">", 0));
        excludeClearedDemoSeed(domain, companyId, vendor, "uuid");
        return domain;
    }

    private List<Object> lineDomain(long companyId, Vendor vendor,
                                   ReportPeriodResolver.Window window, String category, ZoneId timezone) {
        List<Object> domain = new ArrayList<>();
        domain.add(List.of("order_id.company_id", "=", companyId));
        domain.add(List.of("order_id.date_order", ">=", utc(window.from(), timezone)));
        domain.add(List.of("order_id.date_order", "<", utc(window.toExclusive(), timezone)));
        domain.add(List.of("order_id.state", "in", PAID_STATES));
        domain.add(List.of("order_id.amount_total", ">", 0));
        excludeClearedDemoSeed(domain, companyId, vendor, "order_id.uuid");
        if (category != null) {
            List<Object> matches = new ArrayList<>();
            for (String term : CategoryLexicon.searchTerms(category)) {
                matches.add(List.of("product_id.name", "ilike", term));
                matches.add(List.of("product_id.categ_id.name", "ilike", term));
            }
            for (int i = 1; i < matches.size(); i++) domain.add("|");
            domain.addAll(matches);
        }
        return domain;
    }

    private void excludeClearedDemoSeed(List<Object> domain, long companyId, Vendor vendor, String field) {
        if (vendor.getSampleDataClearedAt() != null) {
            domain.add(List.of(field, "not ilike", "demo-seed-" + companyId + "-%"));
        }
    }

    private List<Object> productDomain(long companyId) {
        List<Object> domain = new ArrayList<>();
        domain.add(List.of("active", "=", true));
        domain.add(List.of("available_in_pos", "=", true));
        addCompanyScope(domain, companyId);
        return domain;
    }

    private List<Object> stockProductDomain(long companyId) {
        List<Object> domain = new ArrayList<>();
        domain.add(List.of("active", "=", true));
        addCompanyScope(domain, companyId);
        return domain;
    }

    private void addCompanyScope(List<Object> domain, long companyId) {
        domain.add("|");
        domain.add(List.of("company_id", "=", false));
        domain.add(List.of("company_id", "=", companyId));
    }

    private List<Map<String, Object>> readGroup(String session, String model, List<Object> domain,
                                                 List<String> fields, List<String> groupBy,
                                                 Map<String, Object> context, int limit) throws Exception {
        Map<String, Object> kwargs = new LinkedHashMap<>();
        kwargs.put("lazy", false);
        kwargs.put("limit", limit);
        kwargs.put("context", context);
        JsonNode rows = call(session, model, "read_group", List.of(domain, fields, groupBy), kwargs);
        return convertRows(rows);
    }

    private List<Map<String, Object>> searchRead(String session, String model, List<Object> domain,
                                                  List<String> fields, Map<String, Object> context,
                                                  int limit, String order) throws Exception {
        Map<String, Object> kwargs = new LinkedHashMap<>();
        kwargs.put("fields", fields);
        kwargs.put("limit", limit);
        kwargs.put("order", order);
        kwargs.put("context", context);
        return convertRows(call(session, model, "search_read", List.of(domain), kwargs));
    }

    private int searchCount(String session, String model, List<Object> domain,
                            Map<String, Object> context) throws Exception {
        Map<String, Object> kwargs = new LinkedHashMap<>();
        kwargs.put("context", context);
        JsonNode result = callScalar(session, model, "search_count", List.of(domain), kwargs);
        if (result == null || !result.isNumber()) {
            throw new OdooReportFailure("ODOO_INVALID_RESPONSE", null, "", "", model, "search_count",
                    result == null ? "MISSING" : result.getNodeType().name());
        }
        return result.asInt();
    }

    private JsonNode callScalar(String session, String model, String method,
                                List<?> args, Map<String, Object> kwargs) throws Exception {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("model", model);
        params.put("method", method);
        params.set("args", objectMapper.valueToTree(args));
        params.set("kwargs", objectMapper.valueToTree(kwargs));
        JsonNode root = objectMapper.readTree(post("/web/dataset/call_kw", params, session).body());
        if (root.hasNonNull("error")) {
            JsonNode error = root.path("error");
            JsonNode code = error.path("code");
            String rpcCode = code.isNumber() ? code.asText() : "";
            String rpcType = simpleExceptionName(error.path("data").path("name").asText(""));
            throw new OdooReportFailure("ODOO_RPC_ERROR", null, rpcCode, rpcType, model, method, "");
        }
        JsonNode result = root.get("result");
        if (result == null || result.isNull()) {
            throw new OdooReportFailure("ODOO_INVALID_RESPONSE", null, "", "", model, method, "MISSING");
        }
        return result;
    }

    private List<Map<String, Object>> convertRows(JsonNode rows) {
        if (rows == null || !rows.isArray()) throw new IllegalStateException("Invalid Odoo report response");
        List<Map<String, Object>> result = new ArrayList<>();
        for (JsonNode row : rows) {
            result.add(objectMapper.convertValue(row, new TypeReference<>() {}));
        }
        return result;
    }

    private String authenticate() throws Exception {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("db", database);
        params.put("login", username);
        params.put("password", password);
        HttpResponse<String> response = post("/web/session/authenticate", params, null);
        JsonNode root = objectMapper.readTree(response.body());
        if (root.path("result").path("uid").asLong(0) <= 0) {
            throw new OdooReportFailure("ODOO_AUTH_REJECTED", null, "", "");
        }
        for (String cookie : response.headers().allValues("set-cookie")) {
            int start = cookie.indexOf("session_id=");
            if (start >= 0) {
                String value = cookie.substring(start + "session_id=".length());
                int end = value.indexOf(';');
                return end < 0 ? value : value.substring(0, end);
            }
        }
        throw new OdooReportFailure("ODOO_SESSION_COOKIE_MISSING", null, "", "");
    }

    private JsonNode call(String session, String model, String method,
                          List<?> args, Map<String, Object> kwargs) throws Exception {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("model", model);
        params.put("method", method);
        params.set("args", objectMapper.valueToTree(args));
        params.set("kwargs", objectMapper.valueToTree(kwargs));
        JsonNode root = objectMapper.readTree(post("/web/dataset/call_kw", params, session).body());
        if (root.hasNonNull("error")) {
            JsonNode error = root.path("error");
            JsonNode code = error.path("code");
            String rpcCode = code.isNumber() ? code.asText() : "";
            String rpcType = simpleExceptionName(error.path("data").path("name").asText(""));
            throw new OdooReportFailure("ODOO_RPC_ERROR", null, rpcCode, rpcType, model, method, "");
        }
        JsonNode result = root.get("result");
        if (result == null || !result.isArray()) {
            String responseType = result == null ? "MISSING" : result.getNodeType().name();
            throw new OdooReportFailure("ODOO_INVALID_RESPONSE", null, "", "", model, method, responseType);
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
                .timeout(Duration.ofSeconds(15)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        String correlationId = MDC.get("correlationId");
        if (correlationId != null) request.header("X-Correlation-ID", correlationId);
        if (session != null) request.header("Cookie", "session_id=" + session);
        HttpResponse<String> response = httpClient.send(request.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new OdooReportFailure("ODOO_HTTP_ERROR", response.statusCode(), "", "");
        }
        return response;
    }

    private Map<String, Object> context(long companyId, Long warehouseId, ZoneId timezone) {
        Map<String, Object> context = new LinkedHashMap<>();
        context.put("allowed_company_ids", List.of(companyId));
        context.put("force_company", companyId);
        context.put("tz", timezone.getId());
        if (warehouseId != null && warehouseId > 0) context.put("warehouse", warehouseId);
        return context;
    }

    private ZoneId cachedTimezone(long companyId) {
        CachedTimezone cached = timezoneCache.get(companyId);
        if (cached == null || cached.expiresAtMillis() <= System.currentTimeMillis()) return AustraliaTime.ZONE;
        return cached.zone();
    }

    private static ZoneId timezone(Map<String, Object> context) {
        try {
            return ZoneId.of(String.valueOf(context.get("tz")));
        } catch (RuntimeException e) {
            return AustraliaTime.ZONE;
        }
    }

    private String utc(LocalDateTime local, ZoneId timezone) {
        return local.atZone(timezone).withZoneSameInstant(ZoneOffset.UTC).format(ODOO_UTC);
    }

    private static Long relationId(Object relation) {
        if (relation instanceof List<?> pair && !pair.isEmpty() && pair.get(0) instanceof Number id) {
            return id.longValue();
        }
        return null;
    }

    private static String relationName(Object relation) {
        if (relation instanceof List<?> pair && pair.size() > 1 && pair.get(1) != null) {
            return pair.get(1).toString().trim();
        }
        return "";
    }

    private static ZoneId timezoneForAddress(String countryName, String stateName) {
        String country = countryName == null ? "" : countryName.trim().toLowerCase(java.util.Locale.ROOT);
        if (!country.equals("australia") && !country.equals("au")) return ZoneOffset.UTC;
        String state = stateName == null ? "" : stateName.trim().toLowerCase(java.util.Locale.ROOT);
        if (state.equals("nsw") || state.startsWith("new south wales")
                || state.equals("vic") || state.equals("victoria")
                || state.equals("tas") || state.equals("tasmania")
                || state.equals("act") || state.startsWith("australian capital territory")) {
            return ZoneId.of("Australia/Sydney");
        }
        if (state.equals("qld") || state.equals("queensland")) return ZoneId.of("Australia/Brisbane");
        if (state.equals("sa") || state.startsWith("south australia")) return ZoneId.of("Australia/Adelaide");
        if (state.equals("wa") || state.startsWith("western australia")) return ZoneId.of("Australia/Perth");
        if (state.equals("nt") || state.startsWith("northern territory")) return ZoneId.of("Australia/Darwin");
        return ZoneId.of("Australia/Adelaide");
    }

    private record CachedTimezone(ZoneId zone, long expiresAtMillis) {}

    private static String correlationId() {
        String value = MDC.get("correlationId");
        return value == null ? "" : value;
    }

    private static final class OdooReportFailure extends RuntimeException {
        private final String kind;
        private final Integer httpStatus;
        private final String rpcCode;
        private final String rpcType;
        private final String rpcModel;
        private final String rpcMethod;
        private final String responseType;

        private OdooReportFailure(String kind, Integer httpStatus, String rpcCode, String rpcType) {
            this(kind, httpStatus, rpcCode, rpcType, "", "", "");
        }

        private OdooReportFailure(String kind, Integer httpStatus, String rpcCode, String rpcType,
                                  String rpcModel, String rpcMethod, String responseType) {
            super(kind);
            this.kind = kind;
            this.httpStatus = httpStatus;
            this.rpcCode = rpcCode;
            this.rpcType = rpcType;
            this.rpcModel = rpcModel;
            this.rpcMethod = rpcMethod;
            this.responseType = responseType;
        }

        private String kind() {
            return kind;
        }

        private Integer httpStatus() {
            return httpStatus;
        }

        private String rpcCode() {
            return rpcCode;
        }

        private String rpcType() {
            return rpcType;
        }

        private String rpcModel() {
            return rpcModel;
        }

        private String rpcMethod() {
            return rpcMethod;
        }

        private String responseType() {
            return responseType;
        }
    }

    private static String simpleExceptionName(String name) {
        if (name == null || name.isBlank()) return "";
        int separator = name.lastIndexOf('.');
        String simpleName = separator >= 0 ? name.substring(separator + 1) : name;
        return simpleName.matches("[A-Za-z][A-Za-z0-9_]{0,79}") ? simpleName : "";
    }

    private boolean configured() {
        if (baseUrl.isBlank() || database.isBlank() || username.isBlank() || password.isBlank()) return false;
        try {
            URI uri = URI.create(baseUrl);
            return ("https".equalsIgnoreCase(uri.getScheme()) || "localhost".equalsIgnoreCase(uri.getHost()))
                    && uri.getUserInfo() == null;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static BigDecimal decimal(Object value) {
        if (value == null) return BigDecimal.ZERO;
        try {
            return value instanceof BigDecimal number ? number : new BigDecimal(value.toString());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    public record Result(List<Map<String, Object>> rows, String error) {
        static Result ok(List<Map<String, Object>> rows) {
            return new Result(rows, null);
        }

        static Result fail(String error) {
            return new Result(List.of(), error);
        }
    }
}
