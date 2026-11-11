package com.orithos.modules.integration;

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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ShopfrontIntegrationControllerTest {

    @Test
    void matchStatusAggregatesProductAndSaleItemCounts() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForMap(contains("FROM shopfront_product sp"), any(Object[].class)))
                .thenReturn(Map.of(
                        "products", 11033L,
                        "products_missing_name", 0L,
                        "barcode_matched", 10970L,
                        "barcode_unmatched", 63L,
                        "manually_mapped", 11033L,
                        "products_unmapped", 0L));
        when(jdbc.queryForObject(contains("WITH unmatched_products"), eq(Integer.class), any(Object[].class)))
                .thenReturn(0);
        when(jdbc.queryForMap(contains("FROM shopfront_sale_item"), any(Object[].class)))
                .thenReturn(Map.of("sale_items_missing_name", 0L, "sale_items_missing_source_product", 0L));
        when(jdbc.queryForObject(contains("COUNT(DISTINCT outlet_id)"), eq(Integer.class), any(Object[].class)))
                .thenReturn(1);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        var result = controller.matchStatus("token", "demo");

        assertEquals(11033, result.data().get("products"));
        assertEquals(63, result.data().get("barcode_unmatched"));
        assertEquals(11033, result.data().get("manually_mapped"));
        assertEquals(0, result.data().get("products_unmapped"));
        assertEquals(0, result.data().get("sales_with_unmatched_items"));
        assertEquals(0, result.data().get("sale_items_missing_name"));
        assertEquals(0, result.data().get("sale_items_missing_source_product"));
        verify(jdbc).queryForMap(contains("FROM shopfront_product sp"), any(Object[].class));
        verify(jdbc).queryForMap(contains("FROM shopfront_sale_item"), any(Object[].class));
        verify(jdbc, org.mockito.Mockito.never()).update(
                contains("CREATE INDEX IF NOT EXISTS idx_shopfront_sale_item_store_product_sale"));
        verify(jdbc, org.mockito.Mockito.never()).update(
                contains("CREATE INDEX IF NOT EXISTS idx_shopfront_sale_store_biz_ext"));
        verify(jdbc).update(contains("updated_at VARCHAR(64), business_date DATE"));
    }

    @Test
    void copiesOnlyShopfrontMirrorTablesBetweenDistinctMappedOutlets() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForList(contains("SELECT store_key, outlet_id, enabled"), any(Object[].class)))
                .thenReturn(List.of(
                        Map.of("store_key", "skr", "outlet_id", "87", "enabled", true),
                        Map.of("store_key", "demo", "outlet_id", "1", "enabled", true)));
        when(jdbc.queryForObject(contains("COUNT(*) FROM"), eq(Integer.class), any(Object[].class)))
                .thenReturn(2);
        when(jdbc.queryForObject(contains("INSERT INTO shopfront_mirror_run"), eq(Long.class), any(Object[].class)))
                .thenReturn(42L);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        var result = controller.copyShopfrontMirror("token", new ObjectMapper().readTree(
                "{\"source_store_key\":\"skr\",\"target_store_key\":\"demo\"}"));

        assertEquals("skr", result.data().get("source_store_key"));
        assertEquals("demo", result.data().get("target_store_key"));
        assertEquals(false, result.data().get("business_write"));
        @SuppressWarnings("unchecked")
        Map<String, Integer> counts = (Map<String, Integer>) result.data().get("record_counts");
        assertEquals(9, counts.size());
        assertEquals(2, counts.get("shopfront_sale"));
        assertTrue(counts.containsKey("shopfront_extended_record"));
        verify(jdbc).update(contains("LOCK TABLE shopfront_sale_payment"));
        verify(jdbc).update(contains("INSERT INTO shopfront_sale (store_key"), eq("demo"), eq("skr"));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("shopfront_product_mapping"), any(Object[].class));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("shopfront_supplier_business_mapping"), any(Object[].class));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("inventory_movement"), any(Object[].class));
    }

    @Test
    void rejectsMirrorCopyWhenSourceAndTargetResolveToSameOutlet() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForList(contains("SELECT store_key, outlet_id, enabled"), any(Object[].class)))
                .thenReturn(List.of(
                        Map.of("store_key", "skr", "outlet_id", "87", "enabled", true),
                        Map.of("store_key", "demo", "outlet_id", "87", "enabled", true)));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);

        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> controller.copyShopfrontMirror("token", new ObjectMapper().readTree(
                        "{\"source_store_key\":\"skr\",\"target_store_key\":\"demo\"}")));

        assertEquals(HttpStatus.CONFLICT, failure.getStatusCode());
        assertEquals("Source and target must map to different POS outlets", failure.getReason());
        verify(jdbc, org.mockito.Mockito.never()).update(contains("DELETE FROM shopfront_sale"), any(Object[].class));
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
    void completeInventoryReplacementClearsOnlyTheTargetStoreShadow() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        Method persistShadow = ShopfrontIntegrationController.class.getDeclaredMethod(
                "persistShadow", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class);
        persistShadow.setAccessible(true);
        persistShadow.invoke(controller, "inventory", "skr", Map.of("outlet_id", "48"),
                new ObjectMapper().readTree("[]"), true);

        verify(jdbc).update(contains("DELETE FROM shopfront_inventory WHERE store_key = ?"), eq("skr"));
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void batchesProductAndInventoryShadowWritesAndPreservesNegativeStock() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        Method persistShadow = ShopfrontIntegrationController.class.getDeclaredMethod(
                "persistShadow", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class);
        persistShadow.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();

        persistShadow.invoke(controller, "products", "skr", Map.of("outlet_id", "87"), mapper.readTree(
                "[{\"source_id\":\"p1\",\"name\":\"One\"},{\"source_id\":\"p2\",\"name\":\"Two\"}]"), false);
        ArgumentCaptor<List<Object[]>> productRows = ArgumentCaptor.forClass((Class) List.class);
        verify(jdbc).batchUpdate(contains("INSERT INTO shopfront_product"), productRows.capture());
        assertEquals(2, productRows.getValue().size());
        assertEquals("p1", productRows.getValue().get(0)[1]);

        persistShadow.invoke(controller, "inventory", "skr", Map.of("outlet_id", "87"), mapper.readTree(
                "[{\"source_id\":\"p1\",\"quantity\":-5.25,\"timestamp\":\"2026-11-09\"}]"), false);
        ArgumentCaptor<List<Object[]>> inventoryRows = ArgumentCaptor.forClass((Class) List.class);
        verify(jdbc).batchUpdate(contains("INSERT INTO shopfront_inventory"), inventoryRows.capture());
        assertEquals(new BigDecimal("-5.25"), inventoryRows.getValue().get(0)[3]);
        assertEquals("87", inventoryRows.getValue().get(0)[2]);
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
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class);
        importBusiness.setAccessible(true);

        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) importBusiness.invoke(controller, "inventory", "skr",
                Map.of("outlet_id", "87"), new ObjectMapper().readTree(
                        "[{\"source_id\":\"p1\",\"quantity\":-5.25}]"), false);

        ArgumentCaptor<List<Object[]>> rows = ArgumentCaptor.forClass((Class) List.class);
        verify(jdbc).batchUpdate(contains("INSERT INTO product_inventory"), rows.capture());
        assertEquals(1, rows.getValue().size());
        assertEquals(new BigDecimal("-5.25"), rows.getValue().get(0)[2]);
        assertEquals(1, result.get("updated"));
        assertEquals(0, result.get("skipped"));
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
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class);
        importBusiness.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();
        var items = mapper.readTree("[{\"source_id\":\"shopfront-supplier-1\",\"name\":\"Supplier One\",\"business_number\":\"12 345 678 901\",\"status\":\"ACTIVE\",\"raw_payload\":{\"orderNotes\":\"Morning delivery\"}}]");

        @SuppressWarnings("unchecked")
        Map<String, Object> first = (Map<String, Object>) importBusiness.invoke(controller, "suppliers", "skr",
                Map.of("company_id", "55", "outlet_id", "87"), items, false);
        @SuppressWarnings("unchecked")
        Map<String, Object> replay = (Map<String, Object>) importBusiness.invoke(controller, "suppliers", "skr",
                Map.of("company_id", "55", "outlet_id", "87"), items, false);

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
    void rejectsSupplierImportWhenStoreMappingCompanyDoesNotOwnOutlet() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("SELECT vendor_id FROM outlet"), eq(Long.class), eq(87L)))
                .thenReturn(55L);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method importBusiness = ShopfrontIntegrationController.class.getDeclaredMethod(
                "importBusiness", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class);
        importBusiness.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();

        InvocationTargetException failure = assertThrows(InvocationTargetException.class,
                () -> importBusiness.invoke(controller, "suppliers", "demo", Map.of("company_id", "56", "outlet_id", "87"),
                        mapper.readTree("[{\"source_id\":\"s1\",\"name\":\"Supplier\"}]"), false));

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
                [{"source_id":"sf-order-1","supplier_source_id":"sf-supplier-1","raw_payload":{
                  "status":"RECEIVED","orderDate":"2026-10-02","invoiceNumber":"INV-1001",
                  "totalCost":20,"expectedTotal":20,"products":[{
                    "caseQuantity":1,"orderedQuantity":2,"receivedQuantity":2,"baseCost":10,"orderedCost":20,
                    "supplier":{"id":"sf-supplier-1"},"item":{"id":"sf-product-1","mdbId":"SKU-1"}
                  }]
                }}]
                """);

        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) importer.invoke(controller, "skr",
                Map.of("company_id", "55", "outlet_id", "87"), items);

        assertEquals(1, result.get("created"));
        assertEquals(0, result.get("updated"));
        verify(jdbc).update(contains("INSERT INTO order_product"), any(Object[].class));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("inventory_movement"), any(Object[].class));
        verify(jdbc, org.mockito.Mockito.never()).update(contains("product_inventory"), any(Object[].class));
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
    void promotesPurchaseOrdersFromMirrorInBoundedBatches() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");

        String rawPayload = "{\"status\":\"RECEIVED\",\"orderDate\":\"2026-10-02\",\"invoiceNumber\":\"INV-1001\","
                + "\"totalCost\":20,\"expectedTotal\":20,\"products\":[{"
                + "\"caseQuantity\":1,\"orderedQuantity\":2,\"receivedQuantity\":2,\"baseCost\":10,\"orderedCost\":20,"
                + "\"supplier\":{\"id\":\"sf-supplier-1\"},\"item\":{\"id\":\"sf-product-1\",\"mdbId\":\"SKU-1\"}}]}";
        List<Map<String, Object>> mirrorRows = List.of(Map.of(
                "source_id", "sf-order-1",
                "supplier_source_id", "sf-supplier-1",
                "status", "RECEIVED",
                "order_date", "2026-10-02",
                "total_cost", new BigDecimal("20"),
                "raw_payload", rawPayload));

        org.mockito.Mockito.lenient().when(jdbc.queryForList(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(Object[].class)))
                .thenAnswer(invocation -> {
                    Object[] callArgs = invocation.getArguments();
                    String sql = callArgs.length == 0 || callArgs[0] == null ? "" : callArgs[0].toString();
                    if (sql.contains("shopfront_store_mapping WHERE store_key")) {
                        return List.of(Map.of("store_key", "skr", "company_id", "55", "outlet_id", 87L, "enabled", 1));
                    }
                    if (sql.contains("FROM shopfront_purchase_order po")) {
                        return mirrorRows;
                    }
                    if (sql.contains("shopfront_supplier_business_mapping")) {
                        return List.of(Map.of("source_id", "sf-supplier-1", "supplier_id", 701L));
                    }
                    if (sql.contains("shopfront_product_mapping")) {
                        return List.of(Map.of("source_product_id", "sf-product-1", "pos_product_id", 801L));
                    }
                    if (sql.contains("shopfront_purchase_order_business_mapping")) {
                        return List.of();
                    }
                    return List.of();
                });
        when(jdbc.queryForObject(contains("SELECT vendor_id FROM outlet"), eq(Long.class), eq(87L)))
                .thenReturn(55L);
        when(jdbc.queryForObject(contains("INSERT INTO purchase_order"), eq(Long.class), any(Object[].class)))
                .thenReturn(901L);
        when(jdbc.queryForObject(contains("FROM shopfront_purchase_order WHERE store_key"), eq(Integer.class), eq("skr")))
                .thenReturn(2372);
        when(jdbc.queryForObject(contains("purchase_order_id > 0"), eq(Integer.class), eq("skr"), eq(87L)))
                .thenReturn(499);
        when(jdbc.queryForObject(contains("purchase_order_id = 0"), eq(Integer.class), eq("skr"), eq(87L)))
                .thenReturn(12);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        var body = new ObjectMapper().createObjectNode()
                .put("store_key", "skr")
                .put("limit", 100);
        Map<String, Object> result = controller.promotePurchaseOrders("token", body).data();

        assertEquals("PROMOTED", result.get("status"));
        assertEquals("skr", result.get("store_key"));
        assertEquals(true, result.get("only_unmapped"));
        assertEquals(1, result.get("mirror_batch"));
        assertEquals(false, result.get("has_more"));
        assertEquals(2372, result.get("mirror_total"));
        assertEquals(499, result.get("purchase_orders_mapped"));
        @SuppressWarnings("unchecked")
        Map<String, Object> business = (Map<String, Object>) result.get("business");
        assertEquals(1, business.get("created"));
    }

    @Test
    void clonesProductMappingsInBoundedPhases() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForList(contains("shopfront_store_mapping"), any(Object[].class)))
                .thenReturn(List.of(
                        Map.of("store_key", "skr", "outlet_id", 87, "enabled", 1),
                        Map.of("store_key", "demo", "outlet_id", 1, "enabled", 1)));
        when(jdbc.update(contains("BARCODE"), any(Object[].class))).thenReturn(1500);
        when(jdbc.queryForObject(contains("shopfront_product_mapping WHERE store_key"), eq(Integer.class), eq("skr")))
                .thenReturn(11000);
        when(jdbc.queryForObject(contains("shopfront_product_mapping WHERE store_key"), eq(Integer.class), eq("demo")))
                .thenReturn(1500);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        var body = new ObjectMapper().createObjectNode()
                .put("source_store_key", "skr")
                .put("target_store_key", "demo")
                .put("phase", "target_barcodes")
                .put("limit", 1500);

        Map<String, Object> result = controller.cloneProductMappings("token", body).data();
        assertEquals("CLONED", result.get("status"));
        assertEquals(true, result.get("more"));
        assertEquals(1500, result.get("inserted"));
        assertEquals("target_barcodes", result.get("phase"));
    }

    @Test
    void pagesProductMirrorByImmutableSourceId() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(jdbc.queryForObject(contains("SELECT COUNT(*) FROM shopfront_product"), eq(Integer.class), eq("skr")))
                .thenReturn(11016);

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        controller.data("token", "skr", "products", 2, 500);

        verify(jdbc).queryForList(contains("ORDER BY source_id ASC"), any(Object[].class));
    }

    @Test
    void persistsSupplierAndPurchaseOrderShadowsByExternalId() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");

        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        Method persistShadow = ShopfrontIntegrationController.class.getDeclaredMethod(
                "persistShadow", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class);
        persistShadow.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();
        persistShadow.invoke(controller, "suppliers", "skr", Map.of("outlet_id", "48"),
                mapper.readTree("[{\"source_id\":\"supplier-1\",\"name\":\"Supplier\",\"raw_payload\":{\"id\":\"supplier-1\"}}]"), false);
        persistShadow.invoke(controller, "purchase_orders", "skr", Map.of("outlet_id", "48"),
                mapper.readTree("[{\"source_id\":\"order-1\",\"supplier_source_id\":\"supplier-1\",\"raw_payload\":{\"id\":\"order-1\"}}]"), false);

        verify(jdbc).update(contains("INSERT INTO shopfront_supplier"), any(Object[].class));
        verify(jdbc).update(contains("INSERT INTO shopfront_purchase_order"), any(Object[].class));
    }

    @Test
    void reconcilesSaleChildrenOnlyWhenSourceMarksSaleComplete() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        Method persistShadow = ShopfrontIntegrationController.class.getDeclaredMethod(
                "persistShadow", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class);
        persistShadow.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();

        persistShadow.invoke(controller, "sales", "skr", Map.of(), mapper.readTree(
                "[{\"external_id\":\"sale-1\",\"items\":[],\"payments\":[]} ]"), false);
        org.mockito.Mockito.verify(jdbc, org.mockito.Mockito.never())
                .update(contains("DELETE FROM shopfront_sale_item"), any(Object[].class));

        persistShadow.invoke(controller, "sales", "skr", Map.of(), mapper.readTree(
                "[{\"external_id\":\"sale-2\",\"source_complete\":true,\"items\":[],\"payments\":[]} ]"), false);
        verify(jdbc).update(contains("DELETE FROM shopfront_sale_item WHERE store_key = ? AND external_sale_id = ?"), any(Object[].class));
        verify(jdbc).update(contains("DELETE FROM shopfront_sale_payment WHERE store_key = ? AND external_sale_id = ?"), any(Object[].class));
    }

    @Test
    void saleLineKeyUsesNestedShopfrontSourceId() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        Method persistShadow = ShopfrontIntegrationController.class.getDeclaredMethod(
                "persistShadow", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class);
        persistShadow.setAccessible(true);
        persistShadow.invoke(controller, "sales", "skr", Map.of(), new ObjectMapper().readTree(
                "[{\"external_id\":\"sale-1\",\"source_complete\":true,\"items\":[{\"id\":\"line-42\",\"raw_payload\":{\"item\":{\"id\":\"product-7\"}}}],\"payments\":[]}]"), false);

        verify(jdbc).update(contains("INSERT INTO shopfront_sale_item"),
                org.mockito.ArgumentMatchers.eq("skr"), org.mockito.ArgumentMatchers.eq("sale-1"),
                org.mockito.ArgumentMatchers.eq("line-42"), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void upsertsCustomerShadowByExternalIdWithoutBusinessCustomerWrites() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        when(jdbc.getDataSource()).thenReturn(dataSource);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        Method persistShadow = ShopfrontIntegrationController.class.getDeclaredMethod(
                "persistShadow", String.class, String.class, Map.class,
                com.fasterxml.jackson.databind.JsonNode.class, boolean.class);
        persistShadow.setAccessible(true);
        persistShadow.invoke(controller, "customers", "skr", Map.of("outlet_id", "48"),
                new ObjectMapper().readTree("[{\"source_id\":\"customer-1\",\"client_id\":\"client-1\",\"name\":\"Test\",\"email\":\"test@example.com\",\"raw_payload\":{\"id\":\"customer-1\"}}]"), false);

        verify(jdbc).update(contains("ON CONFLICT (store_key,source_id) DO UPDATE"), any(Object[].class));
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
        assertEquals(expected ? "STAGED" : "BLOCKED_MAPPING", result.data().get("status"));
    }

    @Test
    void businessProductImportRejectsMissingCaseQuantityPriceOrTax() throws Exception {
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), new ObjectMapper(), "token", true, true);
        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateProductBusinessFields", com.fasterxml.jackson.databind.JsonNode.class, long.class, Map.class);
        validate.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();
        String[] blockedProducts = {
                "{\"source_id\":\"p1\",\"name\":\"Product\",\"price\":5,\"tax_rate_name\":\"GST\"}",
                "{\"source_id\":\"p1\",\"name\":\"Product\",\"case_quantity\":6,\"tax_rate_name\":\"GST\"}",
                "{\"source_id\":\"p1\",\"name\":\"Product\",\"case_quantity\":6,\"price\":5}"
        };

        for (String product : blockedProducts) {
            InvocationTargetException failure = assertThrows(InvocationTargetException.class,
                    () -> validate.invoke(controller, mapper.readTree(product), 48L, new java.util.HashMap<>()));
            org.junit.jupiter.api.Assertions.assertInstanceOf(IllegalArgumentException.class, failure.getCause());
        }
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
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(contains("FROM tax_rate"), eq(Long.class), any(Object[].class)))
                .thenReturn(List.of(7L));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method validate = ShopfrontIntegrationController.class.getDeclaredMethod(
                "validateBusinessImport", String.class, com.fasterxml.jackson.databind.JsonNode.class,
                String.class, long.class, boolean.class, Map.class);
        validate.setAccessible(true);

        InvocationTargetException failure = assertThrows(InvocationTargetException.class,
                () -> validate.invoke(controller, "products", new ObjectMapper().readTree("""
                        [
                          {"source_id":"p1","name":"First name","barcodes":[{"code":"9300001"}],"case_quantity":6,"price":5,"tax_rate_name":"GST","source_status":"ACTIVE"},
                          {"source_id":"p2","name":"Second name","barcodes":[{"code":"9300001"}],"case_quantity":6,"price":8,"tax_rate_name":"GST","source_status":"ACTIVE"}
                        ]
                        """), "skr", 48L, false, new java.util.HashMap<>()));

        org.junit.jupiter.api.Assertions.assertInstanceOf(IllegalArgumentException.class, failure.getCause());
        org.junit.jupiter.api.Assertions.assertTrue(failure.getCause().getMessage().contains("conflicting business attributes"));
    }

    @Test
    void businessProductImportSoftSkipsConflictingAliasesInsteadOfFailingBatch() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductAliasConflicts", com.fasterxml.jackson.databind.JsonNode.class, String.class, Map.class, List.class);
        collect.setAccessible(true);
        List<String> errors = new ArrayList<>();
        @SuppressWarnings("unchecked")
        Set<String> rejected = (Set<String>) collect.invoke(controller, new ObjectMapper().readTree("""
                [
                  {"source_id":"p1","name":"First name","barcodes":[{"code":"9300001"}],"case_quantity":6,"price":5,"tax_rate_name":"GST","source_status":"ACTIVE"},
                  {"source_id":"p2","name":"Second name","barcodes":[{"code":"9300001"}],"case_quantity":6,"price":8,"tax_rate_name":"GST","source_status":"ACTIVE"},
                  {"source_id":"p3","name":"Third name","barcodes":[{"code":"9300001"}],"case_quantity":6,"price":8,"tax_rate_name":"GST","source_status":"ACTIVE"}
                ]
                """), "skr", Map.of(), errors);
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
        Method flush = ShopfrontIntegrationController.class.getDeclaredMethod("flushBusinessProductBatch", batchType, long.class);
        flush.setAccessible(true);
        flush.invoke(controller, batch, 48L);

        verify(jdbc).update(contains("DELETE FROM product_price WHERE outlet_id=? AND product_id IN"), any(Object[].class));
        verify(jdbc).batchUpdate(contains("INSERT INTO product_price (product_id,quantity,price,price_ex,outlet_id) VALUES (?,?,?,?,?)"), any(List.class));
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
