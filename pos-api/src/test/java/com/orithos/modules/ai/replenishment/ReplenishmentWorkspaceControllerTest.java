package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReplenishmentWorkspaceControllerTest {

    @Test
    void draftEnabledForSkrHost() {
        ReplenishmentWorkspaceService service = mock(ReplenishmentWorkspaceService.class);
        TenantContextFactory tenantFactory = mock(TenantContextFactory.class);
        PermissionAccess permissions = mock(PermissionAccess.class);
        PurchaseDraftGate gate = new PurchaseDraftGate("true", "skr.orithos.com.au");
        doNothing().when(permissions).requirePermission(anyString());
        when(tenantFactory.fromSecurity()).thenReturn(new TenantContext(1L, 2L, 3L, List.of(3L), Set.of()));
        when(service.plan(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyBoolean(), org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(new ReplenishmentWorkspaceView(
                        "SKR", 56, 21, 21, List.of(),
                        false, 0, false,
                        new ReplenishmentWorkspaceView.SalesHistory("Australia/Adelaide", true, "SIGNED_NET_UNITS"),
                        0, java.util.Map.of(), java.time.Instant.now().toString(),
                        new ReplenishmentWorkspaceView.InventoryHistory("REVIEW", null, "Australia/Adelaide",
                                1, 1, 1d, null, null, null, java.util.Map.of()),
                        new ReplenishmentWorkspaceView.Forecast(false, "rules_v1_weighted_velocity", "UNAVAILABLE", null),
                        new ReplenishmentWorkspaceView.PurchaseWorkflow(true, "DRAFT_RFQ"),
                        new ReplenishmentWorkspaceView.CatalogueCoverage("COMPLETE", 0, 0, 0)));

        ReplenishmentWorkspaceController controller = new ReplenishmentWorkspaceController(
                service, tenantFactory, permissions, gate);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("host", "skr.orithos.com.au");
        var result = controller.plan(21, null, request);
        assertTrue(result.data().purchaseWorkflow().draftEnabled());
    }
}