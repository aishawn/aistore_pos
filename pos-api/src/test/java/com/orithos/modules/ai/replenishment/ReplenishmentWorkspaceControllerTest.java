package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ReplenishmentWorkspaceControllerTest {

    @Test
    void snapshotGapsIncludeMissedDaysAfterTheLatestCapture() {
        var first = java.time.LocalDate.of(2026, 11, 20);
        assertEquals(2, ReplenishmentWorkspaceService.missingSnapshotDays(
                first, 1, java.time.LocalDate.of(2026, 11, 22)));
        assertEquals(0, ReplenishmentWorkspaceService.missingSnapshotDays(
                first, 3, java.time.LocalDate.of(2026, 11, 22)));
        assertEquals(0, ReplenishmentWorkspaceService.missingSnapshotDays(
                null, 0, java.time.LocalDate.of(2026, 11, 22)));
    }

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
        var plan = new ReplenishmentWorkspaceService(jdbc, "false", zones)
                .plan(new TenantContext(1L, 2L, 3L, List.of(3L), Set.of()), 21, false, false);
        var sql = org.mockito.ArgumentCaptor.forClass(String.class);
        org.mockito.Mockito.verify(connection).prepareStatement(sql.capture());
        assertTrue(sql.getValue().contains("BETWEEN period.today - 6 AND period.today"));
        assertTrue(sql.getValue().contains("BETWEEN period.today - 27 AND period.today"));
        assertTrue(sql.getValue().contains("BETWEEN period.today - 55 AND period.today - 28"));
        var history = plan.salesHistory();
        var today = java.time.LocalDate.now(java.time.ZoneId.of("Australia/Melbourne"));
        assertEquals("ORITHOS_COMPLETED_POS_SALES", history.source());
        assertEquals(today.minusDays(55), history.startDate());
        assertEquals(today.plusDays(1), history.endDateExclusive());
        assertEquals(false, history.completeDaysOnly());
    }

    @Test
    void inventoryHistoryReportsObservedDatesGapsAndPartialCaptures() throws Exception {
        var jdbc = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var zones = mock(com.orithos.common.BusinessTimezoneService.class);
        var connection = mock(java.sql.Connection.class);
        var statement = mock(java.sql.PreparedStatement.class);
        var today = java.time.LocalDate.now(java.time.ZoneId.of("Australia/Melbourne"));
        when(zones.zoneForVendor(1L)).thenReturn(java.time.ZoneId.of("Australia/Melbourne"));
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(jdbc.query(org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.PreparedStatementCreator.class),
                org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.RowMapper.class)))
                .thenAnswer(invocation -> {
                    org.springframework.jdbc.core.PreparedStatementCreator creator = invocation.getArgument(0);
                    creator.createPreparedStatement(connection);
                    return List.of();
                });
        when(jdbc.queryForList(anyString(), org.mockito.ArgumentMatchers.any(Object[].class)))
                .thenReturn(List.of(
                        java.util.Map.of("business_date", java.sql.Date.valueOf(today.minusDays(3)),
                                "expected_products", 10, "capture_status", "COMPLETE"),
                        java.util.Map.of("business_date", java.sql.Date.valueOf(today.minusDays(1)),
                                "expected_products", 10, "capture_status", "PARTIAL")));

        var plan = new ReplenishmentWorkspaceService(jdbc, "false", zones)
                .plan(new TenantContext(1L, 2L, 3L, List.of(3L), Set.of()), 21, false, false);

        var history = plan.inventoryHistory();
        org.junit.jupiter.api.Assertions.assertEquals(2, history.observedDays());
        org.junit.jupiter.api.Assertions.assertEquals(1, history.gapDays());
        org.junit.jupiter.api.Assertions.assertEquals(1, history.invalidSnapshots());
        org.junit.jupiter.api.Assertions.assertEquals(today.minusDays(3), history.firstBusinessDate());
        org.junit.jupiter.api.Assertions.assertEquals(today.minusDays(1), history.latestBusinessDate());
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
    void freshInventoryRowDoesNotHideAnotherStaleRow() throws Exception {
        var jdbc = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var zones = mock(com.orithos.common.BusinessTimezoneService.class);
        when(zones.zoneForVendor(1L)).thenReturn(java.time.ZoneId.of("Australia/Melbourne"));
        var fresh = inventoryRow(501L, java.time.Instant.now().minusSeconds(60));
        var stale = inventoryRow(502L, java.time.Instant.now().minusSeconds(27 * 60 * 60));
        when(jdbc.query(org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.PreparedStatementCreator.class),
                org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.RowMapper.class)))
                .thenAnswer(invocation -> {
                    org.springframework.jdbc.core.RowMapper<?> mapper = invocation.getArgument(1);
                    return List.of(mapper.mapRow(fresh, 0), mapper.mapRow(stale, 1));
                });

        var plan = new ReplenishmentWorkspaceService(jdbc, "false", zones)
                .plan(new TenantContext(1L, 2L, 3L, List.of(3L), Set.of()), 21, false, false);

        org.junit.jupiter.api.Assertions.assertEquals("REVIEW", plan.inventoryHistory().status());
        org.junit.jupiter.api.Assertions.assertEquals(1,
                plan.inventoryHistory().missingFields().get("staleInventory"));
        org.junit.jupiter.api.Assertions.assertEquals(1d, plan.inventoryHistory().productCoverage());
    }

    private static java.sql.ResultSet inventoryRow(long id, java.time.Instant updatedAt) throws Exception {
        var row = mock(java.sql.ResultSet.class);
        when(row.getLong("id")).thenReturn(id);
        when(row.getString("name")).thenReturn("Product " + id);
        when(row.getObject("on_hand")).thenReturn(0d);
        when(row.getTimestamp("inventory_updated_at")).thenReturn(java.sql.Timestamp.from(updatedAt));
        return row;
    }

    @Test
    void zeroDemandAndZeroStockAreNotPresentedAsReadyToOrderOrAnException() throws Exception {
        var readyToOrder = singleProductWorkspace(0d, 0d, false);
        var exceptions = singleProductWorkspace(0d, 0d, true);

        org.junit.jupiter.api.Assertions.assertTrue(readyToOrder.products().isEmpty());
        org.junit.jupiter.api.Assertions.assertTrue(exceptions.products().isEmpty());
    }

    @Test
    void zeroStockWithVerifiedDemandStillGetsAReplenishmentSuggestion() throws Exception {
        var plan = singleProductWorkspace(28d, 0d, false);

        var product = plan.products().getFirst();
        org.junit.jupiter.api.Assertions.assertEquals("READY", product.recommendationStatus());
        org.junit.jupiter.api.Assertions.assertTrue(product.suggestedQuantity() > 0);
    }

    @Test
    void zeroRecentSalesWithEarlierDemandRequiresReviewInsteadOfReusingOldVelocity() throws Exception {
        var readyToOrder = singleProductWorkspace(0d, 24d, false);
        var exceptions = singleProductWorkspace(0d, 24d, true);

        org.junit.jupiter.api.Assertions.assertEquals("REVIEW_DATA",
                readyToOrder.products().getFirst().recommendationStatus());
        org.junit.jupiter.api.Assertions.assertEquals(0d, readyToOrder.products().getFirst().suggestedQuantity());
        var product = exceptions.products().getFirst();
        org.junit.jupiter.api.Assertions.assertEquals("REVIEW_DATA", product.recommendationStatus());
        org.junit.jupiter.api.Assertions.assertEquals(0d, product.suggestedQuantity());
        assertTrue(product.dataIssues().contains("RECENT_DEMAND_GAP"));
        assertTrue(product.reason().contains("Confirm whether the item was out of stock or discontinued"));
    }

    private static ReplenishmentWorkspaceView singleProductWorkspace(
            double recentUnits, double previousUnits, boolean exceptionOnly) throws Exception {
        var jdbc = mock(org.springframework.jdbc.core.JdbcTemplate.class);
        var zones = mock(com.orithos.common.BusinessTimezoneService.class);
        var row = mock(java.sql.ResultSet.class);
        when(zones.zoneForVendor(1L)).thenReturn(java.time.ZoneId.of("Australia/Melbourne"));
        when(row.getLong("id")).thenReturn(501L);
        when(row.getString("name")).thenReturn("Test product");
        when(row.getString("sku")).thenReturn("TEST-501");
        when(row.getDouble("case_quantity")).thenReturn(6d);
        when(row.getObject("on_hand")).thenReturn(0d);
        when(row.getDouble("on_order")).thenReturn(0d);
        when(row.getTimestamp("inventory_updated_at"))
                .thenReturn(java.sql.Timestamp.from(java.time.Instant.now()));
        when(row.getDouble("sold_7d")).thenReturn(recentUnits / 4d);
        when(row.getDouble("recent_units")).thenReturn(recentUnits);
        when(row.getDouble("previous_units")).thenReturn(previousUnits);
        when(row.getObject("unit_cost")).thenReturn(2d);
        when(row.getObject("unit_price")).thenReturn(4d);
        when(row.getObject("supplier_id", Long.class)).thenReturn(7L);
        when(row.getString("supplier_name")).thenReturn("Test supplier");
        when(row.getLong("supplier_link_count")).thenReturn(1L);
        when(row.getDouble("minimum_order")).thenReturn(1d);
        when(jdbc.query(org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.PreparedStatementCreator.class),
                org.mockito.ArgumentMatchers.any(org.springframework.jdbc.core.RowMapper.class)))
                .thenAnswer(invocation -> {
                    org.springframework.jdbc.core.RowMapper<?> mapper = invocation.getArgument(1);
                    return List.of(mapper.mapRow(row, 0));
                });

        return new ReplenishmentWorkspaceService(jdbc, "false", zones)
                .plan(new TenantContext(1L, 2L, 3L, List.of(3L), Set.of()), 21, exceptionOnly, false);
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
                org.mockito.ArgumentMatchers.anyBoolean(), org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.anyBoolean()))
                .thenReturn(new ReplenishmentWorkspaceView(
                        "SKR", 56, 21, 21, List.of(),
                        false, 0, false,
                        new ReplenishmentWorkspaceView.SalesHistory("Australia/Melbourne", true,
                                "ORITHOS_COMPLETED_POS_SALES", java.time.LocalDate.now().minusDays(55),
                                java.time.LocalDate.now().plusDays(1), false, "SIGNED_NET_UNITS"),
                        0, java.util.Map.of(), java.time.Instant.now().toString(),
                        new ReplenishmentWorkspaceView.InventoryHistory("REVIEW", null, "Australia/Melbourne",
                                1, 1, 1d, null, null, null, java.util.Map.of(), null, null),
                        new ReplenishmentWorkspaceView.Forecast(false, "rules_v1_weighted_velocity", "UNAVAILABLE", null),
                        new ReplenishmentWorkspaceView.PurchaseWorkflow(true, "DRAFT_RFQ"),
                        new ReplenishmentWorkspaceView.CatalogueCoverage("COMPLETE", 0, 0, 0)));

        ReplenishmentWorkspaceController controller = new ReplenishmentWorkspaceController(
                service, tenantFactory, permissions, gate);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("host", "skr.orithos.com.au");
        var result = controller.plan(21, null, null, request);
        assertTrue(result.data().purchaseWorkflow().draftEnabled());
    }
}
