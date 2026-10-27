package com.orithos.config;

import jakarta.servlet.ServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockFilterChain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
    void legacyOrderScanRemainsRetiredInOdooOnlyMode() throws Exception {
        OdooOnlyModeFilter filter = new OdooOnlyModeFilter(true);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/orders/receives/scan");
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(410, response.getStatus());
        assertNull(chain.getRequest());
        assertTrue(response.getContentAsString().contains("Classic POS API is retired"));
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
