package com.orithos.modules.ai.report;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.AustraliaTime;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OdooReportQueryServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private HttpServer server;

    @AfterEach
    void stopServer() {
        if (server != null) server.stop(0);
    }

    @Test
    void salesReportUsesOnlyTheBoundOdooCompanyAndReadMethods() throws Exception {
        List<JsonNode> requests = startServer("""
                [{"date_order:day":"2026-10-14","amount_total":125.50,"__count":2}]
                """);
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        LocalDate day = LocalDate.of(2026, 10, 14);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        OdooReportQueryService.Result result = service.query(tenant, "report_sales", Map.of(), window);

        assertNull(result.error());
        assertEquals(1, result.rows().size());
        assertEquals("2026-10-14", result.rows().get(0).get("date"));
        assertEquals(0, new BigDecimal("125.50").compareTo((BigDecimal) result.rows().get(0).get("sales")));
        assertEquals(2, requests.size());
        assertEquals("service", requests.get(0).path("params").path("login").asText());
        JsonNode query = requests.get(1).path("params");
        assertEquals("pos.order", query.path("model").asText());
        assertEquals("read_group", query.path("method").asText());
        assertEquals(List.of(77), MAPPER.convertValue(query.path("kwargs").path("context").path("allowed_company_ids"),
                MAPPER.getTypeFactory().constructCollectionType(List.class, Integer.class)));
        assertEquals(77, query.path("kwargs").path("context").path("force_company").asInt());
        String domain = query.path("args").get(0).toString();
        String fromUtc = day.atStartOfDay().atZone(com.orithos.common.AustraliaTime.ZONE)
                .withZoneSameInstant(ZoneOffset.UTC).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String toUtc = day.plusDays(1).atStartOfDay().atZone(com.orithos.common.AustraliaTime.ZONE)
                .withZoneSameInstant(ZoneOffset.UTC).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        assertTrue(domain.contains("\"company_id\""));
        assertTrue(domain.contains(fromUtc));
        assertTrue(domain.contains(toUtc));
        assertFalse(requests.stream().anyMatch(node -> {
            String method = node.path("params").path("method").asText();
            return Set.of("create", "write", "unlink").contains(method);
        }));
    }

    @Test
    void clearedDemoSeedOrdersAreExcludedFromTheOdooDomain() throws Exception {
        List<JsonNode> requests = startServer("[]");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(true));
        OdooReportQueryService service = service(vendors);
        LocalDate day = LocalDate.of(2026, 10, 14);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        OdooReportQueryService.Result result = service.query(tenant, "report_sales", Map.of(),
                new ReportPeriodResolver.Window(day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1));

        assertNull(result.error());
        assertTrue(requests.get(1).path("params").path("args").get(0).toString().contains("demo-seed-77-%"));
    }

    @Test
    void boundCompanyTimezoneControlsReportDayBoundariesAndGroupingContext() throws Exception {
        List<JsonNode> requests = startTimezoneServer();
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        ZoneId timezone = service.businessTimezone(tenant);
        assertEquals(ZoneId.of("Australia/Adelaide"), timezone);
        LocalDate day = LocalDate.of(2026, 10, 14);
        OdooReportQueryService.Result result = service.query(tenant, "report_sales", Map.of(),
                new ReportPeriodResolver.Window(day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1));

        assertNull(result.error());
        JsonNode reportRequest = requests.stream()
                .filter(request -> "pos.order".equals(request.path("params").path("model").asText()))
                .findFirst().orElseThrow();
        JsonNode params = reportRequest.path("params");
        assertEquals("Australia/Adelaide", params.path("kwargs").path("context").path("tz").asText());
        String domain = params.path("args").get(0).toString();
        String fromUtc = day.atStartOfDay().atZone(timezone).withZoneSameInstant(ZoneOffset.UTC)
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        String toUtc = day.plusDays(1).atStartOfDay().atZone(timezone).withZoneSameInstant(ZoneOffset.UTC)
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        assertTrue(domain.contains(fromUtc));
        assertTrue(domain.contains(toUtc));
    }

    @Test
    void unlinkedStoreAndAdhocIntentFailWithoutCallingOdoo() throws Exception {
        List<JsonNode> requests = startServer("[]");
        VendorMapper vendors = mock(VendorMapper.class);
        Vendor unlinked = readyVendor(false);
        unlinked.setOdooProvisionStatus("unmapped");
        when(vendors.findById(42L)).thenReturn(unlinked);
        OdooReportQueryService service = service(vendors);
        LocalDate day = LocalDate.of(2026, 10, 14);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);

        assertEquals("ODOO_REPORT_STORE_UNLINKED", service.query(tenant, "report_sales", Map.of(), window).error());
        assertEquals("ODOO_REPORT_UNSUPPORTED", service.query(tenant, "report_adhoc", Map.of(), window).error());
        assertTrue(requests.isEmpty());
    }

    @Test
    void productCountUsesOdooSearchCountWithSellableAndCompanyScope() throws Exception {
        List<JsonNode> requests = startStockServer("286");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        OdooReportQueryService.ProductCountResult result = service.countSellableProducts(tenant);

        assertEquals(Integer.valueOf(286), result.count());
        assertNull(result.error());
        assertEquals(2, requests.size());
        JsonNode params = requests.get(1).path("params");
        assertEquals("product.product", params.path("model").asText());
        assertEquals("search_count", params.path("method").asText());
        assertEquals(77, params.path("kwargs").path("context").path("force_company").asInt());
        assertEquals(List.of(77), MAPPER.convertValue(params.path("kwargs").path("context")
                        .path("allowed_company_ids"),
                MAPPER.getTypeFactory().constructCollectionType(List.class, Integer.class)));
        String domain = params.path("args").get(0).toString();
        assertTrue(domain.contains("available_in_pos"));
        assertTrue(domain.contains("\"company_id\",\"=\",77"));
        assertTrue(domain.contains("\"company_id\",\"=\",false"));
    }

    @Test
    void productCountPreservesZeroAsARealOdooResult() throws Exception {
        startStockServer("0");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        OdooReportQueryService.ProductCountResult result = service.countSellableProducts(tenant);

        assertEquals(Integer.valueOf(0), result.count());
        assertNull(result.error());
    }

    @Test
    void productCountDoesNotQueryOdooWithoutReportPermission() throws Exception {
        List<JsonNode> requests = startStockServer("286");
        VendorMapper vendors = mock(VendorMapper.class);
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of());

        assertEquals("NO_PERMISSION", service.countSellableProducts(tenant).error());

        assertTrue(requests.isEmpty());
        verifyNoInteractions(vendors);
    }

    @Test
    void recommendationCatalogueDoesNotQueryOdooWithoutReportPermission() throws Exception {
        List<JsonNode> requests = startStockServer("[]");
        VendorMapper vendors = mock(VendorMapper.class);
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of());

        assertEquals("NO_PERMISSION", service.listRecommendationProducts(tenant).error());

        assertTrue(requests.isEmpty());
        verifyNoInteractions(vendors);
    }

    @Test
    void productCountDoesNotQueryOdooWithoutOutlet() throws Exception {
        List<JsonNode> requests = startStockServer("286");
        VendorMapper vendors = mock(VendorMapper.class);
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, null, List.of(), Set.of(TenantContext.PERM_QUERY));

        assertEquals("NO_OUTLET", service.countSellableProducts(tenant).error());

        assertTrue(requests.isEmpty());
        verifyNoInteractions(vendors);
    }

    @Test
    void productCountExplainsMissingOdooConfigurationWithoutLookingUpVendor() {
        VendorMapper vendors = mock(VendorMapper.class);
        OdooReportQueryService service = new OdooReportQueryService(
                MAPPER, vendors, "", "testdb", "service", "secret");
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        assertEquals("ODOO_REPORT_NOT_CONFIGURED", service.countSellableProducts(tenant).error());
        verifyNoInteractions(vendors);
    }

    @Test
    void productCountExplainsUnlinkedStoreWithoutCallingOdoo() throws Exception {
        List<JsonNode> requests = startStockServer("286");
        VendorMapper vendors = mock(VendorMapper.class);
        Vendor unlinked = readyVendor(false);
        unlinked.setOdooProvisionStatus("unmapped");
        when(vendors.findById(42L)).thenReturn(unlinked);
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        assertEquals("ODOO_REPORT_STORE_UNLINKED", service.countSellableProducts(tenant).error());
        assertTrue(requests.isEmpty());
    }

    @Test
    void productCountReturnsPermissionErrorOnOdooAccessError() throws Exception {
        startStockServer("{\"error\":{\"code\":200,\"message\":\"AccessError\","
                + "\"data\":{\"name\":\"odoo.exceptions.AccessError\"}}}");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        assertEquals("NO_PERMISSION", service.countSellableProducts(tenant).error());
    }

    @Test
    void productSearchDistinguishesEmptyMatchesFromOdooFailure() throws Exception {
        List<JsonNode> emptyRequests = startStockServer("[]");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        OdooReportQueryService.ProductSearchResult empty = service.searchProducts(tenant, "No match", 8);

        assertNull(empty.error());
        assertTrue(empty.rows().isEmpty());
        JsonNode searchParams = emptyRequests.get(1).path("params");
        assertEquals("product.product", searchParams.path("model").asText());
        assertEquals("search_read", searchParams.path("method").asText());
        String searchDomain = searchParams.path("args").get(0).toString();
        assertTrue(searchDomain.contains("No match"));
        assertTrue(searchDomain.contains("default_code"));
        assertTrue(searchDomain.contains("barcode"));
        assertTrue(searchDomain.contains("\"|\""));
        assertTrue(searchDomain.contains("available_in_pos"));
        assertTrue(searchDomain.contains("\"company_id\",\"=\",77"));
        assertTrue(searchDomain.contains("\"company_id\",\"=\",false"));
        assertFalse(emptyRequests.stream().anyMatch(request -> Set.of("create", "write", "unlink")
                .contains(request.path("params").path("method").asText())));

        stopServer();
        List<JsonNode> failedRequests = startStockServer(
                "{\"error\":{\"code\":200,\"message\":\"AccessError\","
                        + "\"data\":{\"name\":\"odoo.exceptions.AccessError\"}}}");
        OdooReportQueryService.ProductSearchResult denied = service(vendors).searchProducts(tenant, "Shiraz", 8);

        assertEquals("NO_PERMISSION", denied.error());
        assertTrue(denied.rows().isEmpty());
        assertEquals(2, failedRequests.size());
        assertFalse(failedRequests.stream().anyMatch(request -> Set.of("create", "write", "unlink")
                .contains(request.path("params").path("method").asText())));
    }

    @Test
    void productSearchRequiresReportPermissionAndOutletBeforeOdooAccess() throws Exception {
        List<JsonNode> requests = startStockServer("[]");
        VendorMapper vendors = mock(VendorMapper.class);
        OdooReportQueryService service = service(vendors);
        TenantContext noPermission = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of());
        TenantContext noOutlet = new TenantContext(42L, 7L, null, List.of(), Set.of(TenantContext.PERM_QUERY));

        assertEquals("NO_PERMISSION", service.searchProducts(noPermission, "Shiraz", 8).error());
        assertEquals("NO_OUTLET", service.searchProducts(noOutlet, "Shiraz", 8).error());
        assertTrue(requests.isEmpty());
        verifyNoInteractions(vendors);
    }

    @Test
    void productCountFailsClosedWhenVendorLookupThrows() throws Exception {
        List<JsonNode> requests = startStockServer("286");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenThrow(new IllegalStateException("vendor storage unavailable"));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        assertEquals("ODOO_REPORT_UNAVAILABLE", service.countSellableProducts(tenant).error());
        assertTrue(requests.isEmpty());
    }

    @Test
    void productSearchReturnsUnavailableWhenVendorLookupThrows() throws Exception {
        List<JsonNode> requests = startStockServer("[]");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenThrow(new IllegalStateException("vendor storage unavailable"));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        OdooReportQueryService.ProductSearchResult result = service.searchProducts(tenant, "Shiraz", 8);

        assertEquals("ODOO_REPORT_UNAVAILABLE", result.error());
        assertTrue(result.rows().isEmpty());
        assertTrue(requests.isEmpty());
    }

    @Test
    void reportReturnsUnavailableWhenVendorLookupThrows() throws Exception {
        List<JsonNode> requests = startStockServer("[]");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenThrow(new IllegalStateException("vendor storage unavailable"));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                LocalDate.of(2026, 10, 16), LocalDate.of(2026, 10, 16));

        OdooReportQueryService.Result result = service.query(
                tenant, "report_stock", Map.of("query", "Shiraz"), window);

        assertEquals("ODOO_REPORT_UNAVAILABLE", result.error());
        assertTrue(result.rows().isEmpty());
        assertTrue(requests.isEmpty());
    }

    @Test
    void businessTimezoneFallsBackWhenVendorLookupThrows() throws Exception {
        startStockServer("[]");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenThrow(new IllegalStateException("vendor storage unavailable"));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        assertEquals(AustraliaTime.ZONE, service.businessTimezone(tenant));
    }

    @Test
    void productCountRejectsNonIntegralOdooResponseInsteadOfTruncatingIt() throws Exception {
        startStockServer("286.5");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));

        assertEquals("ODOO_REPORT_UNAVAILABLE", service.countSellableProducts(tenant).error());
    }

    @Test
    void stockQueryUsesBoundCompanyWarehouseAndReturnsAvailableQuantity() throws Exception {
        List<JsonNode> requests = startStockServer(
                "[{\"id\":501,\"display_name\":\"VB Cans\",\"free_qty\":12.0,\"qty_available\":15.0}]");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));
        LocalDate day = LocalDate.of(2026, 10, 16);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);

        OdooReportQueryService.Result result = service.query(
                tenant, "report_stock", Map.of("query", "VB Cans"), window);

        assertNull(result.error());
        assertEquals(1, result.rows().size());
        assertEquals("VB Cans", result.rows().get(0).get("name"));
        assertEquals(0, new BigDecimal("12.0").compareTo((BigDecimal) result.rows().get(0).get("quantity")));
        assertEquals(2, requests.size());
        JsonNode request = requests.get(1).path("params");
        assertEquals("product.product", request.path("model").asText());
        assertEquals("search_read", request.path("method").asText());
        assertEquals("name asc, id asc", request.path("kwargs").path("order").asText());
        assertEquals(List.of("id", "name", "display_name", "free_qty", "qty_available"),
                MAPPER.convertValue(request.path("kwargs").path("fields"),
                        MAPPER.getTypeFactory().constructCollectionType(List.class, String.class)));
        assertEquals(77, request.path("kwargs").path("context").path("force_company").asInt());
        assertEquals(19, request.path("kwargs").path("context").path("warehouse").asInt());
        String domain = request.path("args").get(0).toString();
        assertTrue(domain.contains("VB Cans"));
        assertTrue(domain.contains("active"));
        assertTrue(domain.contains("company_id"));
        assertFalse(domain.contains("available_in_pos"));
        assertFalse(requests.stream().anyMatch(node -> {
            String method = node.path("params").path("method").asText();
            return Set.of("create", "write", "unlink").contains(method);
        }));
    }

    @Test
    void stockQueryReturnsAnEmptyResultWhenNoProductMatches() throws Exception {
        startStockServer("[]");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));
        LocalDate day = LocalDate.of(2026, 10, 16);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);

        OdooReportQueryService.Result result = service.query(
                tenant, "report_stock", Map.of("query", "Not in catalogue"), window);

        assertNull(result.error());
        assertTrue(result.rows().isEmpty());
    }

    @Test
    void stockQueryHidesOdooRpcErrorsAsUnavailableInsteadOfReturningInventory() throws Exception {
        startStockServer("{\"error\":{\"code\":200,\"message\":\"private product detail\","
                + "\"data\":{\"name\":\"odoo.exceptions.AccessError\"}}}");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        Logger logger = (Logger) LoggerFactory.getLogger(OdooReportQueryService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));
        LocalDate day = LocalDate.of(2026, 10, 16);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);

        String previousCorrelationId = MDC.get("correlationId");
        MDC.put("correlationId", "test-stock-report-correlation");
        try {
            OdooReportQueryService.Result result = service.query(
                    tenant, "report_stock", Map.of("query", "VB Cans"), window);

            assertEquals("ODOO_REPORT_UNAVAILABLE", result.error());
            assertTrue(result.rows().isEmpty());
            String diagnostic = appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                    .filter(message -> message.contains("failureKind=ODOO_RPC_ERROR"))
                    .findFirst().orElseThrow();
            assertTrue(diagnostic.contains("rpcCode=200"));
            assertTrue(diagnostic.contains("rpcType=AccessError"));
            assertTrue(diagnostic.contains("correlationId=test-stock-report-correlation"));
            assertFalse(diagnostic.contains("private product detail"));
        } finally {
            logger.detachAppender(appender);
            appender.stop();
            if (previousCorrelationId == null) MDC.remove("correlationId");
            else MDC.put("correlationId", previousCorrelationId);
        }
    }

    @Test
    void stockQueryLogsSafeDetailsForUnexpectedOdooResponseShape() throws Exception {
        startStockServer("{\"privateDetail\":\"sensitive response body\"}");
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        Logger logger = (Logger) LoggerFactory.getLogger(OdooReportQueryService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));
        LocalDate day = LocalDate.of(2026, 10, 16);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);

        try {
            OdooReportQueryService.Result result = service.query(
                    tenant, "report_stock", Map.of("query", "VB Cans"), window);

            assertEquals("ODOO_REPORT_UNAVAILABLE", result.error());
            String diagnostic = appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                    .filter(message -> message.contains("failureKind=ODOO_INVALID_RESPONSE"))
                    .findFirst().orElseThrow();
            assertTrue(diagnostic.contains("rpcModel=product.product"));
            assertTrue(diagnostic.contains("rpcMethod=search_read"));
            assertTrue(diagnostic.contains("responseType=OBJECT"));
            assertFalse(diagnostic.contains("sensitive response body"));
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void stockQueryFallsBackToStandardQuantityWhenFreeQuantityIsForbidden() throws Exception {
        List<JsonNode> requests = startStockFallbackServer();
        VendorMapper vendors = mock(VendorMapper.class);
        when(vendors.findById(42L)).thenReturn(readyVendor(false));
        OdooReportQueryService service = service(vendors);
        TenantContext tenant = new TenantContext(42L, 7L, 3L, List.of(3L), Set.of(TenantContext.PERM_QUERY));
        LocalDate day = LocalDate.of(2026, 10, 16);
        ReportPeriodResolver.Window window = new ReportPeriodResolver.Window(
                day.atStartOfDay(), day.plusDays(1).atStartOfDay(), 1);

        OdooReportQueryService.Result result = service.query(
                tenant, "report_stock", Map.of("query", "VB Cans"), window);

        assertNull(result.error());
        assertEquals(1, result.rows().size());
        assertEquals(0, new BigDecimal("15.0").compareTo((BigDecimal) result.rows().get(0).get("quantity")));
        assertEquals(3, requests.size());
          assertEquals(List.of("id", "name", "display_name", "qty_available"),
                  MAPPER.convertValue(requests.get(2).path("params").path("kwargs").path("fields"),
                          MAPPER.getTypeFactory().constructCollectionType(List.class, String.class)));
      }

      private List<JsonNode> startServer(String groupedRowsJson) throws Exception {
        List<JsonNode> requests = new CopyOnWriteArrayList<>();
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/web/session/authenticate", exchange -> {
            requests.add(MAPPER.readTree(exchange.getRequestBody()));
            exchange.getResponseHeaders().add("Set-Cookie", "session_id=test-session; Path=/; HttpOnly");
            respond(exchange, "{\"jsonrpc\":\"2.0\",\"result\":{\"uid\":5}}");
        });
        server.createContext("/web/dataset/call_kw", exchange -> {
            requests.add(MAPPER.readTree(exchange.getRequestBody()));
            respond(exchange, "{\"jsonrpc\":\"2.0\",\"result\":" + groupedRowsJson + "}");
        });
        server.start();
        return requests;
    }

    private List<JsonNode> startStockServer(String rpcResponseJson) throws Exception {
        List<JsonNode> requests = new CopyOnWriteArrayList<>();
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/web/session/authenticate", exchange -> {
            requests.add(MAPPER.readTree(exchange.getRequestBody()));
            exchange.getResponseHeaders().add("Set-Cookie", "session_id=test-session; Path=/; HttpOnly");
            respond(exchange, "{\"jsonrpc\":\"2.0\",\"result\":{\"uid\":5}}");
        });
        server.createContext("/web/dataset/call_kw", exchange -> {
            requests.add(MAPPER.readTree(exchange.getRequestBody()));
            String response = rpcResponseJson.startsWith("{\"error\"")
                    ? "{\"jsonrpc\":\"2.0\"," + rpcResponseJson.substring(1)
                    : "{\"jsonrpc\":\"2.0\",\"result\":" + rpcResponseJson + "}";
            respond(exchange, response);
        });
        server.start();
        return requests;
    }

    private List<JsonNode> startStockFallbackServer() throws Exception {
        List<JsonNode> requests = new CopyOnWriteArrayList<>();
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/web/session/authenticate", exchange -> {
            requests.add(MAPPER.readTree(exchange.getRequestBody()));
            exchange.getResponseHeaders().add("Set-Cookie", "session_id=test-session; Path=/; HttpOnly");
            respond(exchange, "{\"jsonrpc\":\"2.0\",\"result\":{\"uid\":5}}");
        });
        server.createContext("/web/dataset/call_kw", exchange -> {
            JsonNode request = MAPPER.readTree(exchange.getRequestBody());
            requests.add(request);
            JsonNode fields = request.path("params").path("kwargs").path("fields");
            String response = fields.toString().contains("free_qty")
                    ? "{\"jsonrpc\":\"2.0\",\"error\":{\"message\":\"AccessError\"}}"
                    : "{\"jsonrpc\":\"2.0\",\"result\":[{\"id\":501,\"display_name\":\"VB Cans\",\"qty_available\":15.0}]}";
            respond(exchange, response);
        });
        server.start();
        return requests;
    }

    private List<JsonNode> startTimezoneServer() throws Exception {
        List<JsonNode> requests = new CopyOnWriteArrayList<>();
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/web/session/authenticate", exchange -> {
            requests.add(MAPPER.readTree(exchange.getRequestBody()));
            exchange.getResponseHeaders().add("Set-Cookie", "session_id=test-session; Path=/; HttpOnly");
            respond(exchange, "{\"jsonrpc\":\"2.0\",\"result\":{\"uid\":5}}");
        });
        server.createContext("/web/dataset/call_kw", exchange -> {
            JsonNode request = MAPPER.readTree(exchange.getRequestBody());
            requests.add(request);
            String model = request.path("params").path("model").asText();
            String response = switch (model) {
                case "res.company" -> "[{\"id\":77,\"partner_id\":[100,\"Demo Company\"]}]";
                case "res.partner" -> "[{\"id\":100,\"country_id\":[13,\"Australia\"],"
                        + "\"state_id\":[5,\"South Australia\"]}]";
                case "pos.order" -> "[{\"date_order:day\":\"14 Oct 2026\",\"amount_total\":125.50,\"__count\":2}]";
                default -> "[]";
            };
            respond(exchange, "{\"jsonrpc\":\"2.0\",\"result\":" + response + "}");
        });
        server.start();
        return requests;
    }

    private OdooReportQueryService service(VendorMapper vendors) {
        return new OdooReportQueryService(MAPPER, vendors,
                "http://localhost:" + server.getAddress().getPort(), "testdb", "service", "secret");
    }

    private static Vendor readyVendor(boolean sampleDataCleared) {
        Vendor vendor = new Vendor();
        vendor.setId(42L);
        vendor.setOdooCompanyId(77L);
        vendor.setOdooWarehouseId(19L);
        vendor.setOdooProvisionStatus("ready");
        if (sampleDataCleared) vendor.setSampleDataClearedAt(LocalDateTime.of(2026, 10, 1, 0, 0));
        return vendor;
    }

    private static void respond(com.sun.net.httpserver.HttpExchange exchange, String body)
            throws java.io.IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        try (var stream = exchange.getResponseBody()) {
            stream.write(bytes);
        }
    }
}
