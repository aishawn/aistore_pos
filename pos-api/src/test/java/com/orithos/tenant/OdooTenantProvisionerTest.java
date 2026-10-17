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
}
