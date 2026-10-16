package com.orithos.tenant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orithos.modules.register.Outlet;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.register.RegisterMapper;
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
    private final OutletMapper outletMapper;
    private final RegisterMapper registerMapper;
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
            OutletMapper outletMapper,
            RegisterMapper registerMapper,
            ObjectMapper objectMapper,
            @Value("${ODOO_BASE_URL:}") String baseUrl,
            @Value("${ODOO_DATABASE:aipos}") String database,
            @Value("${ODOO_SERVICE_USERNAME:}") String username,
            @Value("${ODOO_SERVICE_PASSWORD:}") String password) {
        this.vendorMapper = vendorMapper;
        this.outletMapper = outletMapper;
        this.registerMapper = registerMapper;
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
        provisionAsyncSafe(vendorId, false);
    }

    public void provisionAsyncSafe(Long vendorId, boolean seedDummyData) {
        try {
            provision(vendorId, seedDummyData);
        } catch (Exception e) {
            log.warn("Odoo provision failed for vendor {}: {}", vendorId, e.getMessage());
        }
    }

    public Vendor provision(Long vendorId) {
        return provision(vendorId, false);
    }

    public Vendor provision(Long vendorId, boolean seedDummyData) {
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
            // Payment methods are created per POS config: Odoo forbids sharing one cash PM / cash journal
            // across multiple pos.config records.

            List<Outlet> outlets = outletMapper.findByVendorId(vendorId);
            long primaryPosConfigId = 0;
            if (outlets == null || outlets.isEmpty()) {
                primaryPosConfigId = ensurePosConfig(sessionId, vendor.getName() + " Register", companyId);
            } else {
                for (Outlet outlet : outlets) {
                    String outletName = (outlet.getName() == null || outlet.getName().isBlank()
                            ? vendor.getName()
                            : outlet.getName());
                    var registers = registerMapper.findByOutletId(outlet.getId());
                    int registerCount = registers == null || registers.isEmpty() ? 1 : registers.size();
                    for (String configName : registerConfigNames(outletName, registerCount)) {
                        long configId = ensurePosConfig(sessionId, configName, companyId);
                        if (primaryPosConfigId <= 0) primaryPosConfigId = configId;
                    }
                }
            }
            if (primaryPosConfigId <= 0) {
                throw new IllegalStateException("No POS config was created for the new Odoo company.");
            }

            addCompanyToServiceUser(sessionId, companyId);
            if (seedDummyData) {
                try {
                    seedDummyCatalog(sessionId, companyId);
                } catch (Exception seedError) {
                    log.warn("Dummy catalog seed failed for vendor {}: {}", vendorId, seedError.getMessage());
                }
            }

            vendor.setOdooCompanyId(companyId);
            vendor.setOdooPosConfigId(primaryPosConfigId);
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

    static List<String> registerConfigNames(String outletName, int registerCount) {
        String baseName = (outletName == null || outletName.isBlank() ? "Store" : outletName.trim()) + " Register";
        int count = Math.max(1, registerCount);
        List<String> names = new ArrayList<>(count);
        for (int index = 1; index <= count; index++) {
            names.add(count == 1 ? baseName : baseName + " " + index);
        }
        return names;
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

    /**
     * Odoo requires a dedicated cash payment method (and cash journal) per POS config.
     * Card / bank methods may be shared across configs on the same company.
     */
    private List<Long> ensurePaymentMethodsForPos(String sessionId, long companyId, String configName) throws Exception {
        long cardId = ensureSharedCardPaymentMethod(sessionId, companyId);
        long cashId = ensureDedicatedCashPaymentMethod(sessionId, companyId, configName);
        return List.of(cashId, cardId);
    }

    private long ensureSharedCardPaymentMethod(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("name").add("=").add("Card"));
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id"));
        findKwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "pos.payment.method", "search_read", List.of(domain), findKwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            if (id > 0) return id;
        }
        long bankJournal = ensureJournal(sessionId, companyId, "Bank", shortCode("BNK", companyId), "bank");
        ObjectNode card = objectMapper.createObjectNode();
        card.put("name", "Card");
        card.put("company_id", companyId);
        card.put("journal_id", bankJournal);
        card.put("is_cash_count", false);
        card.put("payment_method_type", "bank");
        Number cardId = callKw(sessionId, "pos.payment.method", "create", List.of(card), kwargsWithCompany(companyId));
        if (cardId == null) throw new IllegalStateException("pos.payment.method.create Card failed");
        return cardId.longValue();
    }

    private long ensureDedicatedCashPaymentMethod(String sessionId, long companyId, String configName) throws Exception {
        String pmName = "Cash (" + truncateLabel(configName, 40) + ")";
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("name").add("=").add(pmName));
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id"));
        findKwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "pos.payment.method", "search_read", List.of(domain), findKwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            if (id > 0) return id;
        }

        String journalName = "Cash (" + truncateLabel(configName, 40) + ")";
        String journalCode = uniqueCashJournalCode(sessionId, companyId, configName);
        long cashJournal = ensureJournal(sessionId, companyId, journalName, journalCode, "cash");

        ObjectNode cash = objectMapper.createObjectNode();
        cash.put("name", pmName);
        cash.put("company_id", companyId);
        cash.put("journal_id", cashJournal);
        cash.put("is_cash_count", true);
        cash.put("payment_method_type", "cash");
        Number cashId = callKw(sessionId, "pos.payment.method", "create", List.of(cash), kwargsWithCompany(companyId));
        if (cashId == null) throw new IllegalStateException("pos.payment.method.create Cash failed for " + configName);
        return cashId.longValue();
    }

    private String uniqueCashJournalCode(String sessionId, long companyId, String configName) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("type").add("=").add("cash"));
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id").add("code"));
        findKwargs.put("limit", 50);
        JsonNode existing = callKwNode(sessionId, "account.journal", "search_read", List.of(domain), findKwargs);
        int used = existing != null && existing.isArray() ? existing.size() : 0;
        // Prefer CSH{companyId} for the first register; then C{companyId}{n} within 5 chars.
        if (used == 0) {
            return shortCode("CSH", companyId);
        }
        for (int n = used + 1; n < used + 20; n++) {
            String candidate = shortCode("C" + n, companyId);
            if (candidate.length() > 5) {
                candidate = ("C" + n + companyId);
                if (candidate.length() > 5) candidate = candidate.substring(0, 5);
            }
            boolean taken = false;
            if (existing != null && existing.isArray()) {
                for (JsonNode row : existing) {
                    if (candidate.equalsIgnoreCase(row.path("code").asText(""))) {
                        taken = true;
                        break;
                    }
                }
            }
            if (!taken) return candidate;
        }
        int hash = Math.floorMod(configName.hashCode(), 1000);
        String fallback = "C" + hash;
        return fallback.length() <= 5 ? fallback : fallback.substring(0, 5);
    }

    private static String truncateLabel(String value, int max) {
        if (value == null) return "POS";
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return "POS";
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    private long ensurePosConfig(String sessionId, String configName, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode companyClause = objectMapper.createArrayNode();
        companyClause.add("company_id");
        companyClause.add("=");
        companyClause.add(companyId);
        domain.add(companyClause);
        ArrayNode nameClause = objectMapper.createArrayNode();
        nameClause.add("name");
        nameClause.add("=");
        nameClause.add(configName);
        domain.add(nameClause);
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id").add("name"));
        findKwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "pos.config", "search_read", List.of(domain), findKwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            if (id > 0) return id;
        }

        List<Long> paymentMethodIds = ensurePaymentMethodsForPos(sessionId, companyId, configName);
        long outTypeId = findWarehouseOutType(sessionId, companyId);
        if (outTypeId <= 0) {
            throw new IllegalStateException("No stock picking type available for the new Odoo company warehouse.");
        }
        long posJournal = ensureJournal(sessionId, companyId, "Point of Sale", shortCode("POS", companyId), "general");
        long saleJournal = ensureJournal(sessionId, companyId, "Sales", shortCode("SAL", companyId), "sale");

        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", configName);
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

    private void seedDummyCatalog(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode companyClause = objectMapper.createArrayNode();
        companyClause.add("company_id");
        companyClause.add("=");
        companyClause.add(companyId);
        domain.add(companyClause);
        ArrayNode posClause = objectMapper.createArrayNode();
        posClause.add("available_in_pos");
        posClause.add("=");
        posClause.add(true);
        domain.add(posClause);
        ObjectNode countKwargs = kwargsWithCompany(companyId);
        JsonNode existing = callKwNode(sessionId, "product.product", "search_count", List.of(domain), countKwargs);
        if (existing != null && existing.isNumber() && existing.asInt() > 0) {
            return;
        }

        long taxId = ensureSaleGstTax(sessionId, companyId);
        String[][] samples = {
                {"DEMO Shiraz 750ml", "DEMO-SHIRAZ", "28.50"},
                {"DEMO Sauvignon Blanc 750ml", "DEMO-SB", "24.90"},
                {"DEMO IPA 4-pack", "DEMO-IPA", "22.00"},
        };
        int created = 0;
        for (String[] sample : samples) {
            try {
                ObjectNode values = objectMapper.createObjectNode();
                values.put("name", sample[0]);
                values.put("default_code", sample[1]);
                values.put("list_price", Double.parseDouble(sample[2]));
                values.put("available_in_pos", true);
                values.put("sale_ok", true);
                values.put("purchase_ok", true);
                values.put("type", "consu");
                values.put("company_id", companyId);
                if (taxId > 0) {
                    ArrayNode taxes = values.putArray("taxes_id");
                    ArrayNode cmd = taxes.addArray();
                    cmd.add(6);
                    cmd.add(0);
                    ArrayNode ids = cmd.addArray();
                    ids.add(taxId);
                }
                Number id = callKw(sessionId, "product.template", "create", List.of(values), kwargsWithCompany(companyId));
                if (id != null) created++;
            } catch (Exception productError) {
                log.warn("Dummy product {} failed for company {}: {}", sample[1], companyId, productError.getMessage());
            }
        }
        log.info("Seeded dummy POS catalog for Odoo company {} ({} products)", companyId, created);
        if (created == 0) {
            throw new IllegalStateException("Dummy catalog seed created 0 products for company " + companyId);
        }
    }

    private long ensureSaleGstTax(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        ArrayNode companyClause = objectMapper.createArrayNode();
        companyClause.add("company_id");
        companyClause.add("=");
        companyClause.add(companyId);
        domain.add(companyClause);
        ArrayNode typeClause = objectMapper.createArrayNode();
        typeClause.add("type_tax_use");
        typeClause.add("=");
        typeClause.add("sale");
        domain.add(typeClause);
        ArrayNode amountClause = objectMapper.createArrayNode();
        amountClause.add("amount");
        amountClause.add("=");
        amountClause.add(10);
        domain.add(amountClause);
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id"));
        findKwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "account.tax", "search_read", List.of(domain), findKwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            return existing.get(0).path("id").asLong(0);
        }

        // Prefer an existing company tax of any sale rate over failing create without chart/tax groups.
        ArrayNode anySaleDomain = objectMapper.createArrayNode();
        anySaleDomain.add(companyClause.deepCopy());
        anySaleDomain.add(typeClause.deepCopy());
        JsonNode anySale = callKwNode(sessionId, "account.tax", "search_read", List.of(anySaleDomain), findKwargs);
        if (anySale != null && anySale.isArray() && !anySale.isEmpty()) {
            return anySale.get(0).path("id").asLong(0);
        }

        long taxGroupId = 0;
        try {
            ObjectNode groupKwargs = kwargsWithCompany(companyId);
            groupKwargs.set("fields", objectMapper.createArrayNode().add("id"));
            groupKwargs.put("limit", 1);
            JsonNode groups = callKwNode(sessionId, "account.tax.group", "search_read", List.of(objectMapper.createArrayNode()), groupKwargs);
            if (groups != null && groups.isArray() && !groups.isEmpty()) {
                taxGroupId = groups.get(0).path("id").asLong(0);
            }
        } catch (Exception ignored) {
            // Odoo builds without tax groups / chart stay product-only for dummy seed.
        }
        if (taxGroupId <= 0) return 0;

        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", "GST 10%");
        values.put("amount", 10);
        values.put("amount_type", "percent");
        values.put("type_tax_use", "sale");
        values.put("price_include", true);
        values.put("company_id", companyId);
        values.put("tax_group_id", taxGroupId);
        Number id = callKw(sessionId, "account.tax", "create", List.of(values), kwargsWithCompany(companyId));
        return id == null ? 0 : id.longValue();
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
