package com.orithos.modules.ai.snapshot;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.PermissionAccess;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class OdooReadSnapshotServiceTest {
    @Test
    void refusesSyncWhenOdooCredentialsAreMissing() {
        Vendor vendor = new Vendor();
        vendor.setOdooCompanyId(10L);
        vendor.setOdooProvisionStatus("ready");
        VendorMapper vendorMapper = Mockito.mock(VendorMapper.class);
        Mockito.when(vendorMapper.findById(1L)).thenReturn(vendor);
        PermissionAccess permissions = Mockito.mock(PermissionAccess.class);
        OdooReadSnapshotService service = new OdooReadSnapshotService(
                new ObjectMapper(), vendorMapper, null, permissions, "", "aipos_uat", "", "");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.sync(new TenantContext(1L, 2L, 3L, java.util.List.of(3L), java.util.Set.of())));

        assertEquals(50320, error.getCode());
    }
}
