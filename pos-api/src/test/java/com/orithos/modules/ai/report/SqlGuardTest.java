package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlGuardTest {

    private final SqlGuard guard = new SqlGuard(500);

    private static TenantContext store(long outletId) {
        return new TenantContext(1L, 9L, outletId, List.of(outletId), Set.of(TenantContext.PERM_QUERY));
    }

    private void ok(String sql, List<Object> params) {
        assertDoesNotThrow(() -> guard.validate(sql, store(1L), params));
    }

    private void reject(String sql, List<Object> params, String contains) {
        SqlGuardException ex = assertThrows(SqlGuardException.class,
                () -> guard.validate(sql, store(1L), params));
        if (contains != null) {
            assertTrue(ex.getMessage().toLowerCase().contains(contains.toLowerCase()),
                    () -> "expected '" + contains + "' in: " + ex.getMessage());
        }
    }

    @Test
    void acceptsSalesTemplate() {
        ok("""
                SELECT DATE(sold_at) AS d, SUM(amount) AS sales
                FROM ai_rpt_sale_item
                WHERE outlet_id = ?
                  AND sold_at >= ?
                  AND sold_at < ?
                GROUP BY DATE(sold_at)
                ORDER BY d
                LIMIT 366
                """, List.of(1L, "2026-01-01", "2026-01-02"));
    }

    @Test
    void acceptsStockTemplate() {
        ok("""
                SELECT p.id, p.name, i.quantity
                FROM ai_rpt_inventory i
                JOIN ai_rpt_product p ON p.id = i.product_id
                WHERE i.outlet_id = ?
                  AND p.outlet_id = ?
                  AND p.name LIKE ?
                ORDER BY p.name
                LIMIT 50
                """, List.of(1L, 1L, "%cola%"));
    }

    @Test
    void acceptsDeadStockDerivedTable() {
        ok("""
                SELECT p.id, p.name, i.quantity AS on_hand, COALESCE(s.qty, 0) AS sold_qty
                FROM ai_rpt_inventory i
                JOIN ai_rpt_product p ON p.id = i.product_id
                LEFT JOIN (
                  SELECT product_id, SUM(qty) AS qty
                  FROM ai_rpt_sale_item
                  WHERE outlet_id = ? AND sold_at >= ? AND sold_at < ?
                  GROUP BY product_id
                ) s ON s.product_id = i.product_id
                WHERE i.outlet_id = ?
                  AND p.outlet_id = ?
                  AND i.quantity > 0
                  AND COALESCE(s.qty, 0) < 1
                ORDER BY i.quantity DESC
                LIMIT 50
                """, List.of(1L, "a", "b", 1L, 1L));
    }

    @Test
    void acceptsLiteralOutletWhenAuthorized() {
        ok("SELECT name FROM ai_rpt_product WHERE outlet_id = 1 LIMIT 10", List.of());
    }

    @Test
    void rejectsBaseTableSale() {
        reject("SELECT * FROM sale WHERE outlet_id = 1 LIMIT 10", List.of(), "not allowed");
    }

    @Test
    void rejectsMissingOutletPredicate() {
        reject("SELECT SUM(amount) AS sales FROM ai_rpt_sale_item LIMIT 10", List.of(), "outlet_id");
    }

    @Test
    void rejectsOtherOutletForCashier() {
        SqlGuardException ex = assertThrows(SqlGuardException.class,
                () -> guard.validate(
                        "SELECT name FROM ai_rpt_product WHERE outlet_id = 15 LIMIT 10",
                        store(12L), List.of()));
        assertTrue(ex.getMessage().toLowerCase().contains("authorized"));
    }

    @Test
    void rejectsCrossTenantSchemaQualifier() {
        reject("SELECT name FROM orithos_o15.ai_rpt_product WHERE outlet_id = 1 LIMIT 10",
                List.of(), "schema-qualified");
    }

    @Test
    void rejectsUnauthorizedBoundOutlet() {
        reject("""
                SELECT SUM(amount) AS sales FROM ai_rpt_sale_item
                WHERE outlet_id = ? LIMIT 10
                """, List.of(99L), "authorized");
    }

    @Test
    void rejectsComments() {
        reject("SELECT name FROM ai_rpt_product WHERE outlet_id = 1 LIMIT 10 -- secret", List.of(), "comment");
    }

    @Test
    void rejectsBlockComments() {
        reject("SELECT name /* x */ FROM ai_rpt_product WHERE outlet_id = 1 LIMIT 10", List.of(), "comment");
    }

    @Test
    void rejectsInsert() {
        reject("INSERT INTO ai_rpt_product (id) VALUES (1)", List.of(), "read-only");
    }

    @Test
    void rejectsUpdate() {
        reject("UPDATE ai_rpt_inventory SET quantity = 0 WHERE outlet_id = 1", List.of(), "read-only");
    }

    @Test
    void rejectsDelete() {
        reject("DELETE FROM ai_rpt_inventory WHERE outlet_id = 1", List.of(), "read-only");
    }

    @Test
    void rejectsDrop() {
        reject("DROP TABLE ai_rpt_product", List.of(), "read-only");
    }

    @Test
    void rejectsIntoOutfile() {
        reject("SELECT name FROM ai_rpt_product WHERE outlet_id = 1 LIMIT 1 INTO OUTFILE '/tmp/x'",
                List.of(), "read-only");
    }

    @Test
    void rejectsMultipleStatements() {
        reject("SELECT name FROM ai_rpt_product WHERE outlet_id = 1 LIMIT 1; SELECT 1", List.of(), "multiple");
    }

    @Test
    void rejectsMissingLimit() {
        reject("SELECT name FROM ai_rpt_product WHERE outlet_id = 1", List.of(), "limit");
    }

    @Test
    void rejectsLimitAboveMax() {
        reject("SELECT name FROM ai_rpt_product WHERE outlet_id = 1 LIMIT 999", List.of(), "exceeds");
    }

    @Test
    void acceptsUnionWhenBothBranchesFiltered() {
        ok("""
                SELECT name FROM ai_rpt_product WHERE outlet_id = 1
                UNION
                SELECT name FROM ai_rpt_product WHERE outlet_id = 1
                LIMIT 10
                """, List.of());
    }

    @Test
    void rejectsUnionWhenInnerUnfiltered() {
        reject("""
                SELECT name FROM ai_rpt_product WHERE outlet_id = 1
                UNION
                SELECT name FROM ai_rpt_product
                LIMIT 10
                """, List.of(), "filter");
    }

    @Test
    void acceptsWithCte() {
        ok("""
                WITH t AS (
                  SELECT name FROM ai_rpt_product WHERE outlet_id = 1
                )
                SELECT name FROM t
                LIMIT 10
                """, List.of());
    }

    @Test
    void rejectsWithCteMissingInnerFilter() {
        reject("""
                WITH t AS (
                  SELECT name FROM ai_rpt_product
                )
                SELECT name FROM t
                LIMIT 10
                """, List.of(), "filter");
    }

    @Test
    void acceptsAggregateSubqueryWhenInnerFiltered() {
        ok("""
                SELECT p.name, COALESCE(s.qty, 0) AS qty
                FROM ai_rpt_product p
                LEFT JOIN (
                  SELECT product_id, SUM(qty) AS qty
                  FROM ai_rpt_sale_item
                  WHERE outlet_id = 1
                  GROUP BY product_id
                ) s ON s.product_id = p.id
                WHERE p.outlet_id = 1
                LIMIT 50
                """, List.of());
    }

    @Test
    void rejectsSubqueryMissingInnerFilter() {
        reject("""
                SELECT p.name, COALESCE(s.qty, 0) AS qty
                FROM ai_rpt_product p
                LEFT JOIN (
                  SELECT product_id, SUM(qty) AS qty
                  FROM ai_rpt_sale_item
                  GROUP BY product_id
                ) s ON s.product_id = p.id
                WHERE p.outlet_id = 1
                LIMIT 50
                """, List.of(), "filter");
    }

    @Test
    void rejectsOrBypass() {
        reject("SELECT name FROM ai_rpt_product WHERE outlet_id = 1 OR 1 = 1 LIMIT 10",
                List.of(), "filter");
    }

    @Test
    void acceptsCostColumnWithPermission() {
        TenantContext cost = new TenantContext(1L, 9L, 1L, List.of(1L),
                Set.of(TenantContext.PERM_QUERY, TenantContext.PERM_COST));
        assertDoesNotThrow(() -> guard.validate(
                "SELECT last_cost FROM ai_rpt_product WHERE outlet_id = 1 LIMIT 10",
                cost, List.of()));
    }

    @Test
    void rejectsCostViewWithoutPermission() {
        reject("SELECT amount FROM ai_rpt_sale_item_cost WHERE outlet_id = 1 LIMIT 10",
                List.of(), "not allowed");
    }

    @Test
    void acceptsCostViewWithPermission() {
        TenantContext cost = new TenantContext(1L, 9L, 1L, List.of(1L),
                Set.of(TenantContext.PERM_QUERY, TenantContext.PERM_COST));
        assertDoesNotThrow(() -> guard.validate(
                "SELECT amount FROM ai_rpt_sale_item_cost WHERE outlet_id = 1 LIMIT 10",
                cost, List.of()));
    }

    @Test
    void acceptsStockValueCoreViewWithCostPermission() {
        TenantContext cost = new TenantContext(1L, 9L, 1L, List.of(1L),
                Set.of(TenantContext.PERM_QUERY, TenantContext.PERM_COST));
        SqlTenantBinder.BoundSql bound = new SqlTenantBinder(500).bind("""
                WITH store_summary AS (
                  SELECT SUM(i.quantity * c.cost) AS total
                  FROM ai_rpt_inventory i
                  JOIN ai_rpt_product_core p ON p.id = i.product_id AND p.outlet_id = i.outlet_id
                  LEFT JOIN ai_rpt_inventory_cost c ON c.product_id = i.product_id AND c.outlet_id = i.outlet_id
                  WHERE i.quantity > 0
                )
                SELECT total FROM store_summary LIMIT 10
                """, cost);
        assertDoesNotThrow(() -> guard.validate(bound.sql(), cost, bound.params()));
    }

    @Test
    void rejectsStockValueCoreViewWithoutCostPermission() {
        reject("""
                SELECT i.quantity * c.cost
                FROM ai_rpt_inventory i
                JOIN ai_rpt_product_core p ON p.id = i.product_id AND p.outlet_id = i.outlet_id
                JOIN ai_rpt_inventory_cost c ON c.product_id = i.product_id AND c.outlet_id = i.outlet_id
                WHERE i.outlet_id = 1 LIMIT 10
                """, List.of(), "not allowed");
    }

    @Test
    void acceptsCategoryOr() {
        ok("""
                SELECT SUM(si.qty) AS qty, SUM(si.amount) AS sales
                FROM ai_rpt_sale_item si
                JOIN ai_rpt_product p ON p.id = si.product_id
                WHERE si.outlet_id = ?
                  AND p.outlet_id = ?
                  AND (p.category_name LIKE '%Beer%' OR p.category_name LIKE '%啤酒%'
                       OR p.name LIKE '%Beer%' OR p.name LIKE '%啤酒%')
                LIMIT 50
                """, List.of(1L, 1L));
    }

    @Test
    void rejectsUnauthorizedOutletInsideOr() {
        reject("SELECT name FROM ai_rpt_product WHERE outlet_id = 1 OR outlet_id = 2 LIMIT 10",
                List.of(), "authorized");
    }

    @Test
    void rejectsCostColumn() {
        reject("SELECT last_cost FROM ai_rpt_product WHERE outlet_id = 1 LIMIT 10", List.of(), "cost");
    }

    @Test
    void acceptsBeerSqlAfterTenantBind() {
        SqlTenantBinder.BoundSql bound = new SqlTenantBinder(500).bind("""
                SELECT SUM(si.qty) AS qty, SUM(si.amount) AS sales
                FROM ai_rpt_sale_item si
                JOIN ai_rpt_product p ON p.id = si.product_id
                WHERE si.sold_at >= '2026-08-14 00:00:00' AND si.sold_at < '2026-08-15 00:00:00'
                  AND (p.category_name LIKE '%Beer%' OR p.category_name LIKE '%啤酒%'
                       OR p.name LIKE '%Beer%' OR p.name LIKE '%啤酒%')
                LIMIT 50
                """, store(1L));
        ok(bound.sql(), bound.params());
    }

    @Test
    void rejectsEmptySql() {
        reject("   ", List.of(), "empty");
    }

    @Test
    void rejectsUnparseable() {
        reject("SELEKT boom", List.of(), "parse");
    }

    @Test
    void rejectsNonSelect() {
        assertThrows(SqlGuardException.class,
                () -> guard.validate("SHOW TABLES", store(1L), List.of()));
    }
}
