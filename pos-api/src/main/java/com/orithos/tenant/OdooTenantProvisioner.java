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
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Creates (or links) an Odoo company + POS config for a vendor and persists the binding.
 */
@Service
public class OdooTenantProvisioner {

    private static final Logger log = LoggerFactory.getLogger(OdooTenantProvisioner.class);
    private static final double DUMMY_STOCK_QUANTITY = 35.0;
    private static final double GST_FACTOR = 1.10;
    private static final int DUMMY_SALES_COUNT = 32;
    private static final int DUMMY_SALES_DAYS = 14;
    private static final DateTimeFormatter ODOO_DATETIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** name, default_code, barcode, list_price (GST-incl), category key, opening stock */
    private static final String[][] DUMMY_PRODUCTS = {
            {"DEMO Shiraz 750ml", "DEMO-SHIRAZ", "9300001000001", "28.50", "wine", "40"},
            {"DEMO Sauvignon Blanc 750ml", "DEMO-SB", "9300001000002", "24.90", "wine", "36"},
            {"DEMO Cabernet 750ml", "DEMO-CAB", "9300001000003", "32.00", "wine", "30"},
            {"DEMO Prosecco 750ml", "DEMO-PROS", "9300001000004", "19.90", "wine", "34"},
            {"DEMO IPA 4-pack", "DEMO-IPA", "9300001000005", "22.00", "beer", "40"},
            {"DEMO Lager 6-pack", "DEMO-LAGER", "9300001000006", "18.50", "beer", "38"},
            {"DEMO Pale Ale 4-pack", "DEMO-PALE", "9300001000007", "21.00", "beer", "32"},
            {"DEMO Gin 700ml", "DEMO-GIN", "9300001000008", "48.00", "spirits", "28"},
            {"DEMO Vodka 700ml", "DEMO-VODKA", "9300001000009", "42.00", "spirits", "26"},
            {"DEMO Whisky 700ml", "DEMO-WHISKY", "9300001000010", "55.00", "spirits", "24"},
            {"DEMO Cola 1.25L", "DEMO-COLA", "9300001000011", "3.50", "soft", "45"},
            {"DEMO Sparkling Water 1L", "DEMO-WATER", "9300001000012", "2.80", "soft", "42"},
            {"DEMO Potato Chips 175g", "DEMO-CHIPS", "9300001000013", "4.20", "grocery", "40"},
            {"DEMO Nuts Mix 200g", "DEMO-NUTS", "9300001000014", "6.50", "grocery", "30"},
    };

    private static final String[][] DUMMY_CUSTOMERS = {
            {"DEMO Customer Alex", "alex.demo@example.com", "0400000001"},
            {"DEMO Customer Bailey", "bailey.demo@example.com", "0400000002"},
            {"DEMO Customer Casey", "casey.demo@example.com", "0400000003"},
            {"DEMO Customer Devon", "devon.demo@example.com", "0400000004"},
    };

    private static final String[] CATEGORY_KEYS = {"wine", "beer", "spirits", "soft", "grocery"};
    private static final String[] CATEGORY_LABELS = {"DEMO Wine", "DEMO Beer", "DEMO Spirits", "DEMO Soft drinks", "DEMO Grocery"};

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
            // Odoo validates allowed_company_ids on every company-scoped RPC.
            // Add the newly-created company before any forced-company setup call;
            // otherwise a fresh service user can fail with "unauthorized company".
            addCompanyToServiceUser(sessionId, companyId);
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

            // Odoo requires every cash journal used by a POS payment method to
            // have explicit profit/loss accounts before a session can open.
            ensureCashDifferenceAccounts(sessionId, companyId);

            if (seedDummyData) {
                try {
                    seedDummyExperience(sessionId, companyId, warehouse[1], primaryPosConfigId);
                } catch (Exception seedError) {
                    log.warn("Dummy data seed failed for vendor {}: {}", vendorId, seedError.getMessage());
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

    /** Exposed for unit tests — keeps the richer dummy catalog sized as planned. */
    static int dummyCatalogSize() {
        return DUMMY_PRODUCTS.length;
    }

    static int dummyCategoryCount() {
        return CATEGORY_KEYS.length;
    }

    static int dummySalesCount() {
        return DUMMY_SALES_COUNT;
    }

    static String demoOrderUuidPrefix(long companyId) {
        return "demo-seed-" + companyId + "-";
    }

    static String sampleDataState(boolean requested, boolean cleared, boolean odooReady,
                                  int demoProducts, int demoOrders) {
        if (cleared) return "cleared";
        if (requested && !odooReady) return "unavailable";
        if (demoProducts > 0 || demoOrders > 0 || requested) return "active";
        return "never_seeded";
    }

    public record SampleDataStatus(
            boolean dummyDataRequested,
            String sampleDataClearedAt,
            String state,
            int demoProductCount,
            int demoCustomerCount,
            int demoOrderCount,
            int nonDemoPaidOrderCount,
            boolean canPurge,
            boolean archiveOnly
    ) {}

    public record SampleDataPurgeResult(
            String state,
            boolean archiveOnly,
            int productsArchived,
            int customersArchived,
            int sessionsClosed,
            int demoOrderCount,
            String sampleDataClearedAt
    ) {}

    public SampleDataStatus sampleDataStatus(Long vendorId) {
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) throw new IllegalArgumentException("vendor not found");
        boolean requested = Boolean.TRUE.equals(vendor.getDummyDataRequested());
        String clearedAt = vendor.getSampleDataClearedAt() == null
                ? null
                : vendor.getSampleDataClearedAt().toString();
        int demoProducts = 0;
        int demoCustomers = 0;
        int demoOrders = 0;
        int nonDemoPaid = 0;
        Long companyId = vendor.getOdooCompanyId();
        boolean odooReady = "ready".equalsIgnoreCase(vendor.getOdooProvisionStatus())
                && companyId != null && companyId > 0;
        boolean odooProbeSucceeded = false;
        if (isConfigured() && companyId != null && companyId > 0) {
            try {
                String sessionId = authenticate();
                long company = companyId;
                demoProducts = countDemoProducts(sessionId, company);
                demoCustomers = countDemoCustomers(sessionId, company);
                demoOrders = countExistingDemoOrders(sessionId, company);
                nonDemoPaid = countNonDemoPaidOrders(sessionId, company);
                odooProbeSucceeded = true;
            } catch (Exception e) {
                log.warn("Sample data status probe failed for vendor {}: {}", vendorId, e.getMessage());
            }
        }
        // Do not present a purge action while provisioning is pending or failed.
        // There is no safely addressable Odoo company in that state.
        String state = sampleDataState(requested, clearedAt != null,
                odooReady && odooProbeSucceeded, demoProducts, demoOrders);
        boolean canPurge = "active".equals(state) && (demoProducts > 0 || demoCustomers > 0 || demoOrders > 0 || requested);
        boolean archiveOnly = nonDemoPaid > 0;
        return new SampleDataStatus(
                requested,
                clearedAt,
                state,
                demoProducts,
                demoCustomers,
                demoOrders,
                nonDemoPaid,
                canPurge,
                archiveOnly);
    }

    public SampleDataPurgeResult purgeSampleData(Long vendorId) {
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) throw new IllegalArgumentException("vendor not found");
        if (!isConfigured()) {
            throw new IllegalStateException("Odoo service account is not configured (ODOO_SERVICE_*).");
        }
        Long companyId = vendor.getOdooCompanyId();
        if (companyId == null || companyId <= 0) {
            throw new IllegalStateException("This store has no Odoo company binding yet.");
        }
        if (vendor.getSampleDataClearedAt() != null
                && countDemoProductsSafe(companyId) == 0
                && countDemoCustomersSafe(companyId) == 0) {
            return new SampleDataPurgeResult(
                    "cleared",
                    false,
                    0,
                    0,
                    0,
                    0,
                    vendor.getSampleDataClearedAt().toString());
        }
        try {
            String sessionId = authenticate();
            long company = companyId;
            int nonDemoPaid = countNonDemoPaidOrders(sessionId, company);
            int productsArchived = archiveDemoProducts(sessionId, company);
            int customersArchived = archiveDemoCustomers(sessionId, company);
            int sessionsClosed = closeOpenPosSessions(sessionId, company);
            int demoOrders = countExistingDemoOrders(sessionId, company);
            LocalDateTime clearedAt = LocalDateTime.now(ZoneOffset.UTC);
            vendor.setSampleDataClearedAt(clearedAt);
            if (vendor.getDummyDataRequested() == null) {
                vendor.setDummyDataRequested(productsArchived > 0 || demoOrders > 0);
            }
            vendorMapper.updateSampleDataFlags(vendor);
            log.info(
                    "Purged sample data for vendor {} company {} (products={}, customers={}, sessions={}, demoOrders={}, archiveOnly={})",
                    vendorId, company, productsArchived, customersArchived, sessionsClosed, demoOrders, nonDemoPaid > 0);
            return new SampleDataPurgeResult(
                    "cleared",
                    nonDemoPaid > 0,
                    productsArchived,
                    customersArchived,
                    sessionsClosed,
                    demoOrders,
                    clearedAt.toString());
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(
                    e.getMessage() == null ? "Could not remove sample data from Odoo." : e.getMessage(), e);
        }
    }

    private int countDemoProductsSafe(long companyId) {
        try {
            return countDemoProducts(authenticate(), companyId);
        } catch (Exception e) {
            return -1;
        }
    }

    private int countDemoCustomersSafe(long companyId) {
        try {
            return countDemoCustomers(authenticate(), companyId);
        } catch (Exception e) {
            return -1;
        }
    }

    private int countDemoProducts(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("default_code").add("=like").add("DEMO-%"));
        domain.add(objectMapper.createArrayNode().add("active").add("=").add(true));
        Number count = callKw(sessionId, "product.template", "search_count", List.of(domain), kwargsWithCompany(companyId));
        return count == null ? 0 : count.intValue();
    }

    private int countDemoCustomers(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("name").add("=like").add("DEMO Customer%"));
        domain.add(objectMapper.createArrayNode().add("active").add("=").add(true));
        Number count = callKw(sessionId, "res.partner", "search_count", List.of(domain), kwargsWithCompany(companyId));
        return count == null ? 0 : count.intValue();
    }

    private int countNonDemoPaidOrders(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("state").add("in")
                .add(objectMapper.createArrayNode().add("paid").add("done").add("invoiced")));
        domain.add(objectMapper.createArrayNode().add("amount_total").add(">").add(0));
        // Odoo 20 rejects the unary `!` wrapper around a leaf in this RPC shape.
        // Use its native negative string operator so real sales remain protected.
        domain.add(objectMapper.createArrayNode()
                .add("uuid").add("not like").add(demoOrderUuidPrefix(companyId) + "%"));
        Number count = callKw(sessionId, "pos.order", "search_count", List.of(domain), kwargsWithCompany(companyId));
        return count == null ? 0 : count.intValue();
    }

    private int archiveDemoProducts(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("default_code").add("=like").add("DEMO-%"));
        ObjectNode searchKwargs = kwargsWithCompany(companyId);
        searchKwargs.set("fields", objectMapper.createArrayNode().add("id").add("active"));
        searchKwargs.put("limit", 200);
        searchKwargs.set("context", objectMapper.createObjectNode()
                .put("active_test", false)
                .set("allowed_company_ids", objectMapper.createArrayNode().add(companyId)));
        JsonNode rows = callKwNode(sessionId, "product.template", "search_read", List.of(domain), searchKwargs);
        if (rows == null || !rows.isArray() || rows.isEmpty()) return 0;
        List<Long> ids = new ArrayList<>();
        for (JsonNode row : rows) {
            long id = row.path("id").asLong(0);
            if (id > 0) ids.add(id);
        }
        if (ids.isEmpty()) return 0;
        ObjectNode values = objectMapper.createObjectNode();
        values.put("active", false);
        values.put("available_in_pos", false);
        values.put("sale_ok", false);
        callKwNode(sessionId, "product.template", "write", List.of(ids, values), kwargsWithCompany(companyId));
        return ids.size();
    }

    private int archiveDemoCustomers(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("name").add("=like").add("DEMO Customer%"));
        ObjectNode searchKwargs = kwargsWithCompany(companyId);
        searchKwargs.set("fields", objectMapper.createArrayNode().add("id"));
        searchKwargs.put("limit", 50);
        searchKwargs.set("context", objectMapper.createObjectNode()
                .put("active_test", false)
                .set("allowed_company_ids", objectMapper.createArrayNode().add(companyId)));
        JsonNode rows = callKwNode(sessionId, "res.partner", "search_read", List.of(domain), searchKwargs);
        if (rows == null || !rows.isArray() || rows.isEmpty()) return 0;
        List<Long> ids = new ArrayList<>();
        for (JsonNode row : rows) {
            long id = row.path("id").asLong(0);
            if (id > 0) ids.add(id);
        }
        if (ids.isEmpty()) return 0;
        ObjectNode values = objectMapper.createObjectNode();
        values.put("active", false);
        callKwNode(sessionId, "res.partner", "write", List.of(ids, values), kwargsWithCompany(companyId));
        return ids.size();
    }

    private int closeOpenPosSessions(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("state").add("=").add("opened"));
        ObjectNode searchKwargs = kwargsWithCompany(companyId);
        searchKwargs.set("fields", objectMapper.createArrayNode().add("id"));
        searchKwargs.put("limit", 20);
        JsonNode rows = callKwNode(sessionId, "pos.session", "search_read", List.of(domain), searchKwargs);
        if (rows == null || !rows.isArray() || rows.isEmpty()) return 0;
        int closed = 0;
        for (JsonNode row : rows) {
            long posSessionId = row.path("id").asLong(0);
            if (posSessionId <= 0) continue;
            // Never close a register that already contains a real paid order.
            // A trial may have been used for live checkout before sample cleanup.
            if (countNonDemoOrdersForSession(sessionId, companyId, posSessionId) > 0) {
                log.info("Keeping POS session {} open for company {} because it contains real sales",
                        posSessionId, companyId);
                continue;
            }
            try {
                callKwNode(sessionId, "pos.session", "action_pos_session_closing_control",
                        List.of(List.of(posSessionId)), kwargsWithCompany(companyId));
            } catch (Exception ignored) {
                // Some builds skip closing control when cash is already balanced.
            }
            try {
                callKwNode(sessionId, "pos.session", "close_session_from_ui",
                        List.of(List.of(posSessionId)), kwargsWithCompany(companyId));
                closed++;
            } catch (Exception closeError) {
                try {
                    callKwNode(sessionId, "pos.session", "action_pos_session_close",
                            List.of(List.of(posSessionId)), kwargsWithCompany(companyId));
                    closed++;
                } catch (Exception e) {
                    log.warn("Could not close POS session {} for company {}: {}",
                            posSessionId, companyId, e.getMessage());
                }
            }
        }
        return closed;
    }

    private int countNonDemoOrdersForSession(String sessionId, long companyId, long posSessionId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("session_id").add("=").add(posSessionId));
        domain.add(objectMapper.createArrayNode().add("state").add("in")
                .add(objectMapper.createArrayNode().add("paid").add("done").add("invoiced")));
        domain.add(objectMapper.createArrayNode()
                .add("uuid").add("not like").add(demoOrderUuidPrefix(companyId) + "%"));
        Number count = callKw(sessionId, "pos.order", "search_count", List.of(domain), kwargsWithCompany(companyId));
        return count == null ? 0 : count.intValue();
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

        ensureChartOfAccounts(sessionId, companyId);

        // Minimal journals required before POS config / payment methods can be company-scoped.
        ensureJournal(sessionId, companyId, "Cash", shortCode("CSH", companyId), "cash");
        ensureJournal(sessionId, companyId, "Bank", shortCode("BNK", companyId), "bank");
        ensureJournal(sessionId, companyId, "Sales", shortCode("SAL", companyId), "sale");
        ensureJournal(sessionId, companyId, "Point of Sale", shortCode("POS", companyId), "general");
    }

    /**
     * A newly-created Odoo company has no fiscal localization by default. POS can
     * create configs without one, but Odoo refuses to open the register and returns
     * "No chart of account configured". Loading the Australian chart is idempotent:
     * retries skip companies that already have a chart template.
     */
    private void ensureChartOfAccounts(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("id").add("=").add(companyId));
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("chart_template"));
        findKwargs.put("limit", 1);
        JsonNode companies = callKwNode(sessionId, "res.company", "search_read", List.of(domain), findKwargs);
        if (companies != null && companies.isArray() && !companies.isEmpty()
                && !companies.get(0).path("chart_template").asText("").isBlank()) {
            return;
        }

        // l10n_au registers the "au" template. Odoo's call_kw reserves the
        // first argument for record ids, even for model-level methods, so the
        // template arguments must follow an empty recordset placeholder.
        callKwNode(sessionId, "account.chart.template", "try_loading",
                List.of(List.of(), "au", companyId, false, true), kwargsWithCompany(companyId));

        // A malformed RPC can return an empty result without applying a chart.
        // Never let provisioning report ready until the company confirms it.
        JsonNode reloaded = callKwNode(sessionId, "res.company", "search_read", List.of(domain), findKwargs);
        if (reloaded == null || !reloaded.isArray() || reloaded.isEmpty()
                || reloaded.get(0).path("chart_template").asText("").isBlank()) {
            throw new IllegalStateException("Australian chart of accounts was not applied to Odoo company " + companyId);
        }
    }

    private static String shortCode(String prefix, long companyId) {
        String suffix = Long.toString(companyId);
        String code = prefix + suffix;
        return code.length() <= 5 ? code : prefix.substring(0, Math.max(1, 5 - suffix.length())) + suffix;
    }

    private void ensureCashDifferenceAccounts(String sessionId, long companyId) throws Exception {
        ArrayNode accountDomain = objectMapper.createArrayNode();
        ArrayNode companyIds = objectMapper.createArrayNode().add(companyId);
        accountDomain.add(objectMapper.createArrayNode().add("company_ids").add("in").add(companyIds));
        ArrayNode accountTypes = objectMapper.createArrayNode().add("expense").add("income");
        accountDomain.add(objectMapper.createArrayNode().add("account_type").add("in").add(accountTypes));
        ObjectNode accountKwargs = kwargsWithCompany(companyId);
        accountKwargs.set("fields", objectMapper.createArrayNode().add("id").add("account_type"));
        accountKwargs.put("limit", 100);
        JsonNode accounts = callKwNode(sessionId, "account.account", "search_read", List.of(accountDomain), accountKwargs);
        long lossAccountId = 0;
        long profitAccountId = 0;
        if (accounts != null && accounts.isArray()) {
            for (JsonNode account : accounts) {
                long id = account.path("id").asLong(0);
                String type = account.path("account_type").asText("");
                if (lossAccountId <= 0 && "expense".equals(type)) lossAccountId = id;
                if (profitAccountId <= 0 && "income".equals(type)) profitAccountId = id;
            }
        }
        // A fresh company can have no chart accounts when localization loading
        // is unavailable. Create two company-scoped fallback accounts so POS
        // provisioning remains self-contained and cash sessions can still close.
        if (lossAccountId <= 0) {
            lossAccountId = ensureCashDifferenceAccount(sessionId, companyId, "expense", "POS Cash Difference Loss", "9" + companyId + "1");
        }
        if (profitAccountId <= 0) {
            profitAccountId = ensureCashDifferenceAccount(sessionId, companyId, "income", "POS Cash Difference Gain", "9" + companyId + "2");
        }
        if (lossAccountId <= 0 || profitAccountId <= 0) {
            throw new IllegalStateException("Australian chart did not provide cash difference accounts for company " + companyId);
        }

        ArrayNode journalDomain = objectMapper.createArrayNode();
        journalDomain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        ObjectNode journalKwargs = kwargsWithCompany(companyId);
        journalKwargs.set("fields", objectMapper.createArrayNode()
                .add("id").add("type").add("loss_account_id").add("profit_account_id"));
        journalKwargs.put("limit", 200);
        JsonNode journals = callKwNode(sessionId, "account.journal", "search_read", List.of(journalDomain), journalKwargs);
        if (journals == null || !journals.isArray()) return;
        for (JsonNode journal : journals) {
            if (!"cash".equals(journal.path("type").asText())) continue;
            ObjectNode values = objectMapper.createObjectNode();
            if (!journal.path("loss_account_id").isArray() || journal.path("loss_account_id").isEmpty()) {
                values.put("loss_account_id", lossAccountId);
            }
            if (!journal.path("profit_account_id").isArray() || journal.path("profit_account_id").isEmpty()) {
                values.put("profit_account_id", profitAccountId);
            }
            if (!values.isEmpty()) {
                // `fields` and `limit` are valid for search_read, but Odoo's
                // write() rejects them as unexpected keyword arguments.
                callKw(sessionId, "account.journal", "write",
                        List.of(List.of(journal.path("id").asLong()), values), kwargsWithCompany(companyId));
            }
        }
    }

    private long ensureCashDifferenceAccount(String sessionId, long companyId, String accountType,
                                              String name, String code) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_ids").add("in").add(companyId));
        domain.add(objectMapper.createArrayNode().add("code").add("=").add(code));
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id").add("account_type"));
        findKwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "account.account", "search_read", List.of(domain), findKwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            if (id > 0 && accountType.equals(existing.get(0).path("account_type").asText(""))) return id;
        }

        ObjectNode values = objectMapper.createObjectNode();
        values.put("code", code);
        values.put("name", name);
        values.put("account_type", accountType);
        ArrayNode companyCommand = values.putArray("company_ids").addArray();
        companyCommand.add(6).add(0).addArray().add(companyId);
        Number id = callKw(sessionId, "account.account", "create", List.of(values), kwargsWithCompany(companyId));
        return id == null ? 0 : id.longValue();
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
        findKwargs.set("fields", objectMapper.createArrayNode().add("id").add("journal_id"));
        findKwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "pos.payment.method", "search_read", List.of(domain), findKwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            long journalId = relationId(existing.get(0).get("journal_id"));
            if (id > 0) {
                ensureJournalDefaultAccount(sessionId, companyId, journalId,
                        "asset_current", "POS Bank Account", "8" + companyId + "3");
                ensurePaymentMethodAccounts(sessionId, companyId, id, journalId);
                return id;
            }
        }
        long bankJournal = ensureJournal(sessionId, companyId, "Bank", shortCode("BNK", companyId), "bank");
        ensureJournalDefaultAccount(sessionId, companyId, bankJournal,
                "asset_current", "POS Bank Account", "8" + companyId + "3");
        ObjectNode card = objectMapper.createObjectNode();
        card.put("name", "Card");
        card.put("company_id", companyId);
        card.put("journal_id", bankJournal);
        card.put("is_cash_count", false);
        card.put("payment_method_type", "bank");
        Number cardId = callKw(sessionId, "pos.payment.method", "create", List.of(card), kwargsWithCompany(companyId));
        if (cardId == null) throw new IllegalStateException("pos.payment.method.create Card failed");
        ensurePaymentMethodAccounts(sessionId, companyId, cardId.longValue(), bankJournal);
        return cardId.longValue();
    }

    private long ensureDedicatedCashPaymentMethod(String sessionId, long companyId, String configName) throws Exception {
        String pmName = "Cash (" + truncateLabel(configName, 40) + ")";
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("name").add("=").add(pmName));
        ObjectNode findKwargs = kwargsWithCompany(companyId);
        findKwargs.set("fields", objectMapper.createArrayNode().add("id").add("journal_id"));
        findKwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "pos.payment.method", "search_read", List.of(domain), findKwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            long journalId = relationId(existing.get(0).get("journal_id"));
            if (id > 0) {
                ensureJournalDefaultAccount(sessionId, companyId, journalId,
                        "asset_cash", "POS Cash Account", "8" + companyId + "4");
                ensurePaymentMethodAccounts(sessionId, companyId, id, journalId);
                return id;
            }
        }

        String journalName = "Cash (" + truncateLabel(configName, 40) + ")";
        String journalCode = uniqueCashJournalCode(sessionId, companyId, configName);
        long cashJournal = ensureJournal(sessionId, companyId, journalName, journalCode, "cash");
        ensureJournalDefaultAccount(sessionId, companyId, cashJournal,
                "asset_cash", "POS Cash Account", "8" + companyId + "4");

        ObjectNode cash = objectMapper.createObjectNode();
        cash.put("name", pmName);
        cash.put("company_id", companyId);
        cash.put("journal_id", cashJournal);
        cash.put("is_cash_count", true);
        cash.put("payment_method_type", "cash");
        Number cashId = callKw(sessionId, "pos.payment.method", "create", List.of(cash), kwargsWithCompany(companyId));
        if (cashId == null) throw new IllegalStateException("pos.payment.method.create Cash failed for " + configName);
        ensurePaymentMethodAccounts(sessionId, companyId, cashId.longValue(), cashJournal);
        return cashId.longValue();
    }

    private void ensurePaymentMethodAccounts(
            String sessionId, long companyId, long paymentMethodId, long journalId) throws Exception {
        if (paymentMethodId <= 0 || journalId <= 0) return;
        ArrayNode journalDomain = objectMapper.createArrayNode();
        journalDomain.add(objectMapper.createArrayNode().add("id").add("=").add(journalId));
        ObjectNode journalKwargs = kwargsWithCompany(companyId);
        journalKwargs.set("fields", objectMapper.createArrayNode().add("default_account_id"));
        journalKwargs.put("limit", 1);
        JsonNode journals = callKwNode(sessionId, "account.journal", "search_read", List.of(journalDomain), journalKwargs);
        if (journals == null || !journals.isArray() || journals.isEmpty()) return;
        long defaultAccountId = relationId(journals.get(0).get("default_account_id"));
        if (defaultAccountId <= 0) return;

        ArrayNode methodDomain = objectMapper.createArrayNode();
        methodDomain.add(objectMapper.createArrayNode().add("id").add("=").add(paymentMethodId));
        ObjectNode methodKwargs = kwargsWithCompany(companyId);
        methodKwargs.set("fields", objectMapper.createArrayNode()
                .add("receivable_account_id").add("outstanding_account_id"));
        methodKwargs.put("limit", 1);
        JsonNode methods = callKwNode(sessionId, "pos.payment.method", "search_read", List.of(methodDomain), methodKwargs);
        if (methods == null || !methods.isArray() || methods.isEmpty()) return;
        ObjectNode values = objectMapper.createObjectNode();
        if (!hasRelation(methods.get(0).get("receivable_account_id"))) {
            values.put("receivable_account_id", defaultAccountId);
        }
        if (hasRelation(methods.get(0).get("outstanding_account_id"))) {
            // POS session closing creates one intermediary line for this payment
            // method. Keeping a second outstanding account on the same method
            // makes Odoo reject the statement as having two bank/cash lines.
            values.putNull("outstanding_account_id");
        }
        if (!values.isEmpty()) {
            callKw(sessionId, "pos.payment.method", "write",
                    List.of(List.of(paymentMethodId), values), kwargsWithCompany(companyId));
        }
    }

    private void ensureJournalDefaultAccount(
            String sessionId, long companyId, long journalId, String accountType, String name, String code) throws Exception {
        if (journalId <= 0) return;
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("id").add("=").add(journalId));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode().add("default_account_id"));
        kwargs.put("limit", 1);
        JsonNode journals = callKwNode(sessionId, "account.journal", "search_read", List.of(domain), kwargs);
        if (journals != null && journals.isArray() && !journals.isEmpty()
                && relationId(journals.get(0).get("default_account_id")) > 0) return;

        long accountId = ensureAccountByType(sessionId, companyId, accountType, name, code);
        if (accountId <= 0) throw new IllegalStateException("No default account available for journal " + journalId);
        ObjectNode values = objectMapper.createObjectNode();
        values.put("default_account_id", accountId);
        callKw(sessionId, "account.journal", "write",
                List.of(List.of(journalId), values), kwargsWithCompany(companyId));
    }

    private long ensureAccountByType(
            String sessionId, long companyId, String accountType, String name, String code) throws Exception {
        ArrayNode accountDomain = objectMapper.createArrayNode();
        accountDomain.add(objectMapper.createArrayNode().add("company_ids").add("in").add(companyId));
        accountDomain.add(objectMapper.createArrayNode().add("account_type").add("=").add(accountType));
        ObjectNode accountKwargs = kwargsWithCompany(companyId);
        accountKwargs.set("fields", objectMapper.createArrayNode().add("id"));
        accountKwargs.put("limit", 1);
        JsonNode accounts = callKwNode(sessionId, "account.account", "search_read", List.of(accountDomain), accountKwargs);
        if (accounts != null && accounts.isArray() && !accounts.isEmpty()) {
            long id = accounts.get(0).path("id").asLong(0);
            if (id > 0) return id;
        }
        return ensureCashDifferenceAccount(sessionId, companyId, accountType, name, code);
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
        ensureJournalDefaultAccount(sessionId, companyId, posJournal,
                "asset_current", "POS Clearing Account", "8" + companyId + "6");
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

    private void seedDummyExperience(String sessionId, long companyId, long stockLocationId, long posConfigId) throws Exception {
        List<DummyProduct> products = seedDummyCatalog(sessionId, companyId, stockLocationId);
        List<Long> customerIds = seedDummyCustomers(sessionId, companyId);
        try {
            seedDummySales(sessionId, companyId, posConfigId, products, customerIds);
        } catch (Exception salesError) {
            // Catalog/customers remain useful for Sell-pad smoke tests even if sales seed fails.
            log.warn("Dummy sales seed failed for company {}: {}", companyId, salesError.getMessage());
        }
    }

    private List<DummyProduct> seedDummyCatalog(String sessionId, long companyId, long stockLocationId) throws Exception {
        if (stockLocationId <= 0) {
            throw new IllegalStateException("No internal stock location is available for demo inventory.");
        }
        long taxId = ensureSaleGstTax(sessionId, companyId);
        long incomeAccountId = findIncomeAccount(sessionId, companyId);
        if (incomeAccountId <= 0) {
            throw new IllegalStateException("No income account is available for dummy POS catalog in company " + companyId);
        }
        Map<String, long[]> categories = ensureDummyCategories(sessionId, companyId, incomeAccountId);
        List<DummyProduct> seeded = new ArrayList<>(DUMMY_PRODUCTS.length);
        for (String[] sample : DUMMY_PRODUCTS) {
            String name = sample[0];
            String code = sample[1];
            String barcode = sample[2];
            double listPrice = Double.parseDouble(sample[3]);
            String categoryKey = sample[4];
            double openingStock = Double.parseDouble(sample[5]);
            try {
                long[] categoryIds = categories.get(categoryKey);
                long productCategId = categoryIds != null ? categoryIds[0] : 0;
                long posCategId = categoryIds != null ? categoryIds[1] : 0;
                long productId = findDummyProductVariant(sessionId, companyId, code);
                if (productId <= 0) {
                    ObjectNode values = objectMapper.createObjectNode();
                    values.put("name", name);
                    values.put("default_code", code);
                    values.put("barcode", barcode);
                    values.put("list_price", listPrice);
                    values.put("available_in_pos", true);
                    values.put("sale_ok", true);
                    values.put("purchase_ok", true);
                    values.put("type", "consu");
                    values.put("is_storable", true);
                    values.put("company_id", companyId);
                    if (productCategId > 0) values.put("categ_id", productCategId);
                    if (posCategId > 0) {
                        ArrayNode posCats = values.putArray("pos_categ_ids");
                        ArrayNode cmd = posCats.addArray();
                        cmd.add(6);
                        cmd.add(0);
                        cmd.addArray().add(posCategId);
                    }
                    if (taxId > 0) {
                        ArrayNode taxes = values.putArray("taxes_id");
                        ArrayNode cmd = taxes.addArray();
                        cmd.add(6);
                        cmd.add(0);
                        cmd.addArray().add(taxId);
                    }
                    Number templateId = callKw(sessionId, "product.template", "create", List.of(values), kwargsWithCompany(companyId));
                    if (templateId == null) throw new IllegalStateException("product.template.create returned no id");
                    productId = findDummyProductVariant(sessionId, companyId, code);
                }
                if (productId <= 0) throw new IllegalStateException("No product variant was created for " + code);
                ensureDummyProductIncomeAccount(sessionId, companyId, productId, incomeAccountId);
                ensureDummyStock(sessionId, companyId, productId, stockLocationId, openingStock);
                seeded.add(new DummyProduct(productId, code, name, listPrice, taxId));
            } catch (Exception productError) {
                log.warn("Dummy product {} or stock failed for company {}: {}", code, companyId, productError.getMessage());
            }
        }
        log.info("Seeded dummy POS catalog for Odoo company {} ({} products)", companyId, seeded.size());
        if (seeded.size() < 8) {
            throw new IllegalStateException("Dummy catalog could not prepare enough products for company " + companyId);
        }
        return seeded;
    }

    /**
     * @return map of category key → [product.category id, pos.category id]
     */
    private long findIncomeAccount(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_ids").add("in").add(companyId));
        domain.add(objectMapper.createArrayNode().add("account_type").add("=").add("income"));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode().add("id").add("account_type"));
        kwargs.put("limit", 1);
        JsonNode accounts = callKwNode(sessionId, "account.account", "search_read", List.of(domain), kwargs);
        if (accounts != null && accounts.isArray() && !accounts.isEmpty()) {
            long id = accounts.get(0).path("id").asLong(0);
            if (id > 0) return id;
        }
        return 0;
    }

    private Map<String, long[]> ensureDummyCategories(String sessionId, long companyId, long incomeAccountId) throws Exception {
        long valuationAccountId = ensureAccountByType(sessionId, companyId,
                "asset_current", "POS Stock Valuation", "8" + companyId + "5");
        long expenseAccountId = ensureAccountByType(sessionId, companyId,
                "expense", "POS Cost of Sales", "5" + companyId + "1");
        Map<String, long[]> byKey = new LinkedHashMap<>();
        for (int i = 0; i < CATEGORY_KEYS.length; i++) {
            String key = CATEGORY_KEYS[i];
            String label = CATEGORY_LABELS[i];
            long productCategId = ensureProductCategory(
                    sessionId, companyId, label, incomeAccountId, valuationAccountId, expenseAccountId);
            long posCategId = ensurePosCategory(sessionId, companyId, label);
            byKey.put(key, new long[]{productCategId, posCategId});
        }
        return byKey;
    }

    private long ensureProductCategory(
            String sessionId,
            long companyId,
            String name,
            long incomeAccountId,
            long valuationAccountId,
            long expenseAccountId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("name").add("=").add(name));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode()
                .add("id")
                .add("property_account_income_categ_id")
                .add("property_stock_valuation_account_id")
                .add("property_account_expense_categ_id")
                .add("account_stock_variation_id"));
        kwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "product.category", "search_read", List.of(domain), kwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            if (id > 0) {
                JsonNode incomeAccount = existing.get(0).get("property_account_income_categ_id");
                boolean hasIncomeAccount = incomeAccount != null && incomeAccount.isArray()
                        && incomeAccount.size() > 0 && incomeAccount.get(0).asLong(0) > 0;
                ObjectNode values = objectMapper.createObjectNode();
                if (!hasIncomeAccount && incomeAccountId > 0) {
                    values.put("property_account_income_categ_id", incomeAccountId);
                }
                if (!hasRelation(existing.get(0).get("property_stock_valuation_account_id"))
                        && valuationAccountId > 0) {
                    values.put("property_stock_valuation_account_id", valuationAccountId);
                }
                if (!hasRelation(existing.get(0).get("property_account_expense_categ_id"))
                        && expenseAccountId > 0) {
                    values.put("property_account_expense_categ_id", expenseAccountId);
                }
                if (!hasRelation(existing.get(0).get("account_stock_variation_id"))
                        && expenseAccountId > 0) {
                    values.put("account_stock_variation_id", expenseAccountId);
                }
                if (!values.isEmpty()) {
                    callKw(sessionId, "product.category", "write",
                            List.of(List.of(id), values), kwargsWithCompany(companyId));
                }
                return id;
            }
        }
        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", name);
        if (incomeAccountId > 0) values.put("property_account_income_categ_id", incomeAccountId);
        if (valuationAccountId > 0) values.put("property_stock_valuation_account_id", valuationAccountId);
        if (expenseAccountId > 0) {
            values.put("property_account_expense_categ_id", expenseAccountId);
            values.put("account_stock_variation_id", expenseAccountId);
        }
        Number id = callKw(sessionId, "product.category", "create", List.of(values), kwargsWithCompany(companyId));
        return id == null ? 0 : id.longValue();
    }

    private static boolean hasRelation(JsonNode relation) {
        return relationId(relation) > 0;
    }

    private long ensurePosCategory(String sessionId, long companyId, String name) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("name").add("=").add(name));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode().add("id"));
        kwargs.put("limit", 1);
        JsonNode existing = callKwNode(sessionId, "pos.category", "search_read", List.of(domain), kwargs);
        if (existing != null && existing.isArray() && !existing.isEmpty()) {
            long id = existing.get(0).path("id").asLong(0);
            if (id > 0) return id;
        }
        ObjectNode values = objectMapper.createObjectNode();
        values.put("name", name);
        Number id = callKw(sessionId, "pos.category", "create", List.of(values), kwargsWithCompany(companyId));
        return id == null ? 0 : id.longValue();
    }

    private List<Long> seedDummyCustomers(String sessionId, long companyId) throws Exception {
        List<Long> ids = new ArrayList<>(DUMMY_CUSTOMERS.length);
        for (String[] row : DUMMY_CUSTOMERS) {
            String name = row[0];
            String email = row[1];
            String phone = row[2];
            try {
                ArrayNode domain = objectMapper.createArrayNode();
                domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
                domain.add(objectMapper.createArrayNode().add("name").add("=").add(name));
                ObjectNode findKwargs = kwargsWithCompany(companyId);
                findKwargs.set("fields", objectMapper.createArrayNode().add("id"));
                findKwargs.put("limit", 1);
                JsonNode existing = callKwNode(sessionId, "res.partner", "search_read", List.of(domain), findKwargs);
                if (existing != null && existing.isArray() && !existing.isEmpty()) {
                    long id = existing.get(0).path("id").asLong(0);
                    if (id > 0) {
                        ids.add(id);
                        continue;
                    }
                }
                ObjectNode values = objectMapper.createObjectNode();
                values.put("name", name);
                values.put("email", email);
                values.put("phone", phone);
                values.put("customer_rank", 1);
                values.put("company_id", companyId);
                values.put("company_type", "person");
                Number id = callKw(sessionId, "res.partner", "create", List.of(values), kwargsWithCompany(companyId));
                if (id != null && id.longValue() > 0) ids.add(id.longValue());
            } catch (Exception customerError) {
                log.warn("Dummy customer {} failed for company {}: {}", name, companyId, customerError.getMessage());
            }
        }
        log.info("Seeded {} DEMO customers for Odoo company {}", ids.size(), companyId);
        return ids;
    }

    private void seedDummySales(
            String sessionId,
            long companyId,
            long posConfigId,
            List<DummyProduct> products,
            List<Long> customerIds) throws Exception {
        if (posConfigId <= 0 || products.isEmpty()) {
            throw new IllegalStateException("POS config and products are required to seed demo sales.");
        }
        if (countExistingDemoOrders(sessionId, companyId) >= DUMMY_SALES_COUNT) {
            log.info("Demo sales already complete for company {}; skipping sales seed", companyId);
            ensureOpenPosSession(sessionId, companyId, posConfigId);
            return;
        }

        long uid = currentUid(sessionId);
        if (uid <= 0) throw new IllegalStateException("Odoo service user uid unavailable for demo sales.");

        long posSessionId = ensureOpenPosSession(sessionId, companyId, posConfigId);
        long[] paymentMethods = resolvePosPaymentMethods(sessionId, companyId, posConfigId);
        long cashPm = paymentMethods[0];
        long cardPm = paymentMethods[1];
        if (cashPm <= 0 && cardPm <= 0) {
            throw new IllegalStateException("No payment methods available on the demo POS config.");
        }

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        int created = 0;
        List<Long> refundSourceOrderIds = new ArrayList<>();

        for (int i = 0; i < DUMMY_SALES_COUNT; i++) {
            DummyProduct primary = products.get(i % products.size());
            DummyProduct secondary = products.get((i * 3 + 1) % products.size());
            int qty1 = 1 + (i % 3);
            int qty2 = (i % 4 == 0) ? 1 : 0;
            long partnerId = 0;
            if (!customerIds.isEmpty() && i % 3 == 0) {
                partnerId = customerIds.get(i % customerIds.size());
            }
            long paymentMethodId = (i % 2 == 0)
                    ? (cardPm > 0 ? cardPm : cashPm)
                    : (cashPm > 0 ? cashPm : cardPm);
            // Spread across the last 14 days with daytime hours for a believable trend.
            int dayOffset = i % DUMMY_SALES_DAYS;
            int hour = 9 + (i % 10);
            int minute = (i * 7) % 60;
            LocalDateTime when = now.minusDays(dayOffset).withHour(hour).withMinute(minute).withSecond(0).withNano(0);
            String dateOrder = ODOO_DATETIME.format(when);
            String uuid = "demo-seed-" + companyId + "-" + String.format(Locale.ROOT, "%03d", i);

            List<int[]> basket = new ArrayList<>();
            basket.add(new int[]{indexOfProduct(products, primary.id), qty1});
            if (qty2 > 0 && secondary.id != primary.id) {
                basket.add(new int[]{indexOfProduct(products, secondary.id), qty2});
            }

            try {
                // Check the deterministic UUID first so a retry can fill only missing orders.
                JsonNode saved = findOrderByUuid(sessionId, companyId, uuid);
                if (saved == null) {
                    ObjectNode order = buildPaidDemoOrder(
                            products, basket, dateOrder, uuid, uid, posSessionId, paymentMethodId, partnerId);
                    JsonNode synced = callKwNode(sessionId, "pos.order", "sync_from_ui",
                            List.of(List.of(order)), kwargsWithCompany(companyId));
                    saved = findSyncedOrder(synced, uuid);
                    if (saved == null) {
                        saved = findOrderByUuid(sessionId, companyId, uuid);
                    }
                }
                if (saved != null) {
                    created++;
                    if (saved.path("amount_total").asDouble(0) > 0 && refundSourceOrderIds.size() < 2) {
                        refundSourceOrderIds.add(saved.path("id").asLong(0));
                    }
                }
            } catch (Exception orderError) {
                log.warn("Dummy order {} failed for company {}: {}", i + 1, companyId, orderError.getMessage());
            }
        }

        int refunds = 0;
        long paymentMethodId = cardPm > 0 ? cardPm : cashPm;
        for (int r = 0; r < refundSourceOrderIds.size(); r++) {
            long sourceOrderId = refundSourceOrderIds.get(r);
            try {
                List<JsonNode> sourceLines = readOrderLines(sessionId, companyId, sourceOrderId);
                if (sourceLines.isEmpty()) continue;
                String refundUuid = "demo-seed-" + companyId + "-refund-" + String.format(Locale.ROOT, "%03d", r + 1);
                String refundDate = ODOO_DATETIME.format(now.minusDays(1).withHour(14 + r).withMinute(20).withSecond(0));
                ObjectNode refund = buildRefundDemoOrder(
                        sourceLines, refundDate, refundUuid, uid, posSessionId, paymentMethodId);
                JsonNode synced = callKwNode(sessionId, "pos.order", "sync_from_ui",
                        List.of(List.of(refund)), kwargsWithCompany(companyId));
                if (findSyncedOrder(synced, refundUuid) != null || findOrderByUuid(sessionId, companyId, refundUuid) != null) {
                    refunds++;
                }
            } catch (Exception refundError) {
                log.warn("Dummy refund {} failed for company {}: {}", r + 1, companyId, refundError.getMessage());
            }
        }

        // Leave the session open so Overview "Open registers" is non-zero and Sell is ready.
        log.info("Seeded dummy sales for Odoo company {} ({} paid orders, {} refunds, session left open)",
                companyId, created, refunds);
        if (created < 10) {
            throw new IllegalStateException("Dummy sales seed created too few orders for company " + companyId);
        }
    }

    private int countExistingDemoOrders(String sessionId, long companyId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("uuid").add("=like").add(demoOrderUuidPrefix(companyId) + "%"));
        domain.add(objectMapper.createArrayNode().add("is_refund").add("=").add(false));
        Number count = callKw(sessionId, "pos.order", "search_count", List.of(domain), kwargsWithCompany(companyId));
        return count == null ? 0 : count.intValue();
    }

    private long ensureOpenPosSession(String sessionId, long companyId, long posConfigId) throws Exception {
        ArrayNode configDomain = objectMapper.createArrayNode();
        configDomain.add(objectMapper.createArrayNode().add("id").add("=").add(posConfigId));
        ObjectNode configKwargs = kwargsWithCompany(companyId);
        configKwargs.set("fields", objectMapper.createArrayNode().add("id").add("current_session_id"));
        configKwargs.put("limit", 1);
        JsonNode configs = callKwNode(sessionId, "pos.config", "search_read", List.of(configDomain), configKwargs);
        if (configs != null && configs.isArray() && !configs.isEmpty()) {
            JsonNode current = configs.get(0).get("current_session_id");
            if (current != null && current.isArray() && current.size() > 0) {
                long existingId = current.get(0).asLong(0);
                if (existingId > 0 && isPosSessionOpened(sessionId, companyId, existingId)) {
                    return existingId;
                }
            }
        }

        long uid = currentUid(sessionId);
        ObjectNode values = objectMapper.createObjectNode();
        values.put("config_id", posConfigId);
        values.put("user_id", uid);
        Number created = callKw(sessionId, "pos.session", "create", List.of(values), kwargsWithCompany(companyId));
        if (created == null) throw new IllegalStateException("pos.session.create returned no id");
        long posSessionId = created.longValue();
        try {
            callKwNode(sessionId, "pos.session", "set_opening_control",
                    List.of(List.of(posSessionId), 0.0, "DEMO seed open"), kwargsWithCompany(companyId));
        } catch (Exception ignored) {
            // Some Odoo builds open directly without cash control.
        }
        try {
            callKwNode(sessionId, "pos.session", "action_pos_session_open",
                    List.of(List.of(posSessionId)), kwargsWithCompany(companyId));
        } catch (Exception ignored) {
            // Session may already be opened after create / set_opening_control.
        }
        if (!isPosSessionOpened(sessionId, companyId, posSessionId)) {
            throw new IllegalStateException("Could not open POS session " + posSessionId + " for demo sales");
        }
        return posSessionId;
    }

    private boolean isPosSessionOpened(String sessionId, long companyId, long posSessionId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("id").add("=").add(posSessionId));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode().add("id").add("state"));
        kwargs.put("limit", 1);
        JsonNode rows = callKwNode(sessionId, "pos.session", "search_read", List.of(domain), kwargs);
        return rows != null && rows.isArray() && !rows.isEmpty()
                && "opened".equals(rows.get(0).path("state").asText(""));
    }

    private long[] resolvePosPaymentMethods(String sessionId, long companyId, long posConfigId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("id").add("=").add(posConfigId));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode().add("payment_method_ids"));
        kwargs.put("limit", 1);
        JsonNode configs = callKwNode(sessionId, "pos.config", "search_read", List.of(domain), kwargs);
        List<Long> methodIds = new ArrayList<>();
        if (configs != null && configs.isArray() && !configs.isEmpty()) {
            JsonNode ids = configs.get(0).get("payment_method_ids");
            if (ids != null && ids.isArray()) {
                for (JsonNode id : ids) methodIds.add(id.asLong());
            }
        }
        long cashId = 0;
        long cardId = 0;
        if (!methodIds.isEmpty()) {
            ArrayNode pmDomain = objectMapper.createArrayNode();
            ArrayNode inClause = objectMapper.createArrayNode();
            inClause.add("id");
            inClause.add("in");
            ArrayNode idList = inClause.addArray();
            for (Long id : methodIds) idList.add(id);
            pmDomain.add(inClause);
            ObjectNode pmKwargs = kwargsWithCompany(companyId);
            pmKwargs.set("fields", objectMapper.createArrayNode()
                    .add("id").add("name").add("is_cash_count").add("payment_method_type").add("type"));
            pmKwargs.put("limit", 20);
            JsonNode methods = callKwNode(sessionId, "pos.payment.method", "search_read", List.of(pmDomain), pmKwargs);
            if (methods != null && methods.isArray()) {
                for (JsonNode method : methods) {
                    long id = method.path("id").asLong(0);
                    String name = method.path("name").asText("").toUpperCase(Locale.ROOT);
                    boolean cash = method.path("is_cash_count").asBoolean(false)
                            || "cash".equalsIgnoreCase(method.path("payment_method_type").asText(""))
                            || "cash".equalsIgnoreCase(method.path("type").asText(""))
                            || name.contains("CASH");
                    if (cash && cashId <= 0) cashId = id;
                    else if (!cash && cardId <= 0) cardId = id;
                }
            }
        }
        if (cashId <= 0 && !methodIds.isEmpty()) cashId = methodIds.get(0);
        if (cardId <= 0 && methodIds.size() > 1) cardId = methodIds.get(1);
        if (cardId <= 0) cardId = cashId;
        return new long[]{cashId, cardId};
    }

    private ObjectNode buildPaidDemoOrder(
            List<DummyProduct> products,
            List<int[]> basket,
            String dateOrder,
            String uuid,
            long uid,
            long posSessionId,
            long paymentMethodId,
            long partnerId) {
        ArrayNode lines = objectMapper.createArrayNode();
        double amountTotal = 0;
        double amountTax = 0;
        for (int[] item : basket) {
            DummyProduct product = products.get(item[0]);
            int qty = item[1];
            double incl = roundMoney(product.listPrice * qty);
            double excl;
            if (product.taxId > 0) {
                excl = roundMoney(incl / GST_FACTOR);
            } else {
                excl = incl;
            }
            double unit = product.taxId > 0 ? roundMoney4(product.listPrice / GST_FACTOR) : product.listPrice;
            amountTotal += incl;
            amountTax += roundMoney(incl - excl);
            ObjectNode line = objectMapper.createObjectNode();
            line.put("product_id", product.id);
            line.put("qty", qty);
            line.put("price_unit", unit);
            line.put("discount", 0);
            line.put("price_subtotal", excl);
            line.put("price_subtotal_incl", incl);
            ArrayNode taxCmd = line.putArray("tax_ids");
            ArrayNode replace = taxCmd.addArray();
            replace.add(6);
            replace.add(0);
            ArrayNode taxIds = replace.addArray();
            if (product.taxId > 0) taxIds.add(product.taxId);
            line.putArray("pack_lot_ids");
            ArrayNode cmd = objectMapper.createArrayNode();
            cmd.add(0);
            cmd.add(0);
            cmd.add(line);
            lines.add(cmd);
        }
        amountTotal = roundMoney(amountTotal);
        amountTax = roundMoney(amountTax);

        ObjectNode order = objectMapper.createObjectNode();
        order.put("amount_paid", amountTotal);
        order.put("amount_return", 0);
        order.put("amount_tax", amountTax);
        order.put("amount_total", amountTotal);
        order.put("date_order", dateOrder);
        order.put("fiscal_position_id", false);
        order.put("pricelist_id", false);
        order.put("name", "Order " + uuid);
        order.put("is_refund", false);
        order.put("last_order_preparation_change", "{}");
        order.set("lines", lines);
        if (partnerId > 0) order.put("partner_id", partnerId);
        else order.put("partner_id", false);
        order.put("session_id", posSessionId);
        ArrayNode payments = order.putArray("payment_ids");
        ArrayNode payCmd = payments.addArray();
        payCmd.add(0);
        payCmd.add(0);
        ObjectNode payment = objectMapper.createObjectNode();
        payment.put("amount", amountTotal);
        payment.put("name", dateOrder);
        payment.put("payment_method_id", paymentMethodId);
        payCmd.add(payment);
        order.put("uuid", uuid);
        order.put("user_id", uid);
        order.put("to_invoice", false);
        return order;
    }

    private ObjectNode buildRefundDemoOrder(
            List<JsonNode> sourceLines,
            String dateOrder,
            String uuid,
            long uid,
            long posSessionId,
            long paymentMethodId) {
        ArrayNode lines = objectMapper.createArrayNode();
        double amountTotal = 0;
        double amountTax = 0;
        // Refund the first source line only (full qty) for a simple negative Overview refund.
        JsonNode source = sourceLines.get(0);
        long productId = relationId(source.get("product_id"));
        double qty = source.path("qty").asDouble(0);
        double priceUnit = source.path("price_unit").asDouble(0);
        double subtotal = source.path("price_subtotal").asDouble(0);
        double subtotalIncl = source.path("price_subtotal_incl").asDouble(0);
        long sourceLineId = source.path("id").asLong(0);
        List<Long> taxIds = new ArrayList<>();
        JsonNode taxes = source.get("tax_ids");
        if (taxes != null && taxes.isArray()) {
            for (JsonNode tax : taxes) taxIds.add(tax.asLong());
        }

        ObjectNode line = objectMapper.createObjectNode();
        line.put("product_id", productId);
        line.put("qty", -Math.abs(qty));
        line.put("price_unit", priceUnit);
        line.put("discount", 0);
        line.put("price_subtotal", -Math.abs(subtotal));
        line.put("price_subtotal_incl", -Math.abs(subtotalIncl));
        if (sourceLineId > 0) line.put("refunded_orderline_id", sourceLineId);
        ArrayNode taxCmd = line.putArray("tax_ids");
        ArrayNode replace = taxCmd.addArray();
        replace.add(6);
        replace.add(0);
        ArrayNode taxIdNode = replace.addArray();
        for (Long taxId : taxIds) taxIdNode.add(taxId);
        line.putArray("pack_lot_ids");
        ArrayNode cmd = objectMapper.createArrayNode();
        cmd.add(0);
        cmd.add(0);
        cmd.add(line);
        lines.add(cmd);

        amountTotal = -Math.abs(subtotalIncl);
        amountTax = -Math.abs(subtotalIncl - subtotal);

        ObjectNode order = objectMapper.createObjectNode();
        order.put("amount_paid", amountTotal);
        order.put("amount_return", 0);
        order.put("amount_tax", roundMoney(amountTax));
        order.put("amount_total", roundMoney(amountTotal));
        order.put("date_order", dateOrder);
        order.put("fiscal_position_id", false);
        order.put("pricelist_id", false);
        order.put("name", "Refund " + uuid);
        order.put("is_refund", true);
        order.put("last_order_preparation_change", "{}");
        order.set("lines", lines);
        order.put("partner_id", false);
        order.put("session_id", posSessionId);
        ArrayNode payments = order.putArray("payment_ids");
        ArrayNode payCmd = payments.addArray();
        payCmd.add(0);
        payCmd.add(0);
        ObjectNode payment = objectMapper.createObjectNode();
        payment.put("amount", roundMoney(amountTotal));
        payment.put("name", dateOrder);
        payment.put("payment_method_id", paymentMethodId);
        payCmd.add(payment);
        order.put("uuid", uuid);
        order.put("user_id", uid);
        order.put("to_invoice", false);
        return order;
    }

    private List<JsonNode> readOrderLines(String sessionId, long companyId, long orderId) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("order_id").add("=").add(orderId));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode()
                .add("id").add("product_id").add("qty").add("price_unit")
                .add("price_subtotal").add("price_subtotal_incl").add("tax_ids"));
        kwargs.put("limit", 20);
        JsonNode rows = callKwNode(sessionId, "pos.order.line", "search_read", List.of(domain), kwargs);
        List<JsonNode> lines = new ArrayList<>();
        if (rows != null && rows.isArray()) {
            for (JsonNode row : rows) lines.add(row);
        }
        return lines;
    }

    private JsonNode findSyncedOrder(JsonNode synced, String uuid) {
        if (synced == null || !synced.isObject()) return null;
        JsonNode orders = synced.get("pos.order");
        if (orders == null || !orders.isArray()) return null;
        for (JsonNode order : orders) {
            if (uuid.equals(order.path("uuid").asText())) return order;
        }
        return null;
    }

    private JsonNode findOrderByUuid(String sessionId, long companyId, String uuid) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("uuid").add("=").add(uuid));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode()
                .add("id").add("uuid").add("amount_total").add("name"));
        kwargs.put("limit", 1);
        JsonNode rows = callKwNode(sessionId, "pos.order", "search_read", List.of(domain), kwargs);
        return rows != null && rows.isArray() && !rows.isEmpty() ? rows.get(0) : null;
    }

    private long currentUid(String sessionId) throws Exception {
        HttpResponse<String> info = postJson(baseUrl + "/web/session/get_session_info", objectMapper.createObjectNode(), sessionId);
        JsonNode root = objectMapper.readTree(info.body());
        return root.path("result").path("uid").asLong(0);
    }

    private static long relationId(JsonNode relation) {
        if (relation == null || relation.isNull() || relation.isBoolean()) return 0;
        if (relation.isArray() && !relation.isEmpty()) return relation.get(0).asLong(0);
        if (relation.isNumber()) return relation.asLong(0);
        return 0;
    }

    private static int indexOfProduct(List<DummyProduct> products, long productId) {
        for (int i = 0; i < products.size(); i++) {
            if (products.get(i).id == productId) return i;
        }
        return 0;
    }

    private static double roundMoney(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private static double roundMoney4(double value) {
        return Math.round(value * 10000.0) / 10000.0;
    }

    private long findDummyProductVariant(String sessionId, long companyId, String defaultCode) throws Exception {
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("company_id").add("=").add(companyId));
        domain.add(objectMapper.createArrayNode().add("default_code").add("=").add(defaultCode));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode().add("id").add("product_tmpl_id"));
        kwargs.put("limit", 1);
        JsonNode products = callKwNode(sessionId, "product.product", "search_read", List.of(domain), kwargs);
        return products != null && products.isArray() && !products.isEmpty()
                ? products.get(0).path("id").asLong(0)
                : 0;
    }

    private void ensureDummyProductIncomeAccount(
            String sessionId, long companyId, long productId, long incomeAccountId) throws Exception {
        if (productId <= 0 || incomeAccountId <= 0) return;
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("id").add("=").add(productId));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode().add("product_tmpl_id"));
        kwargs.put("limit", 1);
        JsonNode products = callKwNode(sessionId, "product.product", "search_read", List.of(domain), kwargs);
        if (products == null || !products.isArray() || products.isEmpty()) return;
        long templateId = relationId(products.get(0).get("product_tmpl_id"));
        if (templateId <= 0) return;
        ObjectNode values = objectMapper.createObjectNode();
        values.put("property_account_income_id", incomeAccountId);
        callKw(sessionId, "product.template", "write",
                List.of(List.of(templateId), values), kwargsWithCompany(companyId));
    }

    private void ensureDummyStock(
            String sessionId,
            long companyId,
            long productId,
            long stockLocationId,
            double targetQuantity) throws Exception {
        double quantity = targetQuantity > 0 ? targetQuantity : DUMMY_STOCK_QUANTITY;
        ArrayNode domain = objectMapper.createArrayNode();
        domain.add(objectMapper.createArrayNode().add("product_id").add("=").add(productId));
        domain.add(objectMapper.createArrayNode().add("location_id").add("=").add(stockLocationId));
        ObjectNode kwargs = kwargsWithCompany(companyId);
        kwargs.set("fields", objectMapper.createArrayNode().add("id").add("quantity"));
        kwargs.put("limit", 1);
        JsonNode quants = callKwNode(sessionId, "stock.quant", "search_read", List.of(domain), kwargs);
        long quantId = quants != null && quants.isArray() && !quants.isEmpty()
                ? quants.get(0).path("id").asLong(0)
                : 0;
        double currentQuantity = quants != null && quants.isArray() && !quants.isEmpty()
                ? quants.get(0).path("quantity").asDouble(0)
                : 0;
        if (currentQuantity >= quantity) return;

        if (quantId > 0) {
            ObjectNode values = objectMapper.createObjectNode();
            values.put("inventory_quantity", quantity);
            callKwNode(sessionId, "stock.quant", "write", List.of(List.of(quantId), values), kwargsWithCompany(companyId));
        } else {
            ObjectNode values = objectMapper.createObjectNode();
            values.put("product_id", productId);
            values.put("location_id", stockLocationId);
            values.put("inventory_quantity", quantity);
            Number createdId = callKw(sessionId, "stock.quant", "create", List.of(values), kwargsWithCompany(companyId));
            if (createdId == null) throw new IllegalStateException("stock.quant.create returned no id");
            quantId = createdId.longValue();
        }
        callKwNode(sessionId, "stock.quant", "action_apply_inventory", List.of(List.of(quantId)), kwargsWithCompany(companyId));
    }

    private record DummyProduct(long id, String code, String name, double listPrice, long taxId) {}

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
                .timeout(Duration.ofSeconds(90))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)));
        if (sessionId != null && !sessionId.isBlank()) {
            builder.header("Cookie", "session_id=" + sessionId);
        }
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
