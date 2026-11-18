package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mockito.ArgumentCaptor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.lang.reflect.Constructor;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ShopfrontIntegrationControllerTest {

    @Test
    void registersOnlyCompleteUniqueIdBarcodeSnapshotAndReturnsStableFingerprint() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT company_id, outlet_id, enabled FROM shopfront_store_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("company_id", 55L, "outlet_id", 87L, "enabled", true)));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        String payload = """
                {"store_key":"skr","snapshot_complete":true,"expected_count":2,
                 "source_ids":["p-1","p-2"],"products":[
                   {"source_id":"p-1","barcodes":["93001"]},
                   {"source_id":"p-2","barcodes":["93002"]}]}
                """;

        var first = controller.registerProductBarcodeSnapshot("token", new ObjectMapper().readTree(payload));
        var second = controller.registerProductBarcodeSnapshot("token", new ObjectMapper().readTree(payload));

        assertEquals("REGISTERED", first.data().get("status"));
        assertEquals(2, first.data().get("source_count"));
        assertEquals(2, first.data().get("barcode_count"));
        assertEquals(first.data().get("fingerprint"), second.data().get("fingerprint"));
        verify(jdbc, times(2)).update(contains("INSERT INTO shopfront_product_barcode_snapshot"), any(Object[].class));
    }

    @Test
    void rejectsBarcodeSnapshotWithMissingPerProductBarcodeFieldBeforeWriting() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);

        var error = assertThrows(ResponseStatusException.class, () -> controller.registerProductBarcodeSnapshot(
                "token", new ObjectMapper().readTree("""
                        {"store_key":"skr","snapshot_complete":true,"expected_count":1,
                         "source_ids":["p-1"],"products":[{"source_id":"p-1"}]}
                        """)));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(jdbc, never()).update(contains("INSERT INTO shopfront_product_barcode_snapshot"), any(Object[].class));
    }

    @Test
    void clearsOnlyExplicitUnverifiedProductCostsAndWritesAudit() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT outlet_id, enabled FROM shopfront_store_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("outlet_id", 87L, "enabled", true)));
        when(jdbc.queryForList(contains("SELECT m.source_product_id, m.pos_product_id, p.cost"), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "source_product_id", "sf-product-1",
                        "pos_product_id", 23L,
                        "cost", new BigDecimal("12.3400"),
                        "shopfront_catalog_confirmed", false)));
        when(jdbc.update(contains("UPDATE product"), any(Object[].class))).thenReturn(1);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        var response = controller.clearUnverifiedProductCosts("token", new ObjectMapper().readTree("""
                {"store_key":"skr","items":[{"source_id":"sf-product-1","expected_cost":12.34}]}
                """));

        assertEquals(1, response.data().get("updated"));
        assertEquals(0, response.data().get("history_rows_changed"));
        ArgumentCaptor<Object[]> updateArgs = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(contains("UPDATE product"), updateArgs.capture());
        assertEquals(List.of(23L, 87L), List.of(updateArgs.getValue()[0], updateArgs.getValue()[1]));
        assertEquals(0, ((BigDecimal) updateArgs.getValue()[2]).compareTo(new BigDecimal("12.34")));
        ArgumentCaptor<Object[]> auditArgs = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(contains("INSERT INTO shopfront_product_cost_audit"), auditArgs.capture());
        assertEquals(List.of("skr", 87L, "sf-product-1", 23L), List.of(
                auditArgs.getValue()[0], auditArgs.getValue()[1], auditArgs.getValue()[2], auditArgs.getValue()[3]));
        assertEquals(0, ((BigDecimal) auditArgs.getValue()[4]).compareTo(new BigDecimal("12.34")));
        verify(jdbc, never()).update(contains("UPDATE sale_item"), any(Object[].class));
    }

    @Test
    void refusesToClearCostForCatalogConfirmedProduct() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT outlet_id, enabled FROM shopfront_store_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("outlet_id", 87L, "enabled", true)));
        when(jdbc.queryForList(contains("SELECT m.source_product_id, m.pos_product_id, p.cost"), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "source_product_id", "sf-product-1",
                        "pos_product_id", 23L,
                        "cost", new BigDecimal("12.3400"),
                        "shopfront_catalog_confirmed", true)));

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        var error = assertThrows(ResponseStatusException.class, () -> controller.clearUnverifiedProductCosts(
                "token", new ObjectMapper().readTree("""
                        {"store_key":"skr","items":[{"source_id":"sf-product-1","expected_cost":12.34}]}
                        """)));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(jdbc, never()).update(contains("UPDATE product"), any(Object[].class));
        verify(jdbc, never()).update(contains("INSERT INTO shopfront_product_cost_audit"), any(Object[].class));
    }

    @Test
    void linksOnlyCustomerIdForExistingMappedShopfrontSales() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForList(contains("SELECT outlet_id FROM shopfront_store_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("outlet_id", 87L)));
        when(jdbc.query(contains("SELECT DISTINCT customer_id FROM shopfront_customer_mapping"),
                any(org.springframework.jdbc.core.RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(321L));
        when(jdbc.update(contains("UPDATE sale SET customer_id=?"), any(Object[].class))).thenReturn(1);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        var response = controller.linkSaleCustomers("token", new ObjectMapper().readTree("""
                {"store_key":"skr","items":[{"external_id":"sale-1","customer_reference":"customer-1"}]}
                """));

        assertEquals(1, response.data().get("updated"));
        verify(jdbc).update(contains("UPDATE sale SET customer_id=?"), eq(321L), eq(87L), eq("sale-1"), eq(321L));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("DELETE FROM sale_item"), any(Object[].class));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("DELETE FROM sale_payment"), any(Object[].class));
    }

    @Test
    void postgresMappingTableUsesBooleanEnabledColumn() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        Method ensureMappingTable = ShopfrontIntegrationController.class.getDeclaredMethod("ensureMappingTable");
        ensureMappingTable.setAccessible(true);

        ensureMappingTable.invoke(controller);

        verify(jdbc).update(contains("enabled BOOLEAN NOT NULL DEFAULT TRUE"));
        verify(jdbc, never()).update(contains("enabled SMALLINT NOT NULL DEFAULT 1"));
    }

    @Test
    void purchaseReportSnapshotUpsertAttestsMatchingStoredContent() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForList(contains("SELECT outlet_id FROM shopfront_store_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("outlet_id", 87L)));
        when(jdbc.queryForObject(contains("SELECT rows_json FROM shopfront_purchase_report_snapshot"),
                eq(String.class), any(Object[].class))).thenReturn("[{\"Name\":\"Supplier A\",\"Orders\":1,\"Total Cost\":12.3}]");
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        JsonNode body = new ObjectMapper().readTree("""
                {"store_key":"skr","business_date":"2026-11-14","group_by":"supplier",
                 "fetched_at":"2026-11-14T17:00:00Z","rows":[{"Name":"Supplier A","Orders":1,"Total Cost":12.30}]}
                """);

        var response = controller.purchaseReportSnapshots("token", body);

        assertEquals("IMPORTED", response.data().get("status"));
        assertEquals(1, response.data().get("item_count"));
        assertEquals(1, response.data().get("readback_count"));
        assertEquals(true, response.data().get("readback_match"));
        assertEquals(0, response.data().get("readback_mismatch_count"));
        verify(jdbc).update(contains("ON CONFLICT (store_key, outlet_id, business_date, group_by)"),
                any(Object[].class));
        verify(jdbc).queryForList(contains("SELECT outlet_id FROM shopfront_store_mapping"), any(Object[].class));
    }

    @Test
    void purchaseReportSnapshotRejectsSameCountWithDifferentStoredContent() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForList(contains("SELECT outlet_id FROM shopfront_store_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("outlet_id", 87L)));
        when(jdbc.queryForObject(contains("SELECT rows_json FROM shopfront_purchase_report_snapshot"),
                eq(String.class), any(Object[].class))).thenReturn("[{\"Name\":\"Different supplier\",\"Orders\":1}]");
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        JsonNode body = new ObjectMapper().readTree("""
                {"store_key":"skr","business_date":"2026-11-14","group_by":"supplier",
                 "fetched_at":"2026-11-14T17:00:00Z","rows":[{"Name":"Supplier A","Orders":1}]}
                """);

        var response = controller.purchaseReportSnapshots("token", body);

        assertEquals(1, response.data().get("item_count"));
        assertEquals(1, response.data().get("readback_count"));
        assertEquals(false, response.data().get("readback_match"));
        assertEquals(1, response.data().get("readback_mismatch_count"));
    }

    @Test
    void catalogReconciliationUnconfirmsOnlyProductsAbsentFromVerifiedSnapshot() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT company_id, outlet_id, enabled FROM shopfront_store_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("company_id", 55L, "outlet_id", 87L, "enabled", true)));
        when(jdbc.queryForObject(contains("COUNT(DISTINCT m.source_product_id)"), eq(Long.class), any(Object[].class)))
                .thenReturn(2L);
        when(jdbc.update(contains("UPDATE product p SET shopfront_catalog_confirmed=TRUE"), any(Object[].class)))
                .thenReturn(2);
        when(jdbc.update(contains("UPDATE product p SET shopfront_catalog_confirmed=FALSE,cost=NULL"), any(Object[].class)))
                .thenReturn(641);
        when(jdbc.queryForObject(contains("COUNT(DISTINCT m.pos_product_id)"), eq(Long.class), any(Object[].class)))
                .thenReturn(2L, 641L, 641L);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        var response = controller.reconcileProductCatalog("token", new ObjectMapper().readTree("""
                {"store_key":"skr","snapshot_complete":true,"expected_count":2,"source_ids":["p-1","p-2"]}
                """));

        assertEquals(2, response.data().get("source_count"));
        assertEquals(2L, response.data().get("mapped_count"));
        assertEquals(2, response.data().get("confirmed_count"));
        assertEquals(2L, response.data().get("confirmed_total_count"));
        assertEquals(641, response.data().get("unconfirmed_count"));
        assertEquals(641L, response.data().get("unconfirmed_total_count"));
        assertEquals(641L, response.data().get("outside_snapshot_count"));
        assertEquals("RECONCILED", response.data().get("status"));
        verify(jdbc).update(contains("SET shopfront_catalog_confirmed=TRUE"), any(Object[].class));
        verify(jdbc).update(contains("SET shopfront_catalog_confirmed=FALSE,cost=NULL"), any(Object[].class));
    }

    @Test
    void catalogReconciliationRejectsConfirmedIdsOutsideSnapshotBeforeChangingProducts() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);

        var error = assertThrows(ResponseStatusException.class, () -> controller.reconcileProductCatalog(
                "token", new ObjectMapper().readTree("""
                        {"store_key":"skr","snapshot_complete":true,"expected_count":1,
                         "source_ids":["p-1"],"confirmed_source_ids":["p-2"]}
                        """)));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void catalogReconciliationRejectsIncompleteSnapshotBeforeChangingProducts() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);

        var error = assertThrows(ResponseStatusException.class, () -> controller.reconcileProductCatalog(
                "token", new ObjectMapper().readTree("""
                        {"store_key":"skr","snapshot_complete":false,"expected_count":1,"source_ids":["p-1"]}
                        """)));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(jdbc, never()).update(contains("shopfront_catalog_confirmed=FALSE"), any(Object[].class));
    }

    @Test
    void reservesStableNamesForDuplicateShopfrontProducts() {
        Map<String, Long> reserved = new java.util.LinkedHashMap<>();

        String first = ShopfrontIntegrationController.reserveUniqueProductName("Duplicate", "source-1", 101L, reserved);
        String second = ShopfrontIntegrationController.reserveUniqueProductName("Duplicate", "source-2", 102L, reserved);
        String replay = ShopfrontIntegrationController.reserveUniqueProductName("Duplicate", "source-2", 102L, reserved);

        assertEquals("Duplicate", first);
        assertEquals("Duplicate [source-2]", second);
        assertEquals(second, replay);
    }

    @Test
    void releasesExistingProductNamesBeforeApplyingBatchNames() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        var updatesField = batchType.getDeclaredField("productUpdates");
        updatesField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<Long, Object[]> updates = (Map<Long, Object[]>) updatesField.get(batch);
        updates.put(101L, new Object[]{"Duplicate", null, null, null, null, null, null, null, null, true,
                null, null, false, true, null, true, false, false, false, false, false, null, null, null, "[]", null, 48L, 101L});
        updates.put(102L, new Object[]{"Duplicate [source-2]", null, null, null, null, null, null, null, null, true,
                null, null, false, true, null, true, false, false, false, false, false, null, null, null, "[]", null, 48L, 102L});
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod("flushBusinessProductBatch", batchType, long.class, String.class);
        flush.setAccessible(true);

        flush.invoke(controller, batch, 48L, "skr");

        org.mockito.InOrder order = org.mockito.Mockito.inOrder(jdbc);
        order.verify(jdbc).batchUpdate(contains("UPDATE product SET name=? WHERE outlet_id=? AND id=?"), any(List.class));
        order.verify(jdbc).batchUpdate(contains("UPDATE product SET name=?,type=?"), any(List.class));
        verify(jdbc).batchUpdate(contains("cost=CASE WHEN ? THEN ? ELSE NULL END"), any(List.class));
    }

    @Test
    void productImportCarriesCatalogConfirmationIntoBatchUpdate() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT id FROM tax_rate"), eq(Long.class), any(Object[].class)))
                .thenReturn(List.of(7L));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method upsert = ShopfrontIntegrationController.class.getDeclaredMethod(
                "upsertBusinessProduct", JsonNode.class, String.class, long.class, Map.class,
                Long.class, batchType);
        upsert.setAccessible(true);

        upsert.invoke(controller, new ObjectMapper().readTree("""
                {"source_id":"current-1","name":"Current item","sku":"123456","catalog_confirmed":true,
                 "cost_authority":"catalog_verified","cost_contract":"case-and-unit-cost-v1",
                 "cost":43.5258,"case_cost":522.31,"case_quantity":12,
                 "source_updated_at":"2026-10-29T13:19:56+08:00"}
                """), "skr", 87L, new java.util.HashMap<>(), 123L, batch);

        var updatesField = batchType.getDeclaredField("productUpdates");
        updatesField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<Long, Object[]> updates = (Map<Long, Object[]>) updatesField.get(batch);
        assertEquals(Boolean.TRUE, updates.get(123L)[15]);
        assertEquals("2026-10-29T13:19:56+08:00", updates.get(123L)[16]);
        assertEquals(Boolean.TRUE, updates.get(123L)[9]);
        assertEquals(new java.math.BigDecimal("43.5258"), updates.get(123L)[10]);
        assertEquals(Boolean.TRUE, updates.get(123L)[11]);
        assertEquals(new java.math.BigDecimal("522.31"), updates.get(123L)[12]);
        assertEquals(123456, updates.get(123L)[27]);

        upsert.invoke(controller, new ObjectMapper().readTree("""
                {"source_id":"historical-1","name":"Historical item"}
                """), "skr", 87L, new java.util.HashMap<>(), 124L, batch);
        assertEquals(Boolean.FALSE, updates.get(124L)[15]);
    }

    @Test
    void matchStatusAggregatesProductAndSaleItemCounts() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> controller.matchStatus("token", "demo"));
        assertEquals(HttpStatus.GONE, failure.getStatusCode());
        verify(jdbc, never()).update(anyString());
    }

    @Test
    void mirrorCopyIsRetired() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> controller.copyShopfrontMirror("token", new ObjectMapper().readTree(
                        "{\"source_store_key\":\"skr\",\"target_store_key\":\"demo\"}")));
        assertEquals(HttpStatus.GONE, failure.getStatusCode());
        verify(jdbc, never()).update(anyString());
    }

    @Test
    void nativeProductDataUsesExistingMdbIdColumnForSkuField() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("shopfront_store_mapping"), eq("skr")))
                .thenReturn(List.of(Map.of("outlet_id", 48L, "shopfront_outlet", "skr", "enabled", true)));
        when(jdbc.queryForObject(contains("COUNT(*)"), eq(Integer.class), any(Object[].class))).thenReturn(0);
        when(jdbc.queryForList(contains("SELECT m.source_product_id AS source_id"), any(Object[].class)))
                .thenReturn(List.of());
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);

        controller.nativeData("token", "skr", "products", 1, 2500);

        verify(jdbc).queryForList(contains("p.mdb_id AS sku"), any(Object[].class));
        verify(jdbc).queryForList(contains("p.cost,p.case_cost"), any(Object[].class));
        verify(jdbc).queryForList(contains("p.case_quantity,p.tax_rate_id"), any(Object[].class));
        verify(jdbc).queryForList(contains("p.shopfront_catalog_confirmed AS catalog_confirmed"), any(Object[].class));
        verify(jdbc).queryForList(contains("cost_tax.name AS cost_tax_rate_name"), any(Object[].class));
        verify(jdbc).queryForList(contains("p.updated_at AS pos_updated_at"), any(Object[].class));
        verify(jdbc).queryForList(contains("p.cost_percentage"), any(Object[].class));
        verify(jdbc).queryForList(contains("p.shopfront_source_updated_at AS source_updated_at"), any(Object[].class));
        verify(jdbc, never()).queryForList(contains("p.sku"), any(Object[].class));
    }

    @Test
    void nativeDataRejectsPageSizesAboveReconciliationLimit() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);

        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> controller.nativeData("token", "skr", "products", 1, 2501));

        assertEquals(HttpStatus.BAD_REQUEST, failure.getStatusCode());
        verify(jdbc, never()).queryForList(anyString(), any(Object[].class));
    }

    @Test
    void nativeSaleItemDataReturnsStableSourceLineIdentityAndAmounts() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("shopfront_store_mapping"), eq("skr")))
                .thenReturn(List.of(Map.of("outlet_id", 48L, "shopfront_outlet", "skr", "enabled", true)));
        when(jdbc.queryForObject(contains("COUNT(*)"), eq(Integer.class), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForList(contains("FROM sale_item si JOIN sale s"), any(Object[].class)))
                .thenReturn(List.of(new java.util.HashMap<>(Map.of(
                        "external_sale_id", "sale-1", "external_line_id", "line-1",
                        "source_product_id", "product-1", "quantity", new BigDecimal("2.0000"),
                        "base_price", new BigDecimal("6.0000"), "total_price", new BigDecimal("12.00"),
                        "cost", new BigDecimal("4.0000"), "tax", new BigDecimal("1.09")))));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);

        var result = controller.nativeData("token", "skr", "sale_items", 1, 100);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.data().get("data");
        assertEquals(1, rows.size());
        assertEquals("sale-1", rows.get(0).get("external_sale_id"));
        assertEquals("line-1", rows.get(0).get("external_line_id"));
        assertEquals("product-1", rows.get(0).get("source_product_id"));
        verify(jdbc).queryForList(contains("FROM sale_item si JOIN sale s"), any(Object[].class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void nativePurchaseOrderDataReturnsMappedHeadersAndLinesForTheRequestedOutlet() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("FROM shopfront_store_mapping"), eq("skr")))
                .thenReturn(List.of(Map.of("outlet_id", 48L, "shopfront_outlet", "skr", "enabled", true)));
        when(jdbc.queryForObject(contains("COUNT(*)"), eq(Integer.class), any(Object[].class))).thenReturn(1);
        when(jdbc.queryForList(contains("FROM shopfront_purchase_order_business_mapping m"), any(Object[].class)))
                .thenReturn(List.of(new java.util.HashMap<>(Map.of(
                        "source_id", "po-1", "purchase_order_id", 70L, "mapping_status", "MAPPED",
                        "status", "SENT", "order_date", "2026-11-12", "total_cost", new BigDecimal("24.00")))));
        when(jdbc.queryForList(contains("FROM order_product op"), any(Object[].class)))
                .thenReturn(List.of(new java.util.HashMap<>(Map.of(
                        "order_id", 70L, "source_product_id", "product-1", "ordered_quantity", new BigDecimal("2.5")))));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);

        var result = controller.nativeData("token", "skr", "purchase_orders", 1, 100);

        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.data().get("data");
        assertEquals(1, rows.size());
        assertEquals("po-1", rows.get(0).get("source_id"));
        assertEquals("MAPPED", rows.get(0).get("mapping_status"));
        assertEquals(1, ((List<?>) rows.get(0).get("items")).size());
        verify(jdbc).queryForList(contains("WHERE m.store_key=? AND m.outlet_id=?"), any(Object[].class));
    }

    @Test
    void productImportDoesNotPersistSourceMirrorRows() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("shopfront_store_mapping"), eq("skr")))
                .thenReturn(List.of(Map.of("company_id", "55", "outlet_id", "48", "enabled", true)));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, false);

        var result = controller.products("token", new ObjectMapper().createObjectNode()
                .put("store_key", "skr")
                .set("items", new ObjectMapper().readTree("[{\"source_id\":\"p-1\",\"raw_payload\":{\"large\":true}}]")));

        assertEquals(false, result.data().get("shadow_write"));
        assertEquals("crawler", result.data().get("source_of_truth"));
        verify(jdbc, never()).batchUpdate(contains("INSERT INTO shopfront_product"), any(List.class));
    }

    @Test
    void createsPostgresTaxRateWithSmallintDefaultFlag() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForObject(contains("INSERT INTO tax_rate"), eq(Long.class), any(Object[].class)))
                .thenReturn(12L);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method createTaxRate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "createTaxRate", String.class, long.class);
        createTaxRate.setAccessible(true);

        Long id = (Long) createTaxRate.invoke(controller, "GST", 87L);

        assertEquals(12L, id);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).queryForObject(contains("INSERT INTO tax_rate"), eq(Long.class), args.capture());
        assertEquals(Short.valueOf((short) 0), args.getValue()[2]);
    }

    @Test
    void stagingFailureDoesNotExposeDatabaseErrorDetails() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString())).thenThrow(new IllegalStateException("database password=secret"));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        var body = new ObjectMapper().readTree("{\"store_key\":\"test\",\"items\":[]}");

        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> controller.products("token", body));

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, failure.getStatusCode());
        assertTrue(failure.getReason() != null && failure.getReason().startsWith("Unable to stage Shopfront import"));
        assertTrue(failure.getReason().contains("IllegalStateException"));
        assertFalse(failure.getReason().contains("password=secret"));
        assertFalse(failure.getMessage().contains("password=secret"));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void batchesBusinessInventoryWritesWithoutChangingNegativeQuantity() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT m.source_product_id"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_product_id", "p1", "pos_product_id", 77L)));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importBusiness = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusiness", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class, boolean.class);
        importBusiness.setAccessible(true);

        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) importBusiness.invoke(controller, "inventory", "skr",
                Map.of("outlet_id", "87"), new ObjectMapper().readTree(
                        "[{\"source_id\":\"p1\",\"quantity\":-5.25}]"), false, false);

        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass((Class) List.class);
        verify(jdbc).batchUpdate(contains("INSERT INTO product_inventory"), rows.capture());
        assertEquals(1, rows.getValue().size());
        assertEquals(new BigDecimal("-5.25"), rows.getValue().get(0)[2]);
        assertEquals(1, result.get("updated"));
        assertEquals(0, result.get("skipped"));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("DELETE FROM product_inventory"), any(Object[].class));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void inventoryReplaceFlagDoesNotWipeBusinessLedgerBeforeUpsert() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT m.source_product_id"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_product_id", "p1", "pos_product_id", 77L)));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importBusiness = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusiness", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class, boolean.class);
        importBusiness.setAccessible(true);

        importBusiness.invoke(controller, "inventory", "skr",
                Map.of("outlet_id", "87"), new ObjectMapper().readTree(
                        "[{\"source_id\":\"p1\",\"quantity\":12}]"), true, false);

        verify(jdbc).batchUpdate(contains("INSERT INTO product_inventory"), any(List.class));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("DELETE FROM product_inventory"), any(Object[].class));
    }

    @Test
    void importsShopfrontSuppliersIdempotentlyWithinTheMappedTenantOutlet() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForObject(contains("SELECT vendor_id FROM outlet"), eq(Long.class), eq(87L)))
                .thenReturn(55L);
        when(jdbc.queryForList(contains("SELECT id,name,business_number FROM supplier"), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbc.queryForList(contains("shopfront_supplier_business_mapping"), any(Object[].class)))
                .thenReturn(List.of(), List.of(Map.of("supplier_id", 901L)));
        when(jdbc.queryForObject(contains("INSERT INTO supplier"), eq(Long.class), any(Object[].class)))
                .thenReturn(901L);
        when(jdbc.update(contains("UPDATE supplier SET"), any(Object[].class))).thenReturn(1);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importBusiness = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusiness", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class, boolean.class);
        importBusiness.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();
        var items = mapper.readTree("[{\"source_id\":\"shopfront-supplier-1\",\"name\":\"Supplier One\",\"business_number\":\"12 345 678 901\",\"status\":\"ACTIVE\",\"raw_payload\":{\"orderNotes\":\"Morning delivery\"}}]");

        @SuppressWarnings("unchecked")
        Map<String, Object> first = (Map<String, Object>) importBusiness.invoke(controller, "suppliers", "skr",
                Map.of("company_id", "55", "outlet_id", "87"), items, false, false);
        @SuppressWarnings("unchecked")
        Map<String, Object> replay = (Map<String, Object>) importBusiness.invoke(controller, "suppliers", "skr",
                Map.of("company_id", "55", "outlet_id", "87"), items, false, false);

        assertEquals(1, first.get("created"));
        assertEquals(0, first.get("skipped"));
        assertEquals(0, replay.get("created"));
        assertEquals(1, replay.get("updated"));
        assertEquals(0, replay.get("skipped"));
        verify(jdbc).queryForObject(contains("INSERT INTO supplier"), eq(Long.class), any(Object[].class));
        verify(jdbc).update(contains("UPDATE supplier SET"), any(Object[].class));
        verify(jdbc, org.mockito.Mockito.times(2)).update(contains("INSERT INTO shopfront_supplier_business_mapping"),
                eq("skr"), eq("shopfront-supplier-1"), eq(87L), eq(901L));
    }

    @Test
    void createsInactiveHistoricalProductMappingForRetiredPurchaseOrderItems() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForObject(contains("INSERT INTO product"), eq(Long.class), any(Object[].class)))
                .thenReturn(901L);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method createHistorical = ShopfrontIntegrationController.class.getDeclaredMethod(
                "createHistoricalPurchaseProduct", String.class, long.class,
                com.fasterxml.jackson.databind.JsonNode.class, Map.class);
        createHistorical.setAccessible(true);
        Map<String, Long> cache = new java.util.HashMap<>();
        var sourceItem = new ObjectMapper().readTree(
                "{\"id\":\"legacy-product-12345678\",\"name\":\"Retired snack\",\"caseQuantity\":12}");

        Long productId = (Long) createHistorical.invoke(controller, "skr", 87L, sourceItem, cache);

        assertEquals(901L, productId);
        assertEquals(901L, cache.get("legacy-product-12345678"));
        ArgumentCaptor<Object[]> productArgs = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).queryForObject(contains("INSERT INTO product"), eq(Long.class), productArgs.capture());
        assertEquals("Retired snack [Shopfront legacy legacy-product-12345678]", productArgs.getValue()[0]);
        assertEquals(new BigDecimal("12"), productArgs.getValue()[1]);
        verify(jdbc).update(contains("SHOPFRONT_HISTORICAL"), eq("skr"),
                eq("legacy-product-12345678"), eq(901L));
    }

    @Test
    void rejectsSupplierImportWhenStoreMappingCompanyDoesNotOwnOutlet() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("SELECT vendor_id FROM outlet"), eq(Long.class), eq(87L)))
                .thenReturn(55L);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importBusiness = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusiness", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class, boolean.class);
        importBusiness.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();

        InvocationTargetException failure = assertThrows(InvocationTargetException.class,
                () -> importBusiness.invoke(controller, "suppliers", "demo", Map.of("company_id", "56", "outlet_id", "87"),
                        mapper.readTree("[{\"source_id\":\"s1\",\"name\":\"Supplier\"}]"), false, false));

        assertEquals(IllegalArgumentException.class, failure.getCause().getClass());
        assertEquals("Shopfront supplier mapping does not match the outlet tenant", failure.getCause().getMessage());
    }

    @Test
    void importsShopfrontPurchaseOrdersIntoNativeOrdersWithoutCreatingInventoryMovements() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForObject(contains("SELECT vendor_id FROM outlet"), eq(Long.class), eq(87L)))
                .thenReturn(55L);
        when(jdbc.queryForList(contains("shopfront_supplier_business_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_id", "sf-supplier-1", "supplier_id", 701L)));
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_product_id", "sf-product-1", "pos_product_id", 801L)));
        when(jdbc.queryForList(contains("shopfront_purchase_order_business_mapping"), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbc.queryForObject(contains("INSERT INTO purchase_order"), eq(Long.class), any(Object[].class)))
                .thenReturn(901L);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importer = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusinessPurchaseOrders", String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class);
        importer.setAccessible(true);
        var items = new ObjectMapper().readTree("""
                [{"source_id":"sf-order-1","supplier_source_id":"sf-supplier-1","total_cost":"20.1234","raw_payload":{
                  "status":"RECEIVED","orderDate":"2026-10-02","invoiceNumber":"INV-1001",
                  "totalCost":20.12345678,"expectedTotal":20.12345678,"products":[{
                    "caseQuantity":1,"orderedQuantity":0,"receivedQuantity":-3,
                    "baseCost":10.12345678,"orderedCost":20.12345678,
                    "supplier":{"id":"sf-supplier-1"},"item":{"id":"sf-product-1","mdbId":"SKU-1"}
                  }]
                }}]
                """);

        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) importer.invoke(controller, "skr",
                Map.of("company_id", "55", "outlet_id", "87"), items);

        assertEquals(1, result.get("created"));
        assertEquals(0, result.get("updated"));
        org.mockito.ArgumentCaptor<Object[]> lineArgs = org.mockito.ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(contains("INSERT INTO order_product"), lineArgs.capture());
        assertEquals(BigDecimal.ZERO, lineArgs.getValue()[5]);
        assertEquals(new BigDecimal("-3"), lineArgs.getValue()[6]);
        assertEquals(new BigDecimal("10.12345678"), lineArgs.getValue()[7]);
        assertEquals(new BigDecimal("20.12345678"), lineArgs.getValue()[8]);
        org.mockito.ArgumentCaptor<Object[]> orderArgs = org.mockito.ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).queryForObject(contains("INSERT INTO purchase_order"), eq(Long.class), orderArgs.capture());
        assertEquals(new BigDecimal("20.1234"), orderArgs.getValue()[9]);
        assertEquals(new BigDecimal("20.12345678"), orderArgs.getValue()[10]);
        verify(jdbc, org.mockito.Mockito.never()).update(contains("inventory_movement"), any(Object[].class));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("product_inventory"), any(Object[].class));
    }

    @Test
    void sentShopfrontOrderWithZeroOrderedAndPositiveReceivedQuantityStaysSent() throws Exception {
        Method statusMethod = ShopfrontIntegrationController.class.getDeclaredMethod(
                "purchaseOrderStatus", com.fasterxml.jackson.databind.JsonNode.class,
                int.class, BigDecimal.class, BigDecimal.class, boolean.class);
        statusMethod.setAccessible(true);
        var raw = new ObjectMapper().readTree("{}");

        assertEquals("SENT", statusMethod.invoke(
                new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true),
                raw, 17, BigDecimal.ZERO, new BigDecimal("44"), false));
        assertEquals("SENT", statusMethod.invoke(
                new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true),
                raw, 17, BigDecimal.ZERO, new BigDecimal("44"), true));
        var explicitSent = new ObjectMapper().readTree("{\"status\":\"SENT\"}");
        assertEquals("SENT", statusMethod.invoke(
                new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true),
                explicitSent, 17, new BigDecimal("10"), new BigDecimal("4"), false));
    }

    @Test
    void importsEmptyZeroValueShopfrontOrderWithoutInventingSupplier() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForObject(contains("SELECT vendor_id FROM outlet"), eq(Long.class), eq(87L)))
                .thenReturn(55L);
        when(jdbc.queryForList(contains("shopfront_supplier_business_mapping"), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbc.queryForList(contains("shopfront_purchase_order_business_mapping"), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbc.queryForObject(contains("INSERT INTO purchase_order"), eq(Long.class), any(Object[].class)))
                .thenReturn(903L);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importer = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusinessPurchaseOrders", String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class);
        importer.setAccessible(true);
        var items = new ObjectMapper().readTree("""
                [{"source_id":"sf-empty-order","raw_payload":{
                  "status":"CANCELLED","orderDate":"2026-11-10","totalCost":0,"expectedTotal":0,"products":[]
                }}]
                """);

        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) importer.invoke(controller, "skr",
                Map.of("company_id", "55", "outlet_id", "87"), items);

        assertEquals(1, result.get("created"));
        assertEquals(0, result.get("skipped"));
        org.mockito.ArgumentCaptor<Object[]> orderArgs = org.mockito.ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).queryForObject(contains("INSERT INTO purchase_order"), eq(Long.class), orderArgs.capture());
        assertEquals(null, orderArgs.getValue()[1]);
        verify(jdbc, org.mockito.Mockito.never()).update(contains("INSERT INTO order_product"), any(Object[].class));
    }

    @Test
    void purchaseOrderStatusOnlyChangeKeepsThePreviousSourceFingerprint() throws Exception {
        Method hashMethod = ShopfrontIntegrationController.class.getDeclaredMethod(
                "purchaseOrderHashWithStatus", com.fasterxml.jackson.databind.JsonNode.class,
                String.class, int.class, int.class);
        hashMethod.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();
        var before = mapper.readTree("{\"status\":null,\"totalCost\":20,\"products\":[]}");
        var after = mapper.readTree("{\"status\":\"SENT\",\"totalCost\":20,\"products\":[]}");
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), mapper, "token", true);

        assertEquals(hashMethod.invoke(controller, before, null, 0, 0),
                hashMethod.invoke(controller, after, null, 0, 0));
    }

    @Test
    void purchaseOrderImportKeepsMappedLinesWhenSiblingLineIsUnmapped() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForObject(contains("SELECT vendor_id FROM outlet"), eq(Long.class), eq(87L)))
                .thenReturn(55L);
        org.mockito.Mockito.lenient().when(jdbc.queryForList(anyString(), any(Object[].class))).thenAnswer(invocation -> {
            Object[] callArgs = invocation.getArguments();
            String sql = callArgs.length == 0 || callArgs[0] == null ? "" : callArgs[0].toString();
            if (sql.contains("shopfront_supplier_business_mapping")) {
                return List.of(Map.of("source_id", "sf-supplier-1", "supplier_id", 701L));
            }
            if (sql.contains("m.source_product_id, m.pos_product_id")) {
                return List.of(Map.of("source_product_id", "sf-product-mapped", "pos_product_id", 801L));
            }
            return List.of();
        });
        when(jdbc.queryForObject(contains("INSERT INTO purchase_order"), eq(Long.class), any(Object[].class)))
                .thenReturn(902L);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importer = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusinessPurchaseOrders", String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class);
        importer.setAccessible(true);
        var items = new ObjectMapper().readTree("""
                [{"source_id":"sf-order-partial","supplier_source_id":"sf-supplier-1","raw_payload":{
                  "status":"OPEN","orderDate":"2026-11-10","invoiceNumber":"PO-PARTIAL",
                  "totalCost":30,"expectedTotal":30,"products":[
                    {"caseQuantity":1,"orderedQuantity":1,"receivedQuantity":0,"baseCost":10,"orderedCost":10,
                     "supplier":{"id":"sf-supplier-1"},"item":{"id":"sf-product-mapped","mdbId":"SKU-1"}},
                    {"caseQuantity":1,"orderedQuantity":1,"receivedQuantity":0,"baseCost":20,"orderedCost":20,
                     "supplier":{"id":"sf-supplier-1"},"item":{"id":"sf-product-missing","mdbId":"SKU-2"}}
                  ]
                }}]
                """);

        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) importer.invoke(controller, "skr",
                Map.of("company_id", "55", "outlet_id", "87"), items);

        assertEquals(1, result.get("created"));
        assertEquals(0, result.get("skipped"));
        verify(jdbc).update(contains("INSERT INTO order_product"), any(Object[].class));
        verify(jdbc).update(contains("shopfront_purchase_order_business_mapping"),
                eq("skr"), eq("sf-order-partial"), eq(87L), eq(902L),
                argThat(hash -> String.valueOf(hash).length() == 64));
        assertTrue(((List<?>) result.get("errors")).stream()
                .anyMatch(error -> String.valueOf(error).contains("skipped unmapped product sf-product-missing")));
    }

    @Test
    void purchaseOrderImportSkipsWhenProductMissingFromPreloadedMappings() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForObject(contains("SELECT vendor_id FROM outlet"), eq(Long.class), eq(1L)))
                .thenReturn(1L);
        when(jdbc.queryForList(contains("shopfront_supplier_business_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_id", "sf-supplier-1", "supplier_id", 221L)));
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of());
        when(jdbc.queryForList(contains("shopfront_purchase_order_business_mapping"), any(Object[].class)))
                .thenReturn(List.of());

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importer = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusinessPurchaseOrders", String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class);
        importer.setAccessible(true);
        var items = new ObjectMapper().readTree("""
                [{"source_id":"sf-order-demo-1","supplier_source_id":"sf-supplier-1","raw_payload":{
                  "status":"OPEN","orderDate":"2026-11-10","invoiceNumber":"PO-1",
                  "totalCost":10,"expectedTotal":10,"products":[{
                    "caseQuantity":1,"orderedQuantity":1,"receivedQuantity":0,"baseCost":10,"orderedCost":10,
                    "supplier":{"id":"sf-supplier-1"},"item":{"id":"sf-product-1","mdbId":"SKU-1"}
                  }]
                }}]
                """);

        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) importer.invoke(controller, "demo",
                Map.of("company_id", "1", "outlet_id", "1"), items);

        assertEquals(0, result.get("created"));
        assertEquals(1, result.get("skipped"));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("BARCODE_LAZY"), any(Object[].class));
        verify(jdbc).update(contains("shopfront_purchase_order_business_mapping"),
                eq("demo"), eq("sf-order-demo-1"), eq(1L), eq(0L),
                argThat(hash -> String.valueOf(hash).length() == 64));
    }

    @Test
    void refusesPurchaseOrderPromotionFromPosMirror() {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        var error = assertThrows(ResponseStatusException.class,
                () -> controller.promotePurchaseOrders("token", new ObjectMapper().createObjectNode()));
        assertEquals(HttpStatus.GONE, error.getStatusCode());
    }

    @Test
    void refusesCloningProductMappingsThroughTheRetiredEndpoint() {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        var error = assertThrows(ResponseStatusException.class,
                () -> controller.cloneProductMappings("token", new ObjectMapper().createObjectNode()));
        assertEquals(HttpStatus.GONE, error.getStatusCode());
    }

    @Test
    void refusesPagingShopfrontProductMirrorFromPos() {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true);
        var error = assertThrows(ResponseStatusException.class,
                () -> controller.data("token", "skr", "products", 2, 500));
        assertEquals(HttpStatus.GONE, error.getStatusCode());
    }

    @ParameterizedTest
    @MethodSource("mappingFlags")
    void mappingFlagAcceptsOnlyKnownEnabledValues(Object flag, boolean expected) throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.update(anyString())).thenReturn(0);
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of("enabled", flag)));
        when(jdbc.queryForObject(contains("RETURNING id"), eq(Long.class), any(Object[].class)))
                .thenReturn(12L);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        var body = new ObjectMapper().readTree("{\"store_key\":\"test\",\"items\":[]}");
        var result = controller.products("token", body);

        assertEquals(expected, result.data().get("mapping_ready"));
        assertEquals(expected ? "IMPORTED" : "BLOCKED_MAPPING", result.data().get("status"));
    }

    @Test
    void businessProductImportAllowsUnpricedCatalogRowsAndDefaultsBlankTaxToGst() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("FROM tax_rate"), eq(Long.class), any(Object[].class)))
                .thenReturn(List.of(7L));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateProductBusinessFields", com.fasterxml.jackson.databind.JsonNode.class, long.class, Map.class);
        validate.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();
        // Missing case_quantity defaults to 1; blank tax defaults to GST.
        validate.invoke(controller, mapper.readTree(
                "{\"source_id\":\"p1\",\"name\":\"Product\",\"price\":5,\"tax_rate_name\":\"Including GST\",\"source_status\":\"ACTIVE\"}"),
                48L, new java.util.HashMap<>());
        validate.invoke(controller, mapper.readTree(
                "{\"source_id\":\"p2\",\"name\":\"Product\",\"case_quantity\":6,\"price\":5,\"source_status\":\"ACTIVE\"}"),
                48L, new java.util.HashMap<>());
        validate.invoke(controller, mapper.readTree(
                "{\"source_id\":\"p1\",\"name\":\"Product\",\"case_quantity\":6,\"tax_rate_name\":\"GST\",\"source_status\":\"ACTIVE\"}"),
                48L, new java.util.HashMap<>());
    }

    @Test
    void explicitNullProductTaxRatesMeanNoTaxWhileOmittedRatesKeepGstDefault() throws Exception {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        ObjectMapper mapper = new ObjectMapper();
        Method resolve = ShopfrontIntegrationController.class.getDeclaredMethod(
                "effectiveTaxRateName", com.fasterxml.jackson.databind.JsonNode.class, String.class);
        resolve.setAccessible(true);
        var noTaxProduct = mapper.readTree("""
                {"source_id":"no-tax","name":"Gift Card","case_quantity":1,
                 "tax_rate_name":null,"cost_tax_rate_name":null,"source_status":"ACTIVE"}
                """);

        assertNull(resolve.invoke(controller, noTaxProduct, "tax_rate_name"));
        assertNull(resolve.invoke(controller, noTaxProduct, "cost_tax_rate_name"));
        assertEquals("GST", resolve.invoke(controller, mapper.readTree("{}"), "tax_rate_name"));

        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateProductBusinessFields", com.fasterxml.jackson.databind.JsonNode.class, long.class, Map.class);
        validate.setAccessible(true);
        assertDoesNotThrow(() -> validate.invoke(controller, noTaxProduct, 48L, new java.util.HashMap<>()));
    }

    @Test
    void unpricedProductDoesNotCreateAFreeCataloguePrice() throws Exception {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductPrices", long.class, com.fasterxml.jackson.databind.JsonNode.class, long.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 17L, new ObjectMapper().readTree("{\"price\":null,\"prices\":[]}"), 48L, batch);

        java.lang.reflect.Field field = batchType.getDeclaredField("pricesByProduct");
        field.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<Long, List<Object[]>> prices = (Map<Long, List<Object[]>>) field.get(batch);

        assertTrue(prices.get(17L).isEmpty());
    }

    @Test
    void businessProductImportAcceptsPriceTierForBarcodePackageQuantity() throws Exception {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateProductBusinessFields", com.fasterxml.jackson.databind.JsonNode.class, long.class, Map.class);
        validate.setAccessible(true);
        Map<String, Long> taxRates = new java.util.HashMap<>();
        taxRates.put("gst", 7L);

        validate.invoke(controller, new ObjectMapper().readTree("""
                {"source_id":"pack-4","name":"Four pack","case_quantity":24,
                 "prices":[{"quantity":4,"price":7.99,"priceEx":7.263636}],
                 "barcodes":[{"code":"9300004","quantity":4}],
                 "tax_rate_name":"GST","source_status":"ACTIVE"}
                """), 48L, taxRates);
    }

    @Test
    void packagePriceDoesNotCountAsAnIndividualUnitPrice() throws Exception {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        Method hasUnitPrice = ShopfrontIntegrationController.class.getDeclaredMethod(
                "hasValidUnitCataloguePrice", com.fasterxml.jackson.databind.JsonNode.class);
        hasUnitPrice.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();

        assertFalse((boolean) hasUnitPrice.invoke(controller, mapper.readTree(
                "{\"price\":null,\"prices\":[{\"quantity\":10,\"price\":64.99}]}")));
        assertTrue((boolean) hasUnitPrice.invoke(controller, mapper.readTree(
                "{\"price\":null,\"prices\":[{\"quantity\":1,\"price\":6.99}]}")));
        assertTrue((boolean) hasUnitPrice.invoke(controller, mapper.readTree("{\"price\":6.99}")));
    }

    @Test
    void packagePriceTierIsConvertedToPosUnitPriceOnlyForMatchingBarcodeQuantity() throws Exception {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductPrices", long.class, com.fasterxml.jackson.databind.JsonNode.class, long.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 17L, new ObjectMapper().readTree("""
                {"prices":[{"quantity":4,"price":7.99,"priceEx":7.263636}],
                 "barcodes":[{"code":"9300004","quantity":4}]}
                """), 48L, batch);
        collect.invoke(controller, 18L, new ObjectMapper().readTree("""
                {"prices":[{"quantity":10,"price":64.99}],
                 "barcodes":[{"code":"9300030","quantity":30}]}
                """), 48L, batch);

        java.lang.reflect.Field field = batchType.getDeclaredField("pricesByProduct");
        field.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<Long, List<Object[]>> prices = (Map<Long, List<Object[]>>) field.get(batch);
        assertEquals(new BigDecimal("1.9975"), prices.get(17L).get(0)[2]);
        assertEquals(new BigDecimal("1.8159"), prices.get(17L).get(0)[3]);
        assertEquals(new BigDecimal("64.99"), prices.get(18L).get(0)[2]);
    }

    @Test
    void normalizeTaxRateNamePreservesShopfrontFacetLabels() throws Exception {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        Method normalize = ShopfrontIntegrationController.class.getDeclaredMethod("normalizeTaxRateName", String.class);
        normalize.setAccessible(true);
        assertEquals("Including GST", normalize.invoke(controller, "Including GST"));
        assertEquals("Excluding GST", normalize.invoke(controller, "Excluding GST"));
        assertEquals("10.0% GST", normalize.invoke(controller, "10.0% GST"));
        assertEquals("0.0% GST", normalize.invoke(controller, "0.0% GST"));
        assertEquals("GST", normalize.invoke(controller, "GST"));
        assertEquals("GST Free", normalize.invoke(controller, "GST Free"));
    }

    @Test
    void normalizeShopfrontProductStatusPreservesEnum() {
        assertEquals("ACTIVE", ShopfrontIntegrationController.normalizeShopfrontProductStatus("ACTIVE", false));
        assertEquals("NOT_SELLING", ShopfrontIntegrationController.normalizeShopfrontProductStatus("NOT_SELLING", false));
        assertEquals("NOT_PURCHASING", ShopfrontIntegrationController.normalizeShopfrontProductStatus("Not Purchasing", false));
        assertEquals("NOT_ACTIVE", ShopfrontIntegrationController.normalizeShopfrontProductStatus("INACTIVE", false));
        assertEquals("NOT_ACTIVE", ShopfrontIntegrationController.normalizeShopfrontProductStatus("ACTIVE", true));
    }

    @Test
    void onlyExplicitlyVerifiedCatalogueCostCanUpdateCurrentProductCost() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        assertFalse(ShopfrontIntegrationController.sourceCostIsAuthoritative(
                mapper.readTree("{\"cost_authority\":\"historical_unverified\"}")));
        assertFalse(ShopfrontIntegrationController.sourceCostIsAuthoritative(mapper.readTree("{}")));
        assertFalse(ShopfrontIntegrationController.sourceCostIsAuthoritative(
                mapper.readTree("{\"cost_authority\":\"unknown\"}")));
        assertFalse(ShopfrontIntegrationController.sourceCostIsAuthoritative(
                mapper.readTree("{\"cost_authority\":\"catalog_verified\"}")));
        assertTrue(ShopfrontIntegrationController.sourceCostIsAuthoritative(mapper.readTree(
                "{\"cost_authority\":\"catalog_verified\",\"cost_contract\":\"case-and-unit-cost-v1\",\"cost\":43.5258,\"case_cost\":522.31}")));
        assertTrue(ShopfrontIntegrationController.sourceCostIsAuthoritative(mapper.readTree(
                "{\"cost_authority\":\"catalog_verified\",\"cost_contract\":\"case-and-unit-cost-v1\",\"cost_percentage\":true,\"cost\":35}")));
        assertFalse(ShopfrontIntegrationController.sourceCostIsAuthoritative(mapper.readTree(
                "{\"cost_authority\":\"catalog_verified\",\"cost_contract\":\"case-and-unit-cost-v1\",\"cost\":43.5258}")));
    }

    @Test
    void taxRateAmountFromNameParsesPercentLabels() {
        assertEquals(new java.math.BigDecimal("10.0"), ShopfrontIntegrationController.taxRateAmountFromName("10.0% GST"));
        assertEquals(new java.math.BigDecimal("0.0"), ShopfrontIntegrationController.taxRateAmountFromName("0.0% GST"));
        assertEquals(java.math.BigDecimal.TEN, ShopfrontIntegrationController.taxRateAmountFromName("Including GST"));
        assertEquals(java.math.BigDecimal.ZERO, ShopfrontIntegrationController.taxRateAmountFromName("GST Free"));
    }

    @Test
    void completeInventoryImportRejectsEmptyOrIncompleteSnapshotBeforeReplacement() throws Exception {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateBusinessImport", String.class, com.fasterxml.jackson.databind.JsonNode.class,
                String.class, long.class, boolean.class, Map.class);
        validate.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();

        InvocationTargetException empty = assertThrows(InvocationTargetException.class,
                () -> validate.invoke(controller, "inventory", mapper.readTree("[]"), "skr", 48L, true, new java.util.HashMap<>()));
        org.junit.jupiter.api.Assertions.assertInstanceOf(IllegalArgumentException.class, empty.getCause());

        InvocationTargetException missingQuantity = assertThrows(InvocationTargetException.class,
                () -> validate.invoke(controller, "inventory", mapper.readTree("[{\"source_id\":\"p1\"}]"), "skr", 48L, true, new java.util.HashMap<>()));
        org.junit.jupiter.api.Assertions.assertInstanceOf(IllegalArgumentException.class, missingQuantity.getCause());
    }

    @Test
    void businessProductImportRejectsConflictingAliasesInTheSameBatch() throws Exception {
        // After source_id 1:1 import, barcode alone does not alias. Conflicts only apply when
        // multiple source_ids already resolve to the same Orithos product id.
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("FROM tax_rate"), eq(Long.class), any(Object[].class)))
                .thenReturn(List.of(7L));
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of(
                        Map.of("source_product_id", "p1", "pos_product_id", 77L),
                        Map.of("source_product_id", "p2", "pos_product_id", 77L)));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateBusinessImport", String.class, com.fasterxml.jackson.databind.JsonNode.class,
                String.class, long.class, boolean.class, Map.class);
        validate.setAccessible(true);

        InvocationTargetException failure = assertThrows(InvocationTargetException.class,
                () -> validate.invoke(controller, "products", new ObjectMapper().readTree("""
                        [
                          {"source_id":"p1","name":"First name","barcodes":[{"code":"9300001"}],"case_quantity":6,"price":5,"tax_rate_name":"GST","source_status":"ACTIVE"},
                          {"source_id":"p2","name":"Second name","barcodes":[{"code":"9300002"}],"case_quantity":6,"price":8,"tax_rate_name":"GST","source_status":"ACTIVE"}
                        ]
                        """), "skr", 48L, false, new java.util.HashMap<>()));

        org.junit.jupiter.api.Assertions.assertInstanceOf(IllegalArgumentException.class, failure.getCause());
        org.junit.jupiter.api.Assertions.assertTrue(failure.getCause().getMessage().contains("conflicting business attributes"));
    }

    @Test
    void businessProductImportSoftSkipsConflictingAliasesInsteadOfFailingBatch() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of());
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductAliasConflicts", com.fasterxml.jackson.databind.JsonNode.class, String.class, Map.class, List.class);
        collect.setAccessible(true);
        List<String> errors = new ArrayList<>();
        @SuppressWarnings("unchecked")
        Set<String> rejected = (Set<String>) collect.invoke(controller, new ObjectMapper().readTree("""
                [
                  {"source_id":"p1","name":"First name","barcodes":[{"code":"9300001"}],"case_quantity":6,"price":5,"tax_rate_name":"GST","source_status":"ACTIVE"},
                  {"source_id":"p2","name":"Second name","barcodes":[{"code":"9300002"}],"case_quantity":6,"price":8,"tax_rate_name":"GST","source_status":"ACTIVE"},
                  {"source_id":"p3","name":"Third name","barcodes":[{"code":"9300003"}],"case_quantity":6,"price":8,"tax_rate_name":"GST","source_status":"ACTIVE"}
                ]
                """), "skr", Map.of("p1", 77L, "p2", 77L, "p3", 77L), errors);
        org.junit.jupiter.api.Assertions.assertEquals(Set.of("p1", "p2", "p3"), rejected);
        org.junit.jupiter.api.Assertions.assertFalse(errors.isEmpty());
        org.junit.jupiter.api.Assertions.assertTrue(errors.get(0).contains("conflicting business attributes"));
    }

    @Test
    void businessProductImportAllowsAliasesWhenLedgerAttributesMatch() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateProductAliasConflicts", com.fasterxml.jackson.databind.JsonNode.class, String.class, Map.class);
        validate.setAccessible(true);
        Map<String, Long> resolved = Map.of("p1", 77L, "p2", 77L);

        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> validate.invoke(controller, new ObjectMapper().readTree("""
                [
                  {"source_id":"p1","name":"First name","case_quantity":6,"price":5,"tax_rate_name":"GST","source_status":"ACTIVE","description":"first"},
                  {"source_id":"p2","name":"Second name","case_quantity":6,"prices":[{"quantity":1,"price":5}],"tax_rate_name":"gst","source_status":"ACTIVE","description":"second"}
                ]
                """), "skr", resolved));
    }

    @Test
    void inventoryImportRejectsConflictingAliasesForOnePosProduct() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of(
                        Map.of("source_product_id", "p1", "pos_product_id", 77L),
                        Map.of("source_product_id", "p2", "pos_product_id", 77L)));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateBusinessImport", String.class, com.fasterxml.jackson.databind.JsonNode.class,
                String.class, long.class, boolean.class, Map.class);
        validate.setAccessible(true);

        InvocationTargetException failure = assertThrows(InvocationTargetException.class,
                () -> validate.invoke(controller, "inventory", new ObjectMapper().readTree("""
                        [
                          {"source_id":"p1","quantity":10},
                          {"source_id":"p2","quantity":12}
                        ]
                        """), "skr", 48L, true, new java.util.HashMap<>()));

        org.junit.jupiter.api.Assertions.assertInstanceOf(IllegalArgumentException.class, failure.getCause());
        org.junit.jupiter.api.Assertions.assertTrue(failure.getCause().getMessage().contains("conflicting stock attributes"));
    }

    @Test
    void businessProductImportRequiresAnExistingOrithosTaxRate() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("FROM tax_rate"), eq(Long.class), any(Object[].class)))
                .thenReturn(List.of(7L));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateBusinessImport", String.class, com.fasterxml.jackson.databind.JsonNode.class,
                String.class, long.class, boolean.class, Map.class);
        validate.setAccessible(true);
        Map<String, Long> taxRates = new java.util.HashMap<>();

        validate.invoke(controller, "products", new ObjectMapper().readTree(
                "[{\"source_id\":\"p1\",\"name\":\"Product\",\"case_quantity\":6,\"price\":5,\"tax_rate_name\":\"GST\",\"source_status\":\"ACTIVE\"}]"),
                "skr", 48L, false, taxRates);

        assertEquals(7L, taxRates.get("gst"));
    }

    @Test
    void baseShelfPriceIsWrittenThroughTheBatchImportPath() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductPrices", long.class, com.fasterxml.jackson.databind.JsonNode.class, long.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 17L, new ObjectMapper().readTree("{\"price\":9.95,\"prices\":[]}"), 48L, batch);
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod("flushBusinessProductBatch", batchType, long.class, String.class);
        flush.setAccessible(true);
        flush.invoke(controller, batch, 48L, "skr");

        verify(jdbc).update(contains("DELETE FROM product_price WHERE outlet_id=? AND product_id IN"), any(Object[].class));
        verify(jdbc).batchUpdate(contains("INSERT INTO product_price (product_id,quantity,price,price_ex,outlet_id) VALUES (?,?,?,?,?)"), any(List.class));
    }

    @Test
    void productImportEnsuresBarcodeAuditTableBeforeProcessing() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importBusiness = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusiness", String.class, String.class, Map.class, JsonNode.class,
                boolean.class, boolean.class, JsonNode.class);
        importBusiness.setAccessible(true);

        importBusiness.invoke(controller, "products", "skr", Map.of("outlet_id", 87L),
                new ObjectMapper().createArrayNode(), false, false, null);

        verify(jdbc).update(contains("CREATE TABLE IF NOT EXISTS shopfront_product_mapping"));
        verify(jdbc).update(contains("CREATE TABLE IF NOT EXISTS shopfront_product_barcode_audit"));
    }

    @Test
    void productBarcodeConflictIsReportedWithoutReassigningTheBarcode() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT code, product_id FROM product_barcode"), any(Object[].class)))
                .thenReturn(List.of(Map.of("code", "9300001", "product_id", 101L)));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductBarcodes", long.class, JsonNode.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 102L, new ObjectMapper().readTree(
                "{\"source_id\":\"shopfront-product-2\",\"barcodes\":[{\"code\":\"9300001\"}]}"), batch);
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod("flushBusinessProductBatch", batchType, long.class, String.class);
        flush.setAccessible(true);

        flush.invoke(controller, batch, 87L, "skr");

        var conflictCount = batchType.getDeclaredField("barcodeConflictCount");
        conflictCount.setAccessible(true);
        assertEquals(1, conflictCount.get(batch));
        var conflictsField = batchType.getDeclaredField("barcodeConflicts");
        conflictsField.setAccessible(true);
        List<?> conflicts = (List<?>) conflictsField.get(batch);
        assertEquals(1, conflicts.size());
        assertTrue(String.valueOf(conflicts.get(0)).contains("shopfront-product-2"));
        assertTrue(String.valueOf(conflicts.get(0)).contains("9300001"));
        List<String> errors = new ArrayList<>();
        Method appendErrors = ShopfrontIntegrationController.class.getDeclaredMethod(
                "appendBarcodeConflictErrors", batchType, List.class);
        appendErrors.setAccessible(true);
        appendErrors.invoke(controller, batch, errors);
        assertEquals(1, errors.size());
        assertTrue(errors.get(0).contains("shopfront-product-2"));
        verify(jdbc, never()).batchUpdate(contains("INSERT INTO product_barcode"), any(List.class));
    }

    @Test
    void confirmedCatalogMovesBarcodeFromRetiredProductWithoutInventory() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT code, product_id FROM product_barcode"), any(Object[].class)))
                .thenReturn(List.of(Map.of("code", "9300001", "product_id", 101L)));
        when(jdbc.queryForList(contains("FROM shopfront_product_barcode_snapshot"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_ids", "[\"current-source\"]",
                        "barcode_sources", "{\"9300001\":[\"current-source\"]}")));
        when(jdbc.queryForList(contains("SELECT p.id AS product_id,p.status"), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "product_id", 101L, "status", "ACTIVE",
                        "inventory_quantity", BigDecimal.ZERO)));
        when(jdbc.queryForList(contains("SELECT pos_product_id,source_product_id FROM shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("pos_product_id", 101L, "source_product_id", "retired-source")));
        when(jdbc.update(contains("DELETE FROM product_barcode"), any(Object[].class))).thenReturn(1);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductBarcodes", long.class, JsonNode.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 102L, new ObjectMapper().readTree("""
                {"source_id":"current-source","catalog_confirmed":true,"source_status":"ACTIVE",
                 "catalog_snapshot_complete":true,"catalog_snapshot_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                 "barcodes":[{"code":"9300001","quantity":1}]}
                """), batch);
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod("flushBusinessProductBatch", batchType, long.class, String.class);
        flush.setAccessible(true);

        flush.invoke(controller, batch, 87L, "skr");

        var conflictCount = batchType.getDeclaredField("barcodeConflictCount");
        conflictCount.setAccessible(true);
        assertEquals(0, conflictCount.get(batch));
        verify(jdbc).update(contains("DELETE FROM product_barcode"), any(Object[].class));
        verify(jdbc).update(contains("INSERT INTO shopfront_product_barcode_audit"), any(Object[].class));
        verify(jdbc).batchUpdate(contains("INSERT INTO product_barcode"), any(List.class));
    }

    @Test
    void confirmedCatalogMovesBarcodeWhenCurrentOwnerDroppedItsClaim() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT code, product_id FROM product_barcode"), any(Object[].class)))
                .thenReturn(List.of(Map.of("code", "9300001", "product_id", 101L)));
        when(jdbc.queryForList(contains("FROM shopfront_product_barcode_snapshot"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_ids", "[\"current-source\",\"owner-source\"]",
                        "barcode_sources", "{\"9300001\":[\"current-source\"]}")));
        when(jdbc.queryForList(contains("SELECT p.id AS product_id,p.status"), any(Object[].class)))
                .thenReturn(List.of(Map.of("product_id", 101L, "status", "ACTIVE",
                        "inventory_quantity", BigDecimal.ZERO)));
        when(jdbc.queryForList(contains("SELECT pos_product_id,source_product_id FROM shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("pos_product_id", 101L, "source_product_id", "owner-source")));
        when(jdbc.update(contains("DELETE FROM product_barcode"), any(Object[].class))).thenReturn(1);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductBarcodes", long.class, JsonNode.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 102L, new ObjectMapper().readTree("""
                {"source_id":"current-source","catalog_confirmed":true,"source_status":"ACTIVE",
                 "catalog_snapshot_complete":true,"catalog_snapshot_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                 "barcodes":[{"code":"9300001","quantity":1}]}
                """), batch);
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod(
                "flushBusinessProductBatch", batchType, long.class, String.class);
        flush.setAccessible(true);

        flush.invoke(controller, batch, 87L, "skr");

        var conflictCount = batchType.getDeclaredField("barcodeConflictCount");
        conflictCount.setAccessible(true);
        assertEquals(0, conflictCount.getInt(batch));
        verify(jdbc).update(contains("DELETE FROM product_barcode WHERE outlet_id=? AND product_id=? AND code=?"),
                eq(87L), eq(101L), eq("9300001"));
        verify(jdbc).queryForList(argThat(sql -> sql.contains("NOT EXISTS (SELECT 1 FROM sale_item")
                && sql.contains("NOT EXISTS (SELECT 1 FROM order_product")
                && sql.contains("NOT EXISTS (SELECT 1 FROM purchase_receipt_line")
                && sql.contains("purchase_receipt")
                && sql.contains("inventory_movement")
                && sql.contains("stocktake_product")), any(Object[].class));
        verify(jdbc).update(contains("INSERT INTO shopfront_product_barcode_audit"), any(Object[].class));
        verify(jdbc).update(contains("'verified_unclaimed_shopfront_barcode'"), any(Object[].class));
        verify(jdbc).batchUpdate(contains("INSERT INTO product_barcode"), any(List.class));
    }

    @Test
    void duplicateBarcodeCannotBorrowMigrationEligibilityFromAnotherBarcodeOfSameOwner() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT code, product_id FROM product_barcode"), any(Object[].class)))
                .thenReturn(List.of(Map.of("code", "9300001", "product_id", 101L),
                        Map.of("code", "9300002", "product_id", 101L)));
        when(jdbc.queryForList(contains("FROM shopfront_product_barcode_snapshot"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_ids",
                        "[\"safe-source\",\"duplicate-a\",\"duplicate-b\"]",
                        "barcode_sources", "{\"9300001\":[\"safe-source\"],\"9300002\":[\"duplicate-a\",\"duplicate-b\"]}")));
        when(jdbc.queryForList(contains("SELECT p.id AS product_id,p.status"), any(Object[].class)))
                .thenReturn(List.of(Map.of("product_id", 101L, "status", "ACTIVE",
                        "inventory_quantity", BigDecimal.ZERO)));
        when(jdbc.queryForList(contains("SELECT pos_product_id,source_product_id FROM shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("pos_product_id", 101L, "source_product_id", "owner-source")));
        when(jdbc.update(contains("DELETE FROM product_barcode"), any(Object[].class))).thenReturn(1);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductBarcodes", long.class, JsonNode.class, batchType);
        collect.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();
        collect.invoke(controller, 102L, mapper.readTree("""
                {"source_id":"safe-source","catalog_confirmed":true,"source_status":"ACTIVE",
                 "catalog_snapshot_complete":true,"catalog_snapshot_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                 "barcodes":[{"code":"9300001","quantity":1}]}
                """), batch);
        collect.invoke(controller, 103L, mapper.readTree("""
                {"source_id":"duplicate-a","catalog_confirmed":true,"source_status":"ACTIVE",
                 "catalog_snapshot_complete":true,"catalog_snapshot_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                 "barcodes":[{"code":"9300002","quantity":1}]}
                """), batch);
        collect.invoke(controller, 104L, mapper.readTree("""
                {"source_id":"duplicate-b","catalog_confirmed":true,"source_status":"ACTIVE",
                 "catalog_snapshot_complete":true,"catalog_snapshot_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                 "barcodes":[{"code":"9300002","quantity":1}]}
                """), batch);
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod(
                "flushBusinessProductBatch", batchType, long.class, String.class);
        flush.setAccessible(true);

        flush.invoke(controller, batch, 87L, "skr");

        verify(jdbc).update(contains("DELETE FROM product_barcode WHERE outlet_id=? AND product_id=? AND code=?"),
                eq(87L), eq(101L), eq("9300001"));
        verify(jdbc, never()).update(contains("DELETE FROM product_barcode WHERE outlet_id=? AND product_id=? AND code=?"),
                eq(87L), eq(101L), eq("9300002"));
        var conflictCount = batchType.getDeclaredField("barcodeConflictCount");
        conflictCount.setAccessible(true);
        assertEquals(2, conflictCount.getInt(batch));
    }

    @Test
    void confirmedCatalogKeepsBarcodeConflictWhenExistingProductHasInventory() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT code, product_id FROM product_barcode"), any(Object[].class)))
                .thenReturn(List.of(Map.of("code", "9300001", "product_id", 101L)));
        when(jdbc.queryForList(contains("FROM shopfront_product_barcode_snapshot"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_ids", "[\"current-source\"]",
                        "barcode_sources", "{\"9300001\":[\"current-source\"]}")));
        when(jdbc.queryForList(contains("SELECT p.id AS product_id,p.status"), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "product_id", 101L,
                        "status", "ACTIVE",
                        "inventory_quantity", new BigDecimal("-268"))));
        when(jdbc.queryForList(contains("SELECT pos_product_id,source_product_id FROM shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("pos_product_id", 101L, "source_product_id", "retired-source")));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductBarcodes", long.class, JsonNode.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 102L, new ObjectMapper().readTree("""
                {"source_id":"current-source","catalog_confirmed":true,"source_status":"ACTIVE",
                 "catalog_snapshot_complete":true,"catalog_snapshot_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                 "barcodes":[{"code":"9300001","quantity":1}]}
                """), batch);
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod("flushBusinessProductBatch", batchType, long.class, String.class);
        flush.setAccessible(true);

        flush.invoke(controller, batch, 87L, "skr");

        var conflictCount = batchType.getDeclaredField("barcodeConflictCount");
        conflictCount.setAccessible(true);
        assertEquals(1, conflictCount.get(batch));
        verify(jdbc, never()).update(contains("DELETE FROM product_barcode"), any(Object[].class));
        verify(jdbc, never()).batchUpdate(contains("INSERT INTO product_barcode"), any(List.class));
    }

    @Test
    void duplicateShopfrontBarcodeDeclarationCannotReassignExistingBarcode() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("SELECT code, product_id FROM product_barcode"), any(Object[].class)))
                .thenReturn(List.of(Map.of("code", "9300001", "product_id", 101L)));
        when(jdbc.queryForList(contains("FROM shopfront_product_barcode_snapshot"), any(Object[].class)))
                .thenReturn(List.of(Map.of("source_ids", "[\"current-source\",\"duplicate-source\"]",
                        "barcode_sources", "{\"9300001\":[\"current-source\",\"duplicate-source\"]}")));
        when(jdbc.queryForList(contains("SELECT p.id AS product_id,p.status"), any(Object[].class)))
                .thenReturn(List.of(Map.of("product_id", 101L, "status", "ACTIVE",
                        "inventory_quantity", BigDecimal.ZERO)));
        when(jdbc.queryForList(contains("SELECT pos_product_id,source_product_id FROM shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of(Map.of("pos_product_id", 101L, "source_product_id", "retired-source")));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductBarcodes", long.class, JsonNode.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 102L, new ObjectMapper().readTree("""
                {"source_id":"current-source","catalog_confirmed":true,"source_status":"ACTIVE",
                 "catalog_snapshot_complete":true,"catalog_snapshot_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                 "barcodes":[{"code":"9300001","quantity":1}]}
                """), batch);
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod(
                "flushBusinessProductBatch", batchType, long.class, String.class);
        flush.setAccessible(true);

        flush.invoke(controller, batch, 87L, "skr");

        var conflictCount = batchType.getDeclaredField("barcodeConflictCount");
        conflictCount.setAccessible(true);
        assertEquals(1, conflictCount.get(batch));
        verify(jdbc, never()).update(contains("DELETE FROM product_barcode"), any(Object[].class));
        verify(jdbc, never()).batchUpdate(contains("INSERT INTO product_barcode"), any(List.class));
    }

    @Test
    void catalogSupplierLinksAreWrittenThroughTheBatchImportPath() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Class<?> batchType = Class.forName(ShopfrontIntegrationController.class.getName() + "$ProductImportBatch");
        Constructor<?> constructor = batchType.getDeclaredConstructor();
        constructor.setAccessible(true);
        Object batch = constructor.newInstance();
        java.lang.reflect.Field supplierMappingsField = batchType.getDeclaredField("supplierMappings");
        supplierMappingsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Long> supplierMappings = (Map<String, Long>) supplierMappingsField.get(batch);
        supplierMappings.put("sup-1", 501L);
        supplierMappings.put("sup-2", 502L);
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductSuppliers", long.class, com.fasterxml.jackson.databind.JsonNode.class,
                String.class, long.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 17L, new ObjectMapper().readTree("""
                {
                  "raw_payload": {
                    "coreSupplier": {"id": "sup-1", "name": "Core"},
                    "suppliers": [
                      {"supplier": {"id": "sup-1", "name": "Core"}, "code": "C1", "minimumOrderQuantity": 6},
                      {"supplier": {"id": "sup-2", "name": "Alt"}, "code": "A1"}
                    ]
                  }
                }
                """), "skr", 48L, batch);
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod("flushBusinessProductBatch", batchType, long.class, String.class);
        flush.setAccessible(true);
        flush.invoke(controller, batch, 48L, "skr");

        verify(jdbc).update(contains("DELETE FROM product_supplier WHERE outlet_id=? AND product_id IN"), any(Object[].class));
        verify(jdbc).batchUpdate(contains(
                "INSERT INTO product_supplier (product_id, supplier_id, code, minimum_order_quantity, outlet_id) VALUES (?,?,?,?,?)"),
                any(List.class));
        verify(jdbc).batchUpdate(contains("UPDATE product SET core_supplier_id=? WHERE id=? AND outlet_id=?"), any(List.class));
    }


    @Test
    void productIdentityKeyIsSourceIdNotBarcode() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method identity = ShopfrontIntegrationController.class.getDeclaredMethod(
                "productIdentityKey", com.fasterxml.jackson.databind.JsonNode.class);
        identity.setAccessible(true);
        Object key = identity.invoke(controller, new ObjectMapper().readTree(
                "{\"source_id\":\"src-a\",\"name\":\"Same Name\",\"barcodes\":[{\"code\":\"9300001\"}]}"));
        assertEquals("source:src-a", key);
    }

    @Test
    void resolveBusinessProductIdsDoesNotAliasByBarcode() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("shopfront_product_mapping"), any(Object[].class)))
                .thenReturn(List.of());
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method resolve = ShopfrontIntegrationController.class.getDeclaredMethod(
                "resolveBusinessProductIds", String.class, long.class, com.fasterxml.jackson.databind.JsonNode.class);
        resolve.setAccessible(true);
        Object plan = resolve.invoke(controller, "skr", 87L, new ObjectMapper().readTree("""
                [
                  {"source_id":"p1","name":"Pack A","barcodes":[{"code":"9300001"}]},
                  {"source_id":"p2","name":"Pack B","barcodes":[{"code":"9300001"}]}
                ]
                """));
        Method productIds = plan.getClass().getDeclaredMethod("productIds");
        productIds.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Long> ids = (Map<String, Long>) productIds.invoke(plan);
        org.junit.jupiter.api.Assertions.assertNull(ids.get("p1"));
        org.junit.jupiter.api.Assertions.assertNull(ids.get("p2"));
        verify(jdbc, never()).queryForList(contains("product_barcode"), any(Object[].class));
        verify(jdbc, never()).queryForList(contains("mdb_id"), any(Object[].class));
        verify(jdbc, never()).queryForList(contains("lower(trim(name))"), any(Object[].class));
    }

    private static Stream<Arguments> mappingFlags() {
        return Stream.of(
                Arguments.of(true, true),
                Arguments.of(1, true),
                Arguments.of("1", true),
                Arguments.of(" true ", true),
                Arguments.of(false, false),
                Arguments.of(0, false),
                Arguments.of("0", false),
                Arguments.of("false", false),
                Arguments.of("enabled", false));
    }
}
