package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlTenantBinderTest {

    private final SqlTenantBinder binder = new SqlTenantBinder(500);

    private static TenantContext store(long outletId) {
        return new TenantContext(1L, 9L, outletId, List.of(outletId), Set.of(TenantContext.PERM_QUERY));
    }

    @Test
    void injectsOutletPlaceholderAndKeepsLimit() {
        SqlTenantBinder.BoundSql bound = binder.bind("""
                SELECT SUM(amount) AS sales FROM ai_rpt_sale_item
                WHERE sold_at >= '2026-01-01 00:00:00'
                LIMIT 50
                """, store(7L));
        String sql = bound.sql().toLowerCase();
        assertTrue(sql.contains("outlet_id"));
        assertTrue(sql.contains("limit 50"));
        assertEquals(List.of(7L), bound.params());
        assertFalse(sql.contains("vendor_id"));
    }

    @Test
    void injectsOutletOnEachJoinScan() {
        SqlTenantBinder.BoundSql bound = binder.bind("""
                SELECT SUM(si.qty) AS qty
                FROM ai_rpt_sale_item si
                JOIN ai_rpt_product p ON p.id = si.product_id
                LIMIT 50
                """, store(3L));
        String sql = bound.sql().toLowerCase();
        assertTrue(sql.contains("si.outlet_id"));
        assertTrue(sql.contains("p.outlet_id"));
        assertEquals(List.of(3L, 3L), bound.params());
    }

    @Test
    void injectsOutletOnEachUnionBranch() {
        SqlTenantBinder.BoundSql bound = binder.bind("""
                SELECT name FROM ai_rpt_product
                UNION
                SELECT name FROM ai_rpt_product
                LIMIT 10
                """, store(1L));
        String sql = bound.sql().toLowerCase();
        int first = sql.indexOf("outlet_id");
        int second = sql.indexOf("outlet_id", first + 1);
        assertTrue(first >= 0 && second > first);
        assertEquals(List.of(1L, 1L), bound.params());
        assertTrue(sql.contains("limit 10"));
    }

    @Test
    void injectsOutletInsideWithAndInSubquery() {
        SqlTenantBinder.BoundSql bound = binder.bind("""
                WITH t AS (
                  SELECT id FROM ai_rpt_product
                )
                SELECT name FROM ai_rpt_product
                WHERE id IN (SELECT id FROM t)
                LIMIT 20
                """, store(4L));
        String sql = bound.sql().toLowerCase();
        assertTrue(sql.contains("outlet_id"));
        assertFalse(sql.contains("99"));
        assertEquals(List.of(4L, 4L), bound.params());
    }

    @Test
    void extractSelectKeepsWithClause() {
        String sql = SqlTenantBinder.extractSelect("""
                ```sql
                WITH t AS (SELECT name FROM ai_rpt_product)
                SELECT name FROM t LIMIT 10
                ```
                """);
        assertNotNull(sql);
        assertTrue(sql.toLowerCase().startsWith("with"));
    }

    @Test
    void stripsModelWrittenOutletId() {
        SqlTenantBinder.BoundSql bound = binder.bind("""
                SELECT name FROM ai_rpt_product WHERE outlet_id = 99 LIMIT 10
                """, store(1L));
        assertFalse(bound.sql().contains("99"));
        assertEquals(List.of(1L), bound.params());
        assertTrue(bound.sql().toLowerCase().contains("outlet_id"));
    }

    @Test
    void capsMissingOrOversizedLimit() {
        SqlTenantBinder.BoundSql noLimit = binder.bind(
                "SELECT name FROM ai_rpt_product", store(1L));
        assertTrue(noLimit.sql().toLowerCase().contains("limit 500"));

        SqlTenantBinder.BoundSql tooBig = binder.bind(
                "SELECT name FROM ai_rpt_product LIMIT 9999", store(1L));
        assertTrue(tooBig.sql().toLowerCase().contains("limit 500"));
        assertFalse(tooBig.sql().contains("9999"));
    }

    @Test
    void extractSelectFromMarkdownFence() {
        String raw = """
                Sure.
                ```sql
                SELECT SUM(qty) AS qty FROM ai_rpt_sale_item LIMIT 50
                ```
                """;
        assertEquals("SELECT SUM(qty) AS qty FROM ai_rpt_sale_item LIMIT 50",
                SqlTenantBinder.extractSelect(raw));
    }

    @Test
    void extractSelectIgnoresDrop() {
        assertNull(SqlTenantBinder.extractSelect("帮我 DROP 表"));
        assertNull(SqlTenantBinder.extractSelect("DROP TABLE ai_rpt_product"));
    }

    @Test
    void extractSelectTakesFirstStatementOnly() {
        String sql = SqlTenantBinder.extractSelect(
                "SELECT name FROM ai_rpt_product LIMIT 1; DROP TABLE x");
        assertNotNull(sql);
        assertFalse(sql.toLowerCase().contains("drop"));
        assertTrue(sql.toLowerCase().startsWith("select"));
    }
}
