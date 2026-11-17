package com.orithos.modules.report;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ShopfrontCostContractSqlTest {
    @Test
    void aiInventoryCostViewExcludesPercentageCostsFromCurrencyValues() throws IOException {
        String sql = resource("/db/migration_ai_report_views.sql");

        assertTrue(sql.contains("CASE WHEN p.cost_percentage <> 0 THEN NULL ELSE"));
        assertTrue(sql.contains("CASE WHEN p.cost_percentage <> 0 THEN NULL ELSE p.case_cost END AS case_cost"));
    }

    @Test
    void productInventoryValuationExcludesPercentageCosts() throws IOException {
        String sql = resource("/mapper/ProductMapper.xml");

        assertTrue(sql.contains("CASE WHEN p.cost_percentage &lt;&gt; 0 THEN 0"));
    }

    private static String resource(String name) throws IOException {
        try (InputStream input = ShopfrontCostContractSqlTest.class.getResourceAsStream(name)) {
            assertNotNull(input, name);
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
