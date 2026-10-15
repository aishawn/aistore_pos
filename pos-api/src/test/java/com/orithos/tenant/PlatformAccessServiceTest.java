package com.orithos.tenant;

import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class PlatformAccessServiceTest {

    private PlatformAccessService service;

    @BeforeEach
    void setUp() {
        TenantProperties props = new TenantProperties();
        props.setPlatformOperatorSlug("demo");
        service = new PlatformAccessService(props, mock(VendorMapper.class));
    }

    @Test
    void recognisesPlatformOperatorVendor() {
        Vendor vendor = new Vendor();
        vendor.setSubdomain("demo");
        assertTrue(service.isPlatformOperatorVendor(vendor));
    }

    @Test
    void rejectsOtherVendors() {
        Vendor vendor = new Vendor();
        vendor.setSubdomain("footestdomain");
        assertFalse(service.isPlatformOperatorVendor(vendor));
        assertFalse(service.isPlatformOperatorVendor(null));
    }
}
