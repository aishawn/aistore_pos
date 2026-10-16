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
            prepareCompanyBasics(sessionId, companyId, vendor.getName());
            long[] warehouse = ensureWarehouse(sessionId, companyId, vendor.getName(), vendor.getSubdomain());
            ensurePaymentMethods(sessionId, companyId);
            long posConfigId = createPosConfig(sessionId, vendor.getName(), companyId, warehouse);
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
        // Reuse an existing company with the same name so retries after a mid-flight failure
        // do not leave duplicate empty companies.
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode clause = objectMapper.createArrayNode();
        clause.add("name");
        clause.add("=");
        clause.add(name);
        domain.add(clause);
        ObjectNode kwargs = objectMapper.createObjectNode();
        kwargs.set("fields", objectMapper.createArrayNode().add("id"));
        kwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "res.company", "search_read", List.of(domain), kwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            if (id > 0) return id;
        }
        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", name);
        Number id = callKw(sessionId, "res.company", "create", List.of(values), objectMapper.createObjectNode());
        if (id == null) throw new IllegalStateException("res.company.create returned no id");
        return id.longValue();
    }

    private ObjectNode companyContext(long companyId) {
        ObjectNode context = objectMapper.createObjectNode();
        ArrayNode allowed = context.putArray("allowed_company_ids");
        allowed.add(companyId);
        context.put("force_company", companyId);
        return context;
    }

    private ObjectNode kwargsWithCompany(long companyId) {
        ObjectNode kwargs = objectMapper.createObjectNode();
        kwargs.set("context", companyContext(companyId));
        return kwargs;
    }

    private void prepareCompanyBasics(String sessionId, long companyId, String name) throws Exception {
        // Prefer Australia fiscal country when available (pilot market).
        ArrayNode countryDomain = objectMapper.createArrayNode();
        ArrayNode codeClause = objectMapper.createArrayNode();
        codeClause.add("code");
        codeClause.add("=");
        codeClause.add("AU");
        countryDomain.add(codeClause);
        ObjectNode countryKwargs = objectMapper.createObjectNode();
        countryKwargs.set("fields", objectMapper.createArrayNode().add("id"));
        countryKwargs.put("limit", 1);
        JsonNode countries = callKwNode(sessionId, "res.country", "search_read", List.of(countryDomain), countryKwargs);
        if (countries != null && countries.isArray() && !countries.isEmpty()) {
            long countryId = countries.get(0).path("id").asLong(0);
            if (countryId > 0) {
                ObjectNode values = objectMapper.createObjectNode();
                values.put("country_id", countryId);
                values.put("account_fiscal_country_id", countryId);
                callKw(sessionId, "res.company", "write", List.of(List.of(companyId), values), kwargsWithCompany(companyId));
            }
        }

        // Minimal journals required before POS config / payment methods can be company-scoped.
        ensureJournal(sessionId, companyId, "Cash", shortCode("CSH", companyId), "cash");
        ensureJournal(sessionId, companyId, "Bank", shortCode("BNK", companyId), "bank");
        ensureJournal(sessionId, companyId, "Sales", shortCode("SAL", companyId), "sale");
        ensureJournal(sessionId, companyId, "Point of Sale", shortCode("POS", companyId), "general");
    }

    private static String shortCode(String prefix, long companyId) {
        String suffix = Long.toString(companyId);
        String code = prefix + suffix;
        return code.length() <= 5 ? code : prefix.substring(0, Math.max(1, 5 - suffix.length())) + suffix;
    }

    private long ensureJournal(String sessionId, long companyId, String name, String code, String type) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode companyClause = objectMapper.createArrayNode();
        companyClause.add("company_id");
        companyClause.add("=");
        companyClause.add(companyId);
        domain.add(companyClause);
        ArrayNode codeClause = objectMapper.createArrayNode();
        codeClause.add("code");
        codeClause.add("=");
        codeClause.add(code);
        domain.add(codeClause);
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id"));
        findKwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "account.journal", "search_read", List.of(domain), findKwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            if (id > 0) return id;
        }
        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", name);
        values.put("code", code);
        values.put("type", type);
        values.put("company_id", companyId);
        Number id = callKw(sessionId, "account.journal", "create", List.of(values), kwargsWithCompany(companyId));
        if (id == null) throw new IllegalStateException("account.journal.create returned no id for " + code);
        return id.longValue();
    }

    private long[] ensureWarehouse(String sessionId, long companyId, String companyName, String subdomain) throws Exception {
        long[] existing = findWarehouse(sessionId, companyId);
        if (existing[0] > 0) return existing;

        String codeBase = subdomain == null ? "WH" : subdomain.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        if (codeBase.isBlank()) codeBase = "WH";
        String code = codeBase.length() <= 5 ? codeBase : codeBase.substring(0, 5);
        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", companyName + " WH");
        values.put("code", code);
        values.put("company_id", companyId);
        Number id = callKw(sessionId, "stock.warehouse", "create", List.of(values), kwargsWithCompany(companyId));
        if (id == null) throw new IllegalStateException("stock.warehouse.create returned no id");
        return findWarehouse(sessionId, companyId);
    }

    private long[] findWarehouse(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode clause = objectMapper.createArrayNode();
        clause.add("company_id");
        clause.add("=");
        clause.add(companyId);
        domain.add(clause);
        ObjectNode kwargs = kwargsWithCompany(companyId);
        // Domain belongs in args only — putting it in kwargs too raises:
        // "search_read() got multiple values for argument 'domain'" (Odoo 18).
        ArrayNode fields = objectMapper.createArrayNode();
        fields.add("id");
        fields.add("lot_stock_id");
        fields.add("out_type_id");
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

    private long findWarehouseOutType(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode clause = objectMapper.createArrayNode();
        clause.add("company_id");
        clause.add("=");
        clause.add(companyId);
        domain.add(clause);
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode().add("id").add("out_type_id"));
        kwargs.put("limit", 1);
        JsonNode rows = callKwNode(sessionId, "stock.warehouse", "search_read", List.of(domain), kwargs);
        if (rows != null && rows.isArray() && !rows.isEmpty()) {
            JsonNode out = rows.get(0).get("out_type_id");
            if (out != null && out.isArray() && out.size() > 0) return out.get(0).asLong(0);
        }
        return 0;
    }

    private List<Long> ensurePaymentMethods(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode clause = objectMapper.createArrayNode();
        clause.add("company_id");
        clause.add("=");
        clause.add(companyId);
        domain.add(clause);
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id").add("name"));
        findKwargs.put("limit", 20);
        JsonNode existing = callKwNode(sessionId, "pos.payment.method", "search_read", List.of(domain), findKwargs);
        List<Long> ids = new ArrayList<>();
        if (existing != null && existing.isArray()) {
            for (JsonNode row : existing) {
                long id = row.path("id").asLong(0);
                if (id > 0) ids.add(id);
            }
        }
        if (!ids.isEmpty()) return ids;

        long cashJournal = ensureJournal(sessionId, companyId, "Cash", shortCode("CSH", companyId), "cash");
        long bankJournal = ensureJournal(sessionId, companyId, "Bank", shortCode("BNK", companyId), "bank");

        ObjectNode cash = objectMapper.createObjectNode();
        cash.put("name", "Cash");
        cash.put("company_id", companyId);
        cash.put("journal_id", cashJournal);
        cash.put("is_cash_count", true);
        cash.put("payment_method_type", "cash");
        Number cashId = callKw(sessionId, "pos.payment.method", "create", List.of(cash), kwargsWithCompany(companyId));
        if (cashId == null) throw new IllegalStateException("pos.payment.method.create Cash failed");

        ObjectNode card = objectMapper.createObjectNode();
        card.put("name", "Card");
        card.put("company_id", companyId);
        card.put("journal_id", bankJournal);
        card.put("is_cash_count", false);
        card.put("payment_method_type", "bank");
        Number cardId = callKw(sessionId, "pos.payment.method", "create", List.of(card), kwargsWithCompany(companyId));
        if (cardId == null) throw new IllegalStateException("pos.payment.method.create Card failed");

        return List.of(cashId.longValue(), cardId.longValue());
    }

    private long createPosConfig(String sessionId, String name, long companyId, long[] warehouse) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode companyClause = objectMapper.createArrayNode();
        companyClause.add("company_id");
        companyClause.add("=");
        companyClause.add(companyId);
        domain.add(companyClause);
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id").add("name"));
        findKwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "pos.config", "search_read", List.of(domain), findKwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            if (id > 0) return id;
        }

        List<Long> paymentMethodIds = ensurePaymentMethods(sessionId, companyId);
        long outTypeId = findWarehouseOutType(sessionId, companyId);
        if (outTypeId <= 0) {
            throw new IllegalStateException("No stock picking type available for the new Odoo company warehouse.");
        }
        long posJournal = ensureJournal(sessionId, companyId, "Point of Sale", shortCode("POS", companyId), "general");
        long saleJournal = ensureJournal(sessionId, companyId, "Sales", shortCode("SAL", companyId), "sale");

        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", name + " Register");
        values.put("company_id", companyId);
        values.put("picking_type_id", outTypeId);
        values.put("journal_id", posJournal);
        values.put("invoice_journal_id", saleJournal);
        values.put("iface_tax_included", "total");
        values.put("picking_policy", "direct");
        ArrayNode paymentCmds = values.putArray("payment_method_ids");
        ArrayNode replace = paymentCmds.addArray();
        replace.add(6);
        replace.add(0);
        ArrayNode pmList = replace.addArray();
        for (Long paymentMethodId : paymentMethodIds) pmList.add(paymentMethodId);

        Number id = callKw(sessionId, "pos.config", "create", List.of(values), kwargsWithCompany(companyId));
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
