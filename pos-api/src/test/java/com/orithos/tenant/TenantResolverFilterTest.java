package com.orithos.tenant;

import com.orithos.modules.vendor.Vendor;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TenantResolverFilterTest {

    @Test
    void trialPastEndDateIsUnavailable() {
        Vendor vendor = new Vendor();
        vendor.setStatus("trial");
        vendor.setTrialEndsAt(LocalDateTime.now().minusDays(1));
        assertTrue(TenantResolverFilter.isUnavailable(vendor));
    }

    @Test
    void activeVendorIsAvailable() {
        Vendor vendor = new Vendor();
        vendor.setStatus("active");
        assertFalse(TenantResolverFilter.isUnavailable(vendor));
    }

    @Test
    void suspendedIsUnavailable() {
        Vendor vendor = new Vendor();
        vendor.setStatus("suspended");
        assertTrue(TenantResolverFilter.isUnavailable(vendor));
    }
}
