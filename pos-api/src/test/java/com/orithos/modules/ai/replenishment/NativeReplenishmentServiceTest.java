package com.orithos.modules.ai.replenishment;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.orithos.config.CorrelationIdContext;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class NativeReplenishmentServiceTest {

    @Test
    void springUsesJdbcConstructorWhenTestClockConstructorAlsoExists() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class));
            context.registerBean(BusinessTimezoneService.class, () -> mock(BusinessTimezoneService.class));
            context.register(NativeReplenishmentService.class);

            context.refresh();

            org.junit.jupiter.api.Assertions.assertNotNull(context.getBean(NativeReplenishmentService.class));
        }
    }

    @Test
    void isolatesCachedPlansByVendorOutletParametersAndExpiresThem() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenReturn(List.of());
        AtomicLong time = new AtomicLong(1_000);
        NativeReplenishmentService service = new NativeReplenishmentService(jdbc, time::get);
        TenantContext tenant = tenant(55L, 87L);

        ReplenishmentPlan cached = service.plan(tenant, 21, 3);
        assertSame(cached, service.plan(tenant, 21, 3));
        service.plan(tenant(56L, 87L), 21, 3);
        service.plan(tenant(55L, 88L), 21, 3);
        service.plan(tenant, 30, 3);
        service.plan(tenant, 21, 1);
        verify(jdbc, times(5)).query(any(PreparedStatementCreator.class), any(RowMapper.class));

        time.addAndGet(15_000);
        service.plan(tenant, 21, 3);
        verify(jdbc, times(6)).query(any(PreparedStatementCreator.class), any(RowMapper.class));
    }

    @Test
    void queryUsesFiveSecondJdbcTimeout() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        when(connection.prepareStatement(any(String.class))).thenReturn(statement);
        doAnswer(invocation -> {
            PreparedStatementCreator creator = invocation.getArgument(0);
            creator.createPreparedStatement(connection);
            return List.of();
        }).when(jdbc).query(any(PreparedStatementCreator.class), any(RowMapper.class));

        new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));

        verify(statement).setQueryTimeout(5);
        verify(statement).setString(2, "Australia/Melbourne");
        verify(statement).setLong(3, 87L);
        verify(statement).setString(4, "Australia/Melbourne");
        verify(statement).setLong(5, 87L);
        verify(statement).setLong(6, 87L);
    }

    @Test
    void queryKeepsSalesDateIndexableAndAggregatesSuppliersOnce() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        when(connection.prepareStatement(any(String.class))).thenReturn(statement);
        doAnswer(invocation -> {
            PreparedStatementCreator creator = invocation.getArgument(0);
            creator.createPreparedStatement(connection);
            return List.of();
        }).when(jdbc).query(any(PreparedStatementCreator.class), any(RowMapper.class));

        BusinessTimezoneService timezones = mock(BusinessTimezoneService.class);
        when(timezones.zoneForVendor(55L)).thenReturn(ZoneId.of("Australia/Adelaide"));
        long instant = Instant.parse("2026-11-22T13:45:00Z").toEpochMilli();
        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc, () -> instant, timezones)
                .plan(tenant(55L, 87L));
        assertEquals(java.time.LocalDate.parse("2026-09-29"), plan.periodFrom());
        assertEquals(java.time.LocalDate.parse("2026-11-23"), plan.periodTo());
        assertEquals("Australia/Adelaide", plan.timeZone());

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(connection).prepareStatement(sql.capture());
        assertTrue(sql.getValue().contains("s.business_date >="));
        assertTrue(sql.getValue().contains("period.today - 27"));
        assertTrue(sql.getValue().contains("period.today - 55"));
        assertTrue(sql.getValue().contains("<= period.today"));
        assertTrue(sql.getValue().contains("s.business_date IS NULL"));
        assertTrue(sql.getValue().contains("i.updated_at AS inventory_data_as_of"));
        assertTrue(sql.getValue().contains("GROUP BY ps.product_id, ps.outlet_id"));
        assertTrue(sql.getValue().contains("LEFT JOIN supplier"));
        assertFalse(sql.getValue().contains("EXISTS (SELECT 1 FROM product_supplier"));
        assertFalse(sql.getValue().contains("(SELECT MAX(ps.minimum_order_quantity)"));
        verify(statement).setObject(1, java.time.LocalDate.parse("2026-11-23"));
        verify(statement).setString(2, "Australia/Adelaide");
        verify(statement).setLong(3, 87L);
        verify(statement).setString(4, "Australia/Adelaide");
        verify(statement).setLong(5, 87L);
        verify(statement).setLong(6, 87L);
    }

    @Test
    void permissionIsCheckedBeforeCacheOrDatabaseAccess() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        NativeReplenishmentService service = new NativeReplenishmentService(jdbc);
        TenantContext tenant = new TenantContext(55L, 7L, 87L, List.of(87L), Set.of());

        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> service.plan(tenant));
        verifyNoInteractions(jdbc);
    }

    @Test
    void queryFailureLogsCorrelationAndCategoryWithoutExceptionDetails() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class)))
                .thenThrow(new DataAccessResourceFailureException("jdbc-secret-host"));
        NativeReplenishmentService service = new NativeReplenishmentService(jdbc);
        CapturedLogs captured = captureLogs();
        try {
            CorrelationIdContext.with("a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d", () -> {
                assertThrows(DataAccessResourceFailureException.class, () -> service.plan(tenant(55L, 87L)));
                return null;
            });

            String message = captured.appender().list.getLast().getFormattedMessage();
            assertTrue(message.contains("correlationId=a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d"), message);
            assertTrue(message.contains("category=data_access"), message);
            assertTrue(message.contains("elapsedMs="), message);
            assertTrue(message.contains("exceptionType=DataAccessResourceFailureException"), message);
            assertFalse(message.contains("jdbc-secret-host"), message);
        } finally {
            releaseLogs(captured);
        }
    }

    @Test
    void completedPlanLogsGapCountButNotProductNames() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet inventoryMissing = replenishmentRow(5L, "Private Shiraz", null, true);
        ResultSet supplierMissing = replenishmentRow(6L, "Private Beer", 4d, false);
        when(supplierMissing.getDouble("recent_units")).thenReturn(28d);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(inventoryMissing, 0), mapper.mapRow(supplierMissing, 1));
        });
        CapturedLogs captured = captureLogs();
        try {
            new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));

            String message = captured.appender().list.getLast().getFormattedMessage();
            assertTrue(message.contains("dataGapCount=2"), message);
            assertTrue(message.contains("dataStatus=DATA_INCOMPLETE"), message);
            assertFalse(message.contains("Private Shiraz"), message);
            assertFalse(message.contains("Private Beer"), message);
        } finally {
            releaseLogs(captured);
        }
    }

    @Test
    void planUsesLatestSalesRowUpdateAndDoesNotInventATimestampForEmptyData() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenReturn(List.of());
        ReplenishmentPlan empty = new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));
        org.junit.jupiter.api.Assertions.assertNull(empty.dataAsOf());

        Instant updatedAt = Instant.parse("2026-11-12T07:30:00Z");
        ResultSet row = mock(ResultSet.class);
        try {
            when(row.getLong("id")).thenReturn(5L);
            when(row.getString("name")).thenReturn("Shiraz");
            when(row.getDouble("case_quantity")).thenReturn(6d);
            when(row.getObject("on_hand")).thenReturn(3d);
            when(row.getDouble("on_order")).thenReturn(0d);
            when(row.getDouble("recent_units")).thenReturn(0d);
            when(row.getDouble("previous_units")).thenReturn(0d);
            when(row.getBoolean("has_supplier")).thenReturn(true);
            when(row.getBoolean("has_recorded_cost")).thenReturn(true);
            when(row.getDouble("minimum_order")).thenReturn(1d);
            when(row.getTimestamp("sales_data_as_of")).thenReturn(Timestamp.from(updatedAt));
            when(row.getTimestamp("inventory_data_as_of")).thenReturn(Timestamp.from(updatedAt));
        } catch (java.sql.SQLException e) {
            throw new AssertionError(e);
        }
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc,
                () -> updatedAt.plusSeconds(60).toEpochMilli()).plan(tenant(55L, 87L));

        assertEquals(updatedAt, plan.dataAsOf());
    }

    @Test
    void missingSalesHistoryFailsClosedWithoutGeneratingQuantities() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet row = mock(ResultSet.class);
        try {
            when(row.getLong("id")).thenReturn(5L);
            when(row.getString("name")).thenReturn("Shiraz");
            when(row.getDouble("case_quantity")).thenReturn(6d);
            when(row.getObject("on_hand")).thenReturn(0d);
            when(row.getDouble("on_order")).thenReturn(0d);
            when(row.getDouble("recent_units")).thenReturn(0d);
            when(row.getDouble("previous_units")).thenReturn(0d);
            when(row.getBoolean("has_supplier")).thenReturn(true);
            when(row.getBoolean("has_recorded_cost")).thenReturn(true);
            when(row.getDouble("minimum_order")).thenReturn(1d);
            when(row.getTimestamp("sales_data_as_of")).thenReturn(null);
        } catch (java.sql.SQLException e) {
            throw new AssertionError(e);
        }
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));

        assertEquals("NO_DATA", plan.dataQualityStatus());
        assertEquals(1, plan.dataGapCount());
        assertEquals(List.of(), plan.top());
        assertEquals(0, plan.itemsNeedingOrder());
    }

    @Test
    void ignoresMissingSuppliersForProductsWithoutAReorderNeed() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet stocked = replenishmentRow(5L, "Stocked beer", 10000d, false);
        when(stocked.getDouble("recent_units")).thenReturn(28d);
        ResultSet noDemand = replenishmentRow(6L, "No recent demand", 0d, false);
        when(noDemand.getDouble("recent_units")).thenReturn(0d);
        when(noDemand.getDouble("previous_units")).thenReturn(0d);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(stocked, 0), mapper.mapRow(noDemand, 1));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));

        assertEquals("VALID", plan.dataQualityStatus());
        assertEquals(0, plan.supplierGapCount());
        assertEquals(0, plan.itemsNeedingOrder());
    }

    @Test
    void reportsInventoryAndSupplierGapsSeparately() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet inventoryMissing = replenishmentRow(5L, "Shiraz", null, true);
        ResultSet supplierMissing = replenishmentRow(6L, "Beer", 4d, false);
        when(supplierMissing.getDouble("recent_units")).thenReturn(28d);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(inventoryMissing, 0), mapper.mapRow(supplierMissing, 1));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));

        assertEquals(2, plan.dataGapCount());
        assertEquals(1, plan.inventoryGapCount());
        assertEquals(1, plan.supplierGapCount());
    }

    @Test
    void missingInventoryTimestampMarksPlanIncompleteAndSkipsProduct() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet row = replenishmentRow(5L, "Shiraz", 3d, true);
        when(row.getTimestamp("inventory_data_as_of")).thenReturn(null);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));

        assertEquals("DATA_INCOMPLETE", plan.dataQualityStatus());
        assertEquals(1, plan.dataGapCount());
        assertEquals(1, plan.inventoryGapCount());
        assertTrue(plan.dataGaps().get(0).contains("inventory timestamp unavailable"));
        assertTrue(plan.top().isEmpty());
    }

    @Test
    void staleInventoryTimestampMarksPlanIncompleteAndSkipsProduct() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Instant now = Instant.parse("2026-11-13T12:00:00Z");
        ResultSet row = replenishmentRow(5L, "Shiraz", 3d, true);
        when(row.getTimestamp("inventory_data_as_of"))
                .thenReturn(Timestamp.from(now.minusSeconds(24 * 60 * 60 + 1)));
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc, now::toEpochMilli)
                .plan(tenant(55L, 87L));

        assertEquals("DATA_INCOMPLETE", plan.dataQualityStatus());
        assertEquals(1, plan.inventoryGapCount());
        assertTrue(plan.dataGaps().get(0).contains("inventory data stale"));
        assertTrue(plan.top().isEmpty());
    }

    @Test
    void inventoryTimestampAtTheTwentyFourHourCutoffIsStillFresh() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Instant now = Instant.parse("2026-11-13T12:00:00Z");
        ResultSet row = replenishmentRow(5L, "Shiraz", 3d, true);
        when(row.getTimestamp("inventory_data_as_of")).thenReturn(Timestamp.from(now.minusSeconds(24 * 60 * 60)));
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc, now::toEpochMilli)
                .plan(tenant(55L, 87L));

        assertEquals("VALID", plan.dataQualityStatus());
        assertEquals(0, plan.inventoryGapCount());
    }

    @Test
    void futureInventoryTimestampMarksPlanIncompleteAndSkipsProduct() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        Instant now = Instant.parse("2026-11-13T12:00:00Z");
        ResultSet row = replenishmentRow(5L, "Shiraz", 3d, true);
        when(row.getTimestamp("inventory_data_as_of")).thenReturn(Timestamp.from(now.plusMillis(1)));
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc, now::toEpochMilli)
                .plan(tenant(55L, 87L));

        assertEquals("DATA_INCOMPLETE", plan.dataQualityStatus());
        assertEquals(1, plan.inventoryGapCount());
        assertTrue(plan.dataGaps().get(0).contains("inventory data stale"));
        assertTrue(plan.top().isEmpty());
    }

    @Test
    void ranksImmediateShelfStockoutAheadOfLargeOrdersAndIgnoresUndatedArrivalsForShelfCover() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet urgent = replenishmentRow(5L, "Shiraz", 0d, true);
        ResultSet largeOrder = replenishmentRow(6L, "Beer", 30d, true);
        when(urgent.getDouble("recent_units")).thenReturn(28d);
        when(urgent.getDouble("on_order")).thenReturn(6d);
        when(largeOrder.getDouble("recent_units")).thenReturn(280d);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(largeOrder, 0), mapper.mapRow(urgent, 1));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));

        assertEquals(List.of(5L, 6L), plan.top().stream().map(ReplenishmentSuggestion::productId).toList());
        assertEquals(0d, plan.top().getFirst().daysOfStock());
        assertEquals(6d, plan.top().getFirst().forecastAvailable());
        assertEquals(18d, plan.top().getFirst().suggestedQuantity());
    }

    @Test
    void negativeOnHandRequiresStockReviewEvenWhenThereAreRecentSales() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet noDemand = replenishmentRow(5L, "Shiraz", -13d, true);
        ResultSet sold = replenishmentRow(6L, "Beer", -1d, true);
        when(sold.getDouble("recent_units")).thenReturn(28d);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(noDemand, 0), mapper.mapRow(sold, 1));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));

        assertTrue(plan.top().isEmpty());
        assertEquals(0, plan.itemsNeedingOrder());
        assertEquals(2, plan.inventoryGapCount());
        assertTrue(plan.dataGaps().stream().anyMatch(gap -> gap.contains("stock reconciliation")));
    }

    @Test
    void flagsReorderCandidateWhenRecordedCostIsMissing() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ResultSet row = replenishmentRow(5L, "Shiraz", 0d, true);
        when(row.getDouble("recent_units")).thenReturn(28d);
        when(row.getBoolean("has_recorded_cost")).thenReturn(false);
        when(jdbc.query(any(PreparedStatementCreator.class), any(RowMapper.class))).thenAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        });

        ReplenishmentPlan plan = new NativeReplenishmentService(jdbc).plan(tenant(55L, 87L));

        assertEquals(0, plan.itemsNeedingOrder());
        assertEquals(1, plan.dataGapCount());
        assertEquals(0, plan.inventoryGapCount());
        assertEquals(0, plan.supplierGapCount());
        assertEquals(1, plan.costGapCount());
        assertTrue(plan.dataGaps().getFirst().contains("cost"));
    }

    private static ResultSet replenishmentRow(long id, String name, Double onHand, boolean supplier)
            throws Exception {
        ResultSet row = mock(ResultSet.class);
        when(row.getLong("id")).thenReturn(id);
        when(row.getString("name")).thenReturn(name);
        when(row.getDouble("case_quantity")).thenReturn(6d);
        when(row.getObject("on_hand")).thenReturn(onHand);
        when(row.getDouble("on_order")).thenReturn(0d);
        when(row.getDouble("recent_units")).thenReturn(0d);
        when(row.getDouble("previous_units")).thenReturn(0d);
        when(row.getBoolean("has_supplier")).thenReturn(supplier);
        when(row.getBoolean("has_recorded_cost")).thenReturn(true);
        when(row.getDouble("minimum_order")).thenReturn(1d);
        when(row.getTimestamp("sales_data_as_of")).thenReturn(Timestamp.from(Instant.parse("2026-11-12T07:30:00Z")));
        when(row.getTimestamp("inventory_data_as_of")).thenReturn(Timestamp.from(Instant.now()));
        return row;
    }

    private static TenantContext tenant(long vendorId, long outletId) {
        return new TenantContext(vendorId, 7L, outletId, List.of(outletId), Set.of(TenantContext.PERM_QUERY));
    }

    private static CapturedLogs captureLogs() {
        Logger logger = (Logger) LoggerFactory.getLogger(NativeReplenishmentService.class);
        Level previousLevel = logger.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        logger.setLevel(Level.INFO);
        return new CapturedLogs(appender, previousLevel);
    }

    private static void releaseLogs(CapturedLogs captured) {
        Logger logger = (Logger) LoggerFactory.getLogger(NativeReplenishmentService.class);
        logger.detachAppender(captured.appender());
        logger.setLevel(captured.previousLevel());
        captured.appender().stop();
    }

    private record CapturedLogs(ListAppender<ILoggingEvent> appender, Level previousLevel) { }
}
