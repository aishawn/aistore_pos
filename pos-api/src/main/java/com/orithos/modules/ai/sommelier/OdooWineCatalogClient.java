package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Reads POS wine candidates from Odoo (sole business SoT) when a service account is configured.
 */
@Component
public class OdooWineCatalogClient {

    private static final Logger log = LoggerFactory.getLogger(OdooWineCatalogClient.class);

    private final ObjectMapper objectMapper;
    private final VendorMapper vendorMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    private final String baseUrl;
    private final String database;
    private final String username;
    private final String password;

    @Autowired
    public OdooWineCatalogClient(
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

    /** Lightweight constructor used by pure parsing tests. */
    OdooWineCatalogClient(ObjectMapper objectMapper, String baseUrl, String database,
                          String username, String password) {
        this(objectMapper, null, baseUrl, database, username, password);
    }

    public boolean isConfigured() {
        return !baseUrl.isBlank() && !database.isBlank() && !username.isBlank() && !password.isBlank();
    }

    public List<WineCandidate> listWines() {
        return listWines(null);
    }

    public List<WineCandidate> listWines(Long vendorId) {
        if (!isConfigured()) return List.of();
        try {
            Map<String, Object> context = contextFor(vendorId);
            if (vendorId != null && context == null) return List.of();
            String sessionId = authenticate();
            ArrayNode records = searchRead(sessionId, context);
            List<WineCandidate> out = new ArrayList<>();
            for (JsonNode row : records) {
                WineCandidate candidate = toCandidate(row);
                if (candidate != null) out.add(candidate);
            }
            return out;
        } catch (Exception e) {
            log.warn("Odoo wine catalog unavailable type={}", e.getClass().getSimpleName());
            return List.of();
        }
    }

    private String authenticate() throws Exception {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("db", database);
        params.put("login", username);
        params.put("password", password);
        HttpResponse<String> response = postJson(baseUrl + "/web/session/authenticate", params, null);
        JsonNode root = objectMapper.readTree(response.body());
        if (root.path("result").path("uid").isMissingNode() || root.path("result").path("uid").isNull()) {
            throw new IllegalStateException("Odoo service account authentication failed");
        }
        String setCookie = response.headers().firstValue("set-cookie").orElse("");
        for (String part : setCookie.split(",")) {
            for (String crumb : part.split(";")) {
                String trimmed = crumb.trim();
                if (trimmed.startsWith("session_id=")) {
                    return trimmed.substring("session_id=".length());
                }
            }
        }
        // Fallback: some proxies fold cookies differently
        List<String> cookies = response.headers().allValues("set-cookie");
        for (String cookie : cookies) {
            int idx = cookie.indexOf("session_id=");
            if (idx >= 0) {
                String rest = cookie.substring(idx + "session_id=".length());
                int end = rest.indexOf(';');
                return end >= 0 ? rest.substring(0, end) : rest;
            }
        }
        throw new IllegalStateException("Odoo did not return a session cookie");
    }

    private ArrayNode searchRead(String sessionId, Map<String, Object> context) throws Exception {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("model", "product.product");
        params.put("method", "search_read");
        ArrayNode args = params.putArray("args");
        ArrayNode domain = args.addArray();
        ArrayNode avail = domain.addArray();
        avail.add("available_in_pos");
        avail.add("=");
        avail.add(true);
        ObjectNode kwargs = params.putObject("kwargs");
        if (context != null && !context.isEmpty()) {
            JsonNode contextNode = objectMapper.valueToTree(context);
            kwargs.set("context", contextNode);
        }
        ArrayNode fields = kwargs.putArray("fields");
        fields.add("id");
        fields.add("name");
        fields.add("display_name");
        fields.add("description_sale");
        fields.add("list_price");
        fields.add("lst_price");
        fields.add("qty_available");
        fields.add("free_qty");
        fields.add("categ_id");
        fields.add("default_code");
        kwargs.put("limit", 500);

        HttpResponse<String> response = postJson(baseUrl + "/web/dataset/call_kw", params, sessionId);
        JsonNode root = objectMapper.readTree(response.body());
        if (!root.path("error").isMissingNode() && !root.path("error").isNull()) {
            throw new IllegalStateException(root.path("error").path("data").path("message").asText("Odoo search_read failed"));
        }
        JsonNode result = root.path("result");
        if (!result.isArray()) return objectMapper.createArrayNode();
        return (ArrayNode) result;
    }

    Map<String, Object> contextFor(Long vendorId) {
        if (vendorId == null || vendorMapper == null) return null;
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null || vendor.getOdooCompanyId() == null || vendor.getOdooCompanyId() <= 0
                || !"ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())) {
            return null;
        }
        Map<String, Object> context = new java.util.LinkedHashMap<>();
        context.put("allowed_company_ids", List.of(vendor.getOdooCompanyId()));
        context.put("force_company", vendor.getOdooCompanyId());
        if (vendor.getOdooWarehouseId() != null && vendor.getOdooWarehouseId() > 0) {
            context.put("warehouse", vendor.getOdooWarehouseId());
        }
        return context;
    }

    WineCandidate toCandidate(JsonNode row) {
        long id = row.path("id").asLong(0);
        String name = text(row, "display_name");
        if (name.isBlank()) name = text(row, "name");
        if (id <= 0 || name.isBlank()) return null;
        String category = "";
        JsonNode categ = row.path("categ_id");
        if (categ.isArray() && categ.size() > 1) category = categ.get(1).asText("");
        String description = text(row, "description_sale");
        String searchable = (name + " " + category).toLowerCase(Locale.ROOT);
        if (isClearlyNotWine(searchable)) return null;
        if (!WineLexicon.looksLikeWine(name, category, "")) {
            // DEMO seed data also contains snacks and soft drinks. Only keep
            // explicit wine terms; the SKU prefix itself is not a wine signal.
            if (!name.toUpperCase(Locale.ROOT).contains("SHIRAZ")
                    && !name.toUpperCase(Locale.ROOT).contains("SAUVIGNON")
                    && !name.toUpperCase(Locale.ROOT).contains("WINE")) {
                return null;
            }
        }
        JsonNode posPrice = row.path("lst_price");
        BigDecimal price = decimal(posPrice.isMissingNode() || posPrice.isNull()
                ? row.path("list_price")
                : posPrice);
        JsonNode freeStock = row.path("free_qty");
        BigDecimal stock = decimal(freeStock.isMissingNode() || freeStock.isNull()
                ? row.path("qty_available")
                : freeStock);
        WineProfile profile = WineLexicon.infer(name, category, "", description);
        return new WineCandidate(
                id,
                name,
                description.isBlank() ? null : description,
                null,
                category.isBlank() ? null : category,
                null,
                null,
                price,
                price,
                false,
                stock,
                true,
                BigDecimal.ONE,
                profile
        );
    }

    private static boolean isClearlyNotWine(String searchable) {
        return searchable.matches(".*\\b(water|cola|chips|nuts|vodka|whisky|whiskey|gin|beer|lager|ale|cider|juice|soft drink)\\b.*");
    }

    private HttpResponse<String> postJson(String url, ObjectNode params, String sessionId) throws Exception {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("jsonrpc", "2.0");
        body.put("method", "call");
        body.set("params", params);
        body.put("id", System.currentTimeMillis());
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        if (sessionId != null && !sessionId.isBlank()) {
            builder.header("Cookie", "session_id=" + sessionId);
        }
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) {
            throw new IllegalStateException("Odoo HTTP " + response.statusCode());
        }
        return response;
    }

    private static String text(JsonNode row, String field) {
        JsonNode node = row.path(field);
        if (node.isNull() || node.isMissingNode() || node.isBoolean()) return "";
        return node.asText("").trim();
    }

    private static BigDecimal decimal(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) return BigDecimal.ZERO;
        try {
            return new BigDecimal(node.asText("0"));
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }
}
