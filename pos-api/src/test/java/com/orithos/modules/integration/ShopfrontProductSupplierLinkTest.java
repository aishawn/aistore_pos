package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class ShopfrontProductSupplierLinkTest {
    @Test
    void linksCoreAndLastSuppliersWhenLastSupplierIsNotInSupplierList() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        var controller = new ShopfrontIntegrationController(mock(JdbcTemplate.class), mapper, "token", true, true);
        Class<?> batchType = Class.forName(
                "com.orithos.modules.integration.ShopfrontIntegrationController$ProductImportBatch");
        Constructor<?> batchConstructor = batchType.getDeclaredConstructor();
        batchConstructor.setAccessible(true);
        Object batch = batchConstructor.newInstance();

        Field mappingsField = batchType.getDeclaredField("supplierMappings");
        mappingsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Long> mappings = (Map<String, Long>) mappingsField.get(batch);
        mappings.putAll(Map.of("supplier-core", 101L, "supplier-last", 202L));

        JsonNode item = mapper.readTree("""
                {
                  "suppliers": [{"id": "supplier-core", "code": "CORE-1", "minimumOrderQuantity": 2}],
                  "coreSupplier": {"id": "supplier-core"},
                  "lastSupplier": {"id": "supplier-last"}
                }
                """);
        Method collect = ShopfrontIntegrationController.class.getDeclaredMethod(
                "collectProductSuppliers", long.class, JsonNode.class, String.class, long.class, batchType);
        collect.setAccessible(true);
        collect.invoke(controller, 42L, item, "skr", 87L, batch);

        Field linksField = batchType.getDeclaredField("supplierLinks");
        linksField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Object[]> links = (Map<String, Object[]>) linksField.get(batch);

        assertEquals(2, links.size());
        assertTrue(links.containsKey("42:101"));
        assertTrue(links.containsKey("42:202"));
    }
}
