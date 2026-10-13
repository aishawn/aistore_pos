package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    private final String baseUrl;
    private final String database;
    private final String username;
    private final String password;

    public OdooWineCatalogClient(
            ObjectMapper objectMapper,
            @Value("${ODOO_BASE_URL:}") String baseUrl,
            @Value("${ODOO_DATABASE:aipos}") String database,
            @Value("${ODOO_SERVICE_USERNAME:}") String username,
            @Value("${ODOO_SERVICE_PASSWORD:}") String password) {
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
        this.database = database == null ? "" : database.trim();
        this.username = username == null ? "" : username.trim();
        this.password = password == null ? "" : password;
    }

    public boolean isConfigured() {
        return !baseUrl.isBlank() && !database.isBlank() && !username.isBlank() && !password.isBlank();
    }

    public List<WineCandidate> listWines() {
        if (!isConfigured()) return List.of();
        try {
            String sessionId = authenticate();
            ArrayNode records = searchRead(sessionId);
            List<WineCandidate> out = new ArrayList<>();
            for (JsonNode row : records) {
                WineCandidate candidate = toCandidate(row);
                if (candidate != null) out.add(candidate);
            }
            return out;
        } catch (Exception e) {
            log.warn("Odoo wine catalog unavailable: {}", e.getMessage());
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

    private ArrayNode searchRead(String sessionId) throws Exception {
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
        ArrayNode fields = kwargs.putArray("fields");
        fields.add("id");
        fields.add("name");
        fields.add("display_name");
        fields.add("description_sale");
        fields.add("list_price");
        fields.add("qty_available");
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

    private WineCandidate toCandidate(JsonNode row) {
        long id = row.path("id").asLong(0);
        String name = text(row, "display_name");
        if (name.isBlank()) name = text(row, "name");
        if (id <= 0 || name.isBlank()) return null;
        String category = "";
        JsonNode categ = row.path("categ_id");
        if (categ.isArray() && categ.size() > 1) category = categ.get(1).asText("");
        String description = text(row, "description_sale");
        if (!WineLexicon.looksLikeWine(name, category, "")
                && !name.toLowerCase(Locale.ROOT).contains("demo")) {
            // Keep DEMO wine SKUs even when lexicon is narrow.
            if (!name.toUpperCase(Locale.ROOT).contains("SHIRAZ")
                    && !name.toUpperCase(Locale.ROOT).contains("SAUVIGNON")
                    && !name.toUpperCase(Locale.ROOT).contains("WINE")) {
                return null;
            }
        }
        BigDecimal price = decimal(row.path("list_price"));
        BigDecimal stock = decimal(row.path("qty_available"));
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
