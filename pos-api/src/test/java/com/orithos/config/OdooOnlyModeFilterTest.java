package com.orithos.config;

import jakarta.servlet.ServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockFilterChain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;

class OdooOnlyModeFilterTest {

    @Test
    void odooSafeAiInvoicePreviewPassesThrough() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/ai/invoice/preview");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertSame(request, (ServletRequest) chain.getRequest());
    }

    @Test
    void nativeOrderReceiveRoutePassesThroughInOdooOnlyMode() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/orders/receives/scan");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertSame(request, (ServletRequest) chain.getRequest());
    }

    @Test
    void nativeTenantScopedPurchaseOrdersPassThroughInOdooOnlyMode() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/orders");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertSame(request, (ServletRequest) chain.getRequest());
    }

    @Test
    void nativeSalesRoutesPassThroughInOdooOnlyMode() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        for (String[] route : new String[][]{
                {"GET", "/api/sales"},
                {"GET", "/api/sales/42"},
                {"POST", "/api/sales/quote"},
                {"POST", "/api/sales/checkout"},
                {"POST", "/api/sales/42/refunds"}
        }) {
            MockHttpServletRequest request = new MockHttpServletRequest(route[0], route[1]);
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            filter.doFilter(request, response, chain);
            assertEquals(200, response.getStatus());
            assertSame(request, (ServletRequest) chain.getRequest());
        }
    }

    @Test
    void nativeRegisterSessionRoutesPassThroughWhileClassicRegisterRoutesRemainRetired() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        for (String[] route : new String[][]{
                {"GET", "/api/retail/registers"},
                {"GET", "/api/retail/registers/11/sessions/current"},
                {"POST", "/api/retail/registers/11/sessions"},
                {"POST", "/api/retail/registers/sessions/41/cash-movements"},
                {"POST", "/api/retail/registers/11/sessions/close"}
        }) {
            MockHttpServletRequest request = new MockHttpServletRequest(route[0], route[1]);
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            filter.doFilter(request, response, chain);
            assertEquals(200, response.getStatus());
            assertSame(request, (ServletRequest) chain.getRequest());
        }
        MockHttpServletRequest legacy = new MockHttpServletRequest("GET", "/api/registers");
        MockHttpServletResponse legacyResponse = new MockHttpServletResponse();
        filter.doFilter(legacy, legacyResponse, new MockFilterChain());
        assertEquals(410, legacyResponse.getStatus());
    }

    @Test
    void legacySaleWritesRemainRetiredInOdooOnlyMode() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        for (String[] route : new String[][]{
                {"POST", "/api/sales"},
                {"PUT", "/api/sales/42"},
                {"PUT", "/api/sales/42/void"}
        }) {
            MockHttpServletRequest request = new MockHttpServletRequest(route[0], route[1]);
            MockHttpServletResponse response = new MockHttpServletResponse();
            filter.doFilter(request, response, new MockFilterChain());
            assertEquals(410, response.getStatus());
        }
    }

    @Test
    void tenantScopedSupplierRoutesAndOutletReadsPassThrough() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        for (String[] route : new String[][]{
                {"GET", "/api/suppliers"},
                {"GET", "/api/suppliers/1"},
                {"POST", "/api/suppliers"},
                {"PUT", "/api/suppliers/1"},
                {"DELETE", "/api/suppliers/1"},
                {"POST", "/api/suppliers/import-products"},
                {"PUT", "/api/suppliers/1/products"},
                {"PUT", "/api/suppliers/1/merge"},
                {"GET", "/api/outlets"}
        }) {
            MockHttpServletRequest request = new MockHttpServletRequest(route[0], route[1]);
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            filter.doFilter(request, response, chain);
            assertEquals(200, response.getStatus());
            assertSame(request, (ServletRequest) chain.getRequest());
        }
    }

    @Test
    void nativeProductReadsPassThroughWhileProductWritesRemainRetired() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        for (String path : new String[]{"/api/products", "/api/products/filter-options", "/api/products/12", "/api/products/12/prices"}) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            filter.doFilter(request, response, chain);
            assertEquals(200, response.getStatus());
            assertSame(request, (ServletRequest) chain.getRequest());
        }
        MockHttpServletRequest write = new MockHttpServletRequest("POST", "/api/products");
        MockHttpServletResponse writeResponse = new MockHttpServletResponse();
        filter.doFilter(write, writeResponse, new MockFilterChain());
        assertEquals(410, writeResponse.getStatus());
    }

    @Test
    void nativeSupplyPlanAndCartPassThroughWhileLegacySupplyWritesRemainRetired() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        for (var route : new String[][]{
                {"GET", "/api/supply-chain/plan"},
                {"GET", "/api/supply-chain/settings"},
                {"POST", "/api/supply-chain/suppliers/12/cart"}
        }) {
            MockHttpServletRequest request = new MockHttpServletRequest(route[0], route[1]);
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            filter.doFilter(request, response, chain);
            assertEquals(200, response.getStatus());
            assertSame(request, (ServletRequest) chain.getRequest());
        }
        MockHttpServletRequest generate = new MockHttpServletRequest("POST", "/api/supply-chain/plan/generate");
        MockHttpServletResponse generateResponse = new MockHttpServletResponse();
        filter.doFilter(generate, generateResponse, new MockFilterChain());
        assertEquals(410, generateResponse.getStatus());
    }

    @Test
    void nativeReportAndCustomerReadsPassThroughWhileCustomerWritesRemainRetired() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        for (String path : new String[]{
                "/api/reports/native-overview",
                "/api/customers",
                "/api/customers/42",
                "/api/customers/42/recent-sales",
                "/api/customers/groups",
                "/api/customers/groups/4",
                "/api/customers/groups/4/revisions",
                "/api/customer-payments",
                "/api/customer-payments/2",
                "/api/customer-payments/2/allocations"
        }) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();
            filter.doFilter(request, response, chain);
            assertEquals(200, response.getStatus());
            assertSame(request, (ServletRequest) chain.getRequest());
        }
        MockHttpServletResponse writeResponse = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest("POST", "/api/customers"), writeResponse, new MockFilterChain());
        assertEquals(410, writeResponse.getStatus());

        for (String path : new String[]{
                "/api/customers/statements/preview",
                "/api/customers/export",
                "/api/customers/42/payments"
        }) {
            MockHttpServletResponse legacyResponse = new MockHttpServletResponse();
            filter.doFilter(new MockHttpServletRequest("GET", path), legacyResponse, new MockFilterChain());
            assertEquals(410, legacyResponse.getStatus(), path);
        }
    }

    @Test
    void appUserManagementRemainsAvailableInOdooOnlyMode() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/users");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertSame(request, (ServletRequest) chain.getRequest());
    }
}
