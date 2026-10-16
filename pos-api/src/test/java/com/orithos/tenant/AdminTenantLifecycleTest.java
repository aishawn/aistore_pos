package com.orithos.tenant;

import com.orithos.common.BusinessException;
import com.orithos.modules.auth.AccountLifecycleService;
import com.orithos.modules.user.mapper.UserMapper;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminTenantLifecycleTest {

    private PlatformAccessService platformAccess;
    private VendorMapper vendorMapper;
    private UserMapper userMapper;
    private TenantProperties tenantProperties;
    private AccountLifecycleService accountLifecycle;
    private OdooTenantProvisioner odooTenantProvisioner;
    private AdminTenantController controller;

    @BeforeEach
    void setUp() {
        platformAccess = mock(PlatformAccessService.class);
        vendorMapper = mock(VendorMapper.class);
        userMapper = mock(UserMapper.class);
        tenantProperties = new TenantProperties();
        tenantProperties.setPlatformOperatorSlug("demo");
        accountLifecycle = mock(AccountLifecycleService.class);
        odooTenantProvisioner = mock(OdooTenantProvisioner.class);
        controller = new AdminTenantController(
                mock(TenantProvisionService.class),
                platformAccess,
                vendorMapper,
                userMapper,
                tenantProperties,
                accountLifecycle,
                odooTenantProvisioner);
    }

    @Test
    void rejectsLifecycleOnPlatformOperatorVendor() {
        Vendor demo = vendor("demo", "trial");
        when(vendorMapper.findById(1L)).thenReturn(demo);
        when(platformAccess.isPlatformOperatorVendor(demo)).thenReturn(true);

        BusinessException ex = assertThrows(BusinessException.class, () ->
                controller.patchStatus(1L, new AdminTenantController.StatusBody("suspended")));
        assertEquals(40910, ex.getCode());
        verify(vendorMapper, never()).updateStatus(any(), any());
    }

    @Test
    void patchesStatusForNonOperatorStore() {
        Vendor store = vendor("acme", "trial");
        Vendor updated = vendor("acme", "suspended");
        updated.setId(2L);
        when(vendorMapper.findById(2L)).thenReturn(store, updated);
        when(platformAccess.isPlatformOperatorVendor(store)).thenReturn(false);
        when(userMapper.findPrimaryByVendor(2L)).thenReturn(null);

        var result = controller.patchStatus(2L, new AdminTenantController.StatusBody("suspended"));
        verify(vendorMapper).updateStatus(2L, "suspended");
        assertEquals("suspended", result.data().get("status"));
    }

    @Test
    void extendsTrialFromNow() {
        Vendor store = vendor("acme", "expired");
        store.setId(3L);
        Vendor after = vendor("acme", "trial");
        after.setId(3L);
        after.setTrialEndsAt(LocalDateTime.now().plusDays(14));
        when(vendorMapper.findById(3L)).thenReturn(store, after);
        when(platformAccess.isPlatformOperatorVendor(store)).thenReturn(false);
        when(userMapper.findPrimaryByVendor(3L)).thenReturn(null);

        controller.patchTrial(3L, new AdminTenantController.TrialBody(14));

        ArgumentCaptor<LocalDateTime> ends = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(vendorMapper).updateTrialEndsAt(eq(3L), ends.capture(), eq("trial"));
        assertTrue(ends.getValue().isAfter(LocalDateTime.now().plusDays(13)));
    }

    @Test
    void resetOwnerDelegatesToLifecycle() {
        Vendor store = vendor("acme", "active");
        store.setId(4L);
        when(vendorMapper.findById(4L)).thenReturn(store);
        when(accountLifecycle.issueOwnerResetForVendor(4L)).thenReturn(Map.of("resetUrl", "https://acme.example/reset"));

        var result = controller.resetOwner(4L);
        assertEquals("https://acme.example/reset", result.data().get("resetUrl"));
    }

    private static Vendor vendor(String subdomain, String status) {
        Vendor vendor = new Vendor();
        vendor.setId(1L);
        vendor.setName(subdomain);
        vendor.setSubdomain(subdomain);
        vendor.setStatus(status);
        return vendor;
    }
}
