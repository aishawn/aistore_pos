package com.orithos.tenant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Creates (or links) an Odoo company + POS config for a vendor and persists the binding.
 */
@Service
public class OdooTenantProvisioner {

    private static final Logger log = LoggerFactory.getLogger(OdooTenantProvisioner.class);

    private final VendorMapper vendorMapper;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private final String baseUrl;
    private final String database;
    private final String username;
    private final String password;

    public OdooTenantProvisioner(
            VendorMapper vendorMapper,
            ObjectMapper objectMapper,
            @Value("${ODOO_BASE_URL:}") String baseUrl,
            @Value("${ODOO_DATABASE:aipos}") String database,
            @Value("${ODOO_SERVICE_USERNAME:}") String username,
            @Value("${ODOO_SERVICE_PASSWORD:}") String password) {
        this.vendorMapper = vendorMapper;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl == null ? "" : baseUrl.trim().replaceAll("/+$", "");
        this.database = database == null ? "" : database.trim();
        this.username = username == null ? "" : username.trim();
        this.password = password == null ? "" : password;
    }

    public boolean isConfigured() {
        return !baseUrl.isBlank() && !database.isBlank() && !username.isBlank() && !password.isBlank();
    }

    public void provisionAsyncSafe(Long vendorId) {
        try {
            provision(vendorId);
        } catch (Exception e) {
            log.warn("Odoo provision failed for vendor {}: {}", vendorId, e.getMessage());
        }
    }

    public Vendor provision(Long vendorId) {
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) throw new IllegalArgumentException("vendor not found");

        String prefix = "shopfront/" + vendor.getSubdomain() + "/";
        vendor.setR2Prefix(prefix);

        if (!isConfigured()) {
            vendor.setOdooProvisionStatus("failed");
            vendor.setOdooProvisionError("Odoo service account is not configured (ODOO_SERVICE_*).");
            vendorMapper.updateOdooBinding(vendor);
            return vendor;
        }

        vendor.setOdooProvisionStatus("pending");
        vendor.setOdooProvisionError(null);
        vendorMapper.updateOdooBinding(vendor);

        try {
            String sessionId = authenticate();
            long companyId = createCompany(sessionId, vendor.getName());
            long[] warehouse = findWarehouse(sessionId, companyId);
            long posConfigId = createPosConfig(sessionId, vendor.getName(), companyId);
            addCompanyToServiceUser(sessionId, companyId);

            vendor.setOdooCompanyId(companyId);
            vendor.setOdooPosConfigId(posConfigId);
            vendor.setOdooWarehouseId(warehouse[0] > 0 ? warehouse[0] : null);
            vendor.setOdooStockLocationId(warehouse[1] > 0 ? warehouse[1] : null);
            vendor.setOdooProvisionStatus("ready");
            vendor.setOdooProvisionError(null);
            vendorMapper.updateOdooBinding(vendor);
            return vendor;
        } catch (Exception e) {
            vendor.setOdooProvisionStatus("failed");
            String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            vendor.setOdooProvisionError(msg.length() > 500 ? msg.substring(0, 500) : msg);
            vendorMapper.updateOdooBinding(vendor);
            throw new IllegalStateException(msg, e);
        }
    }

    public Vendor linkManual(Long vendorId, Long companyId, Long posConfigId, Long warehouseId, Long stockLocationId) {
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) throw new IllegalArgumentException("vendor not found");
        vendor.setOdooCompanyId(companyId);
        vendor.setOdooPosConfigId(posConfigId);
        vendor.setOdooWarehouseId(warehouseId);
        vendor.setOdooStockLocationId(stockLocationId);
        vendor.setOdooProvisionStatus(companyId != null ? "ready" : "unmapped");
        vendor.setOdooProvisionError(null);
        if (vendor.getR2Prefix() == null || vendor.getR2Prefix().isBlank()) {
            vendor.setR2Prefix("shopfront/" + vendor.getSubdomain() + "/");
        }
        vendorMapper.updateOdooBinding(vendor);
        return vendor;
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
        for (String cookie : response.headers().allValues("set-cookie")) {
            int idx = cookie.indexOf("session_id=");
            if (idx >= 0) {
                String rest = cookie.substring(idx + "session_id=".length());
                int end = rest.indexOf(';');
                return end >= 0 ? rest.substring(0, end) : rest;
            }
        }
        throw new IllegalStateException("Odoo session cookie missing");
    }

    private long createCompany(String sessionId, String name) throws Exception {
        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", name);
        Number id = callKw(sessionId, "res.company", "create", List.of(values), objectMapper.createObjectNode());
        if (id == null) throw new IllegalStateException("res.company.create returned no id");
        return id.longValue();
    }

    private long[] findWarehouse(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode clause = objectMapper.createArrayNode();
        clause.add("company_id");
        clause.add("=");
        clause.add(companyId);
        domain.add(clause);
        ObjectNode kwargs = objectMapper.createObjectNode();
        kwargs.set("domain", domain);
        ArrayNode fields = objectMapper.createArrayNode();
        fields.add("id");
        fields.add("lot_stock_id");
        kwargs.set("fields", fields);
        kwargs.put("limit", 1);
        JsonNode rows = callKwNode(sessionId, "stock.warehouse", "search_read", List.of(domain), kwargs);
        if (rows != null && rows.isArray() && !rows.isEmpty()) {
            JsonNode row = rows.get(0);
            long wid = row.path("id").asLong(0);
            long lid = 0;
            JsonNode lot = row.get("lot_stock_id");
            if (lot != null && lot.isArray() && lot.size() > 0) lid = lot.get(0).asLong(0);
            return new long[]{wid, lid};
        }
        return new long[]{0, 0};
    }

    private long createPosConfig(String sessionId, String name, long companyId) throws Exception {
        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", name + " Register");
        values.put("company_id", companyId);
        Number id = callKw(sessionId, "pos.config", "create", List.of(values), objectMapper.createObjectNode());
        if (id == null) throw new IllegalStateException("pos.config.create returned no id");
        return id.longValue();
    }

    private void addCompanyToServiceUser(String sessionId, long companyId) throws Exception {
        ObjectNode authParams = objectMapper.createObjectNode();
        // read current uid from session
        HttpResponse<String> info = postJson(baseUrl + "/web/session/get_session_info", objectMapper.createObjectNode(), sessionId);
        JsonNode root = objectMapper.readTree(info.body());
        long uid = root.path("result").path("uid").asLong(0);
        if (uid <= 0) return;
        JsonNode users = callKwNode(sessionId, "res.users", "read", List.of(List.of(uid)),
                objectMapper.createObjectNode().set("fields", objectMapper.createArrayNode().add("company_ids")));
        List<Long> companyIds = new ArrayList<>();
        if (users != null && users.isArray() && !users.isEmpty()) {
            JsonNode ids = users.get(0).get("company_ids");
            if (ids != null && ids.isArray()) {
                for (JsonNode id : ids) companyIds.add(id.asLong());
            }
        }
        if (!companyIds.contains(companyId)) companyIds.add(companyId);
        ObjectNode values = objectMapper.createObjectNode();
        ArrayNode arr = values.putArray("company_ids");
        ArrayNode cmd = arr.addArray();
        cmd.add(6);
        cmd.add(0);
        ArrayNode list = cmd.addArray();
        for (Long id : companyIds) list.add(id);
        callKw(sessionId, "res.users", "write", List.of(List.of(uid), values), objectMapper.createObjectNode());
    }

    private Number callKw(String sessionId, String model, String method, List<?> args, ObjectNode kwargs) throws Exception {
        JsonNode result = callKwNode(sessionId, model, method, args, kwargs);
        if (result == null || result.isNull()) return null;
        if (result.isNumber()) return result.numberValue();
        if (result.isArray() && !result.isEmpty() && result.get(0).isNumber()) return result.get(0).numberValue();
        return null;
    }

    private JsonNode callKwNode(String sessionId, String model, String method, List<?> args, ObjectNode kwargs) throws Exception {
        ObjectNode params = objectMapper.createObjectNode();
        params.put("model", model);
        params.put("method", method);
        params.set("args", objectMapper.valueToTree(args));
        params.set("kwargs", kwargs == null ? objectMapper.createObjectNode() : kwargs);
        HttpResponse<String> response = postJson(baseUrl + "/web/dataset/call_kw", params, sessionId);
        JsonNode root = objectMapper.readTree(response.body());
        if (root.has("error") && !root.get("error").isNull()) {
            String message = root.path("error").path("data").path("message").asText(
                    root.path("error").path("message").asText("Odoo RPC error"));
            throw new IllegalStateException(message);
        }
        return root.get("result");
    }

    private HttpResponse<String> postJson(String url, ObjectNode params, String sessionId) throws Exception {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("jsonrpc", "2.0");
        body.put("method", "call");
        body.set("params", params);
        body.put("id", System.currentTimeMillis());
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(45))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        if (sessionId != null && !sessionId.isBlank()) {
            builder.header("Cookie", "session_id=" + sessionId);
        }
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
