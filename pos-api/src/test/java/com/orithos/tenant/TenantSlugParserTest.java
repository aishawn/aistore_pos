package com.orithos.tenant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TenantSlugParserTest {

    private TenantSlugParser parser;

    @BeforeEach
    void setUp() {
        TenantProperties props = new TenantProperties();
        props.setBaseDomain("orithos.com.au");
        props.setReservedSlugs("www,app,api,odoo,cdn,support,mail,status");
        parser = new TenantSlugParser(props);
    }

    @Test
    void resolvesTenantHost() {
        var host = parser.resolveHost("acme.orithos.com.au");
        assertFalse(host.controlPlane());
        assertEquals("acme", host.slug());
    }

    @Test
    void demoStoreIsTenantHost() {
        var host = parser.resolveHost("demo.orithos.com.au");
        assertFalse(host.controlPlane());
        assertEquals("demo", host.slug());
    }

    @Test
    void controlPlaneHosts() {
        assertTrue(parser.resolveHost("app.orithos.com.au").controlPlane());
        assertTrue(parser.resolveHost("orithos.com.au").controlPlane());
        assertTrue(parser.resolveHost("www.orithos.com.au").controlPlane());
        assertTrue(parser.resolveHost("localhost:3000").controlPlane());
    }

    @Test
    void reservedSubdomainIsControlPlane() {
        assertTrue(parser.resolveHost("api.orithos.com.au").controlPlane());
        assertTrue(parser.resolveHost("odoo.orithos.com.au").controlPlane());
    }

    @Test
    void slugValidation() {
        assertEquals("acme-cellars", parser.normalizeSlug("Acme-Cellars"));
        assertNull(parser.normalizeSlug("-bad"));
        assertNull(parser.normalizeSlug("a"));
        assertTrue(parser.isReserved("app"));
        assertFalse(parser.isReserved("demo"));
        assertFalse(parser.isReserved("acme"));
    }

    @Test
    void clientTenantHeaderCannotOverrideTheForwardedHost() {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Orithos-Tenant-Slug", "other-store");
        request.addHeader("X-Forwarded-Host", "demo.orithos.com.au");

        var resolved = parser.resolve(request);

        assertFalse(resolved.controlPlane());
        assertEquals("demo", resolved.slug());
    }
}
