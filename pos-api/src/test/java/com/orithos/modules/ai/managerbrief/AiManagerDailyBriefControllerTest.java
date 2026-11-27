package com.orithos.modules.ai.managerbrief;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiManagerDailyBriefControllerTest {
    @Test
    void rejectsUsersWithoutTheManagerBriefGrantBeforeReadingTenantData() {
        var service = mock(AiManagerDailyBriefService.class);
        var tenants = mock(TenantContextFactory.class);
        var permissions = mock(PermissionAccess.class);
        doThrow(new BusinessException(40300, "Forbidden")).when(permissions).requirePermission("ai.manager.brief.read");
        var controller = new AiManagerDailyBriefController(service, tenants, permissions);

        assertThrows(BusinessException.class, controller::get);

        verify(tenants, never()).fromSecurity();
        verify(service, never()).getOrRefresh(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyBoolean());
    }

    @Test
    void derivesStoreScopeFromTheAuthenticatedTenant() {
        var service = mock(AiManagerDailyBriefService.class);
        var tenants = mock(TenantContextFactory.class);
        var permissions = mock(PermissionAccess.class);
        var tenant = new TenantContext(55L, 7L, 87L, java.util.List.of(87L), java.util.Set.of());
        when(tenants.fromSecurity()).thenReturn(tenant);
        var controller = new AiManagerDailyBriefController(service, tenants, permissions);

        controller.refresh();

        verify(service).getOrRefresh(tenant, true);
    }
}
