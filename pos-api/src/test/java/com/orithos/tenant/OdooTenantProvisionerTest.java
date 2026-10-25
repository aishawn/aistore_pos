package com.orithos.tenant;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OdooTenantProvisionerTest {

    @Test
    void namesSingleRegisterWithoutNumberSuffix() {
        assertEquals(List.of("Main Store Register"), OdooTenantProvisioner.registerConfigNames("Main Store", 1));
    }

    @Test
    void retailPricelistNameMatchesRegisterLabel() {
        assertEquals("Main Store Register Prices", OdooTenantProvisioner.retailPricelistName("Main Store Register"));
    }

    @Test
    void namesEachRegisterForOutlet() {
        assertEquals(
                List.of("Main Store Register 1", "Main Store Register 2", "Main Store Register 3"),
                OdooTenantProvisioner.registerConfigNames("Main Store", 3));
    }

    @Test
    void dummyCatalogDefinesEnoughSkusAcrossCategories() {
        assertEquals(14, OdooTenantProvisioner.dummyCatalogSize());
        assertEquals(5, OdooTenantProvisioner.dummyCategoryCount());
        assertTrue(OdooTenantProvisioner.dummySalesCount() >= 25);
    }

    @Test
    void demoOrderUuidPrefixIncludesCompanyId() {
        assertEquals("demo-seed-16-", OdooTenantProvisioner.demoOrderUuidPrefix(16));
    }

    @Test
    void sampleDataStateDoesNotOfferPurgeBeforeOdooIsReady() {
        assertEquals("unavailable", OdooTenantProvisioner.sampleDataState(true, false, false, 0, 0));
        assertEquals("active", OdooTenantProvisioner.sampleDataState(true, false, true, 0, 0));
        assertEquals("cleared", OdooTenantProvisioner.sampleDataState(true, true, true, 0, 32));
    }
}
