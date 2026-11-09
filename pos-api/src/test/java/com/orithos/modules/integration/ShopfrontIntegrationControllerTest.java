package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ShopfrontIntegrationControllerTest {

    @Test
    void stagingFailureDoesNotExposeDatabaseErrorDetails() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString())).thenThrow(new IllegalStateException("database password=secret"));
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true);
        var body = new ObjectMapper().readTree("{\"store_key\":\"test\",\"items\":[]}");

        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> controller.products("token", body));

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, failure.getStatusCode());
        assertEquals("Unable to stage Shopfront import", failure.getReason());
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
                "validateBusinessImport", String.class, com.fasterxml.jackson.databind.JsonNode.class,
                String.class, long.class, boolean.class, Map.class);
        validate.setAccessible(true);
        ObjectMapper mapper = new ObjectMapper();
        String[] blockedProducts = {
                "{\"source_id\":\"p1\",\"name\":\"Product\",\"price\":5,\"tax_rate_name\":\"GST\"}",
                "{\"source_id\":\"p1\",\"name\":\"Product\",\"case_quantity\":6,\"tax_rate_name\":\"GST\"}",
                "{\"source_id\":\"p1\",\"name\":\"Product\",\"case_quantity\":6,\"price\":5}"
        };

        for (String product : blockedProducts) {
            InvocationTargetException failure = assertThrows(InvocationTargetException.class,
                    () -> validate.invoke(controller, "products", mapper.readTree("[" + product + "]"), "skr", 48L, false, new java.util.HashMap<>()));
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
    void baseShelfPriceIsWrittenToTheMappedOutlet() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        var controller = new ShopfrontIntegrationController(jdbc, new ObjectMapper(), "token", true, true);
        Method upsertPrices = ShopfrontIntegrationController.class.getDeclaredMethod(
                "upsertPrices", long.class, com.fasterxml.jackson.databind.JsonNode.class, long.class);
        upsertPrices.setAccessible(true);
        upsertPrices.invoke(controller, 17L, new ObjectMapper().readTree("{\"price\":9.95,\"prices\":[]}"), 48L);

        verify(jdbc).update(contains("DELETE FROM product_price WHERE product_id=? AND outlet_id=?"), eq(17L), eq(48L));
        verify(jdbc).update(contains("INSERT INTO product_price (product_id,quantity,price,outlet_id) VALUES (?,?,?,?)"),
                eq(17L), eq(BigDecimal.ONE), eq(new BigDecimal("9.95")), eq(48L));
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
