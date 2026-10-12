package com.orithos.modules.ai.report;

import org.springframework.stereotype.Component;

import java.sql.Date;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Component
public class ReportTemplateRegistry {

    public static final Set<String> TEMPLATE_INTENTS = Set.of(
            "report_sales", "report_qty", "report_aov", "report_stock", "report_dead_stock"
    );

    /** Classifier often stuffs the metric word into category ("销量"), which matches no product. */
    private static final Set<String> METRIC_CATEGORY = Set.of(
            "销量", "销售额", "流水", "营收", "客单", "客单价", "库存", "滞销",
            "sales", "revenue", "takings", "quantity", "qty", "stock", "units", "aov"
    );

    public record BoundSql(String sql, List<Object> params, String error) {
        public static BoundSql ok(String sql, List<Object> params) {
            return new BoundSql(sql, params, null);
        }

        public static BoundSql fail(String error) {
            return new BoundSql(null, List.of(), error);
        }
    }

    public BoundSql bind(String intent, TenantContext tenant, Map<String, String> slots,
                         ReportPeriodResolver.Window window) {
        Long outletId = tenant == null ? null : tenant.requireOutletId();
        if (outletId == null) {
            return BoundSql.fail("NO_OUTLET");
        }
        if (tenant != null && !tenant.canQueryReport()) {
            return BoundSql.fail("NO_PERMISSION");
        }
        String category = sanitizeCategory(slots == null ? null : slots.get("category"));
        String query = blankToNull(slots == null ? null : slots.get("query"));
        Date fromDay = Date.valueOf(window.from().toLocalDate());
        Date toDay = Date.valueOf(window.toExclusive().toLocalDate());

        return switch (intent) {
            case "report_sales" -> sales(outletId, fromDay, toDay, category, "amount");
            case "report_qty" -> sales(outletId, fromDay, toDay, category, "qty");
            case "report_aov" -> BoundSql.ok("""
                    SELECT COUNT(*) AS tickets, COALESCE(SUM(amount), 0) AS sales,
                           CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(SUM(amount) / COUNT(*), 2) END AS aov
                    FROM ai_rpt_customer_sale
                    WHERE outlet_id = ?
                      AND business_date >= ?
                      AND business_date < ?
                    LIMIT 1
                    """, List.of(outletId, fromDay, toDay));
            case "report_stock" -> {
                if (query == null) {
                    yield BoundSql.fail("NEED_PRODUCT");
                }
                yield BoundSql.ok("""
                        SELECT p.id, p.name, i.quantity
                        FROM ai_rpt_inventory i
                        JOIN ai_rpt_product p ON p.id = i.product_id
                        WHERE i.outlet_id = ?
                          AND p.outlet_id = ?
                          AND p.name LIKE ?
                        ORDER BY p.name
                        LIMIT 50
                        """, List.of(outletId, outletId, "%" + query + "%"));
            }
            case "report_dead_stock" -> BoundSql.ok("""
                    SELECT p.id, p.name, i.quantity AS on_hand, COALESCE(s.qty, 0) AS sold_qty
                    FROM ai_rpt_inventory i
                    JOIN ai_rpt_product p ON p.id = i.product_id
                    LEFT JOIN (
                      SELECT product_id, SUM(qty) AS qty
                      FROM ai_rpt_sale_item
                      WHERE outlet_id = ? AND business_date >= ? AND business_date < ?
                      GROUP BY product_id
                    ) s ON s.product_id = i.product_id
                    WHERE i.outlet_id = ?
                      AND p.outlet_id = ?
                      AND i.quantity > 0
                      AND COALESCE(s.qty, 0) < 1
                    ORDER BY i.quantity DESC
                    LIMIT 50
                    """, List.of(outletId, fromDay, toDay, outletId, outletId));
            default -> BoundSql.fail("UNKNOWN_TEMPLATE");
        };
    }

    private BoundSql sales(long outletId, Date from, Date to, String category, String metric) {
        String agg = "qty".equals(metric) ? "SUM(si.qty) AS qty" : "SUM(si.amount) AS sales";
        List<String> terms = CategoryLexicon.searchTerms(category);
        if (!terms.isEmpty()) {
            List<Object> params = new ArrayList<>();
            params.add(outletId);
            params.add(outletId);
            params.add(from);
            params.add(to);
            StringBuilder pred = new StringBuilder("(");
            for (int i = 0; i < terms.size(); i++) {
                if (i > 0) {
                    pred.append(" OR ");
                }
                pred.append("p.category_name LIKE ? OR p.name LIKE ?");
                String like = "%" + terms.get(i) + "%";
                params.add(like);
                params.add(like);
            }
            pred.append(")");
            return BoundSql.ok("""
                    SELECT si.business_date AS date, %s
                    FROM ai_rpt_sale_item si
                    JOIN ai_rpt_product p ON p.id = si.product_id
                    WHERE si.outlet_id = ?
                      AND p.outlet_id = ?
                      AND si.business_date >= ?
                      AND si.business_date < ?
                      AND %s
                    GROUP BY si.business_date
                    ORDER BY date
                    LIMIT 366
                    """.formatted(agg, pred), params);
        }
        String col = "qty".equals(metric) ? "SUM(qty) AS qty" : "SUM(amount) AS sales";
        return BoundSql.ok("""
                SELECT business_date AS date, %s
                FROM ai_rpt_sale_item
                WHERE outlet_id = ?
                  AND business_date >= ?
                  AND business_date < ?
                GROUP BY business_date
                ORDER BY date
                LIMIT 366
                """.formatted(col), List.of(outletId, from, to));
    }

    static String sanitizeCategory(String raw) {
        String v = blankToNull(raw);
        if (v == null) {
            return null;
        }
        String key = v.toLowerCase(Locale.ROOT);
        if (METRIC_CATEGORY.contains(v) || METRIC_CATEGORY.contains(key)) {
            return null;
        }
        return v;
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }
}
