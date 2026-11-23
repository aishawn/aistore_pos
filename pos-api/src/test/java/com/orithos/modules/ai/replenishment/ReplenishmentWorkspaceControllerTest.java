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
    void workspaceUsesTheSameInclusiveSalesWindowsAsAssistant() throws Exception {
        var jdbc = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var zones = mock(com.orithos.common.BusinessTimezoneService.class);
        var connection = mock(java.sql.Connection.class);
        var statement = mock(java.sql.PreparedStatement.class);
        when(zones.zoneForVendor(1L)).thenReturn(java.time.ZoneId.of("Australia/Melbourne"));
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(jdbc.query(org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.PreparedStatementCreator.class),
                org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.RowMapper.class)))
                .thenAnswer(invocation -> {
                    org.springframework.jdbc.core.PreparedStatementCreator creator = invocation.getArgument(0);
                    creator.createPreparedStatement(connection);
                    return List.of();
                });
        new ReplenishmentWorkspaceService(jdbc, "false", zones)
                .plan(new TenantContext(1L, 2L, 3L, List.of(3L), Set.of()), 21, false, false);
        var sql = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(connection).prepareStatement(sql.capture());
        assertTrue(sql.getValue().contains("BETWEEN period.today - 6 AND period.today"));
        assertTrue(sql.getValue().contains("BETWEEN period.today - 27 AND period.today"));
        assertTrue(sql.getValue().contains("BETWEEN period.today - 55 AND period.today - 28"));
    }

    @Test
    void workspaceExcludesNegativeStockWithVerifiedSalesFromDraftSuggestions() throws Exception {
        var jdbc = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var zones = mock(com.orithos.common.BusinessTimezoneService.class);
        var row = mock(java.sql.ResultSet.class);
        when(zones.zoneForVendor(1L)).thenReturn(java.time.ZoneId.of("Australia/Melbourne"));
        when(row.getString("name")).thenReturn("Milk");
        when(row.getObject("on_hand")).thenReturn(-2757d);
        when(row.getDouble("recent_units")).thenReturn(99d);
        when(row.getObject("supplier_id", Long.class)).thenReturn(7L);
        when(row.getObject("unit_cost")).thenReturn(2d);
        when(row.getTimestamp("inventory_updated_at")).thenReturn(java.sql.Timestamp.from(java.time.Instant.now()));
        when(jdbc.query(org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.PreparedStatementCreator.class),
                org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.RowMapper.class)))
                .thenAnswer(invocation -> {
                    org.springframework.jdbc.core.RowMapper<?> mapper = invocation.getArgument(1);
                    return List.of(mapper.mapRow(row, 0));
                });

        var plan = new ReplenishmentWorkspaceService(jdbc, "false", zones)
                .plan(new TenantContext(1L, 2L, 3L, List.of(3L), Set.of()), 21, false, true);
        var product = plan.products().getFirst();
        org.junit.jupiter.api.Assertions.assertEquals("REVIEW_DATA", product.recommendationStatus());
        org.junit.jupiter.api.Assertions.assertEquals(0d, product.suggestedQuantity());
        assertTrue(product.dataIssues().contains("NEGATIVE_STOCK"));
    }

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
                        new ReplenishmentWorkspaceView.SalesHistory("Australia/Melbourne", true, "SIGNED_NET_UNITS"),
                        0, java.util.Map.of(), java.time.Instant.now().toString(),
                        new ReplenishmentWorkspaceView.InventoryHistory("REVIEW", null, "Australia/Melbourne",
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