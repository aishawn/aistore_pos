package com.orithos.modules.ai.report;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

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
