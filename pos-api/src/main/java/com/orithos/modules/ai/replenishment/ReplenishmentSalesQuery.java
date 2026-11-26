package com.orithos.modules.ai.replenishment;

/** Shared sales windows for the store preview and purchase workspace. */
final class ReplenishmentSalesQuery {
    static final String ALCOHOL_SCOPE_PREDICATE = """
            (NOT ? OR (
                concat_ws(' ', p.name, c.name, f.name) ~* '(wine|beer|lager|ale|cider|spirits?|liquor|whisk(y|e)y|bourbon|scotch|gin|vodka|rum|tequila|mezcal|brandy|cognac|liqueur|sake|soju|alcohol|hard seltzer|premix|premixed|rtd|\u8461\u8404\u9152|\u7ea2\u9152|\u767d\u9152|\u5564\u9152|\u6d0b\u9152|\u70c8\u9152|\u679c\u9152|\u7c73\u9152|\u6e05\u9152|\u9152\u7c7b|\u9152\u7cbe\u996e\u6599)'
                AND concat_ws(' ', p.name, c.name, f.name) !~* '(vinegar|wine gum|cider vinegar|\u918b|\u9152\u5fc3\u7cd6)'
            ))
            """;

    static final String CTE = """
                WITH period AS (
                    SELECT ?::date AS today
                ), sales_rows AS (
                    SELECT si.product_id, si.quantity,
                           COALESCE(s.business_date, s.local_sold_at::date,
                               (s.created_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date) AS sale_day,
                           s.updated_at
                    FROM sale s
                    JOIN sale_item si ON si.sale_id = s.id AND si.outlet_id = s.outlet_id
                    CROSS JOIN period
                    WHERE s.outlet_id = ? AND s.status = 'COMPLETED' AND s.refund_reason IS NULL
                      AND s.linked_sale_id IS NULL AND COALESCE(s.total_price, 0) >= 0
                      AND (
                          (s.business_date >= period.today - 55 AND s.business_date <= period.today)
                          OR (s.business_date IS NULL AND s.local_sold_at::date
                              BETWEEN period.today - 55 AND period.today)
                          OR (s.business_date IS NULL AND s.local_sold_at IS NULL
                              AND (s.created_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date
                                  BETWEEN period.today - 55 AND period.today)
                      )
                ), sales AS (
                    SELECT sales_rows.product_id,
                           SUM(sales_rows.quantity) FILTER (WHERE sales_rows.sale_day
                               BETWEEN period.today - 27 AND period.today) AS recent_units,
                           SUM(sales_rows.quantity) FILTER (WHERE sales_rows.sale_day
                               BETWEEN period.today - 55 AND period.today - 28) AS previous_units,
                           MAX(sales_rows.updated_at) AS sales_data_as_of,
                           SUM(sales_rows.quantity) FILTER (WHERE sales_rows.sale_day
                               BETWEEN period.today - 6 AND period.today) AS sold_7d
                    FROM sales_rows
                    CROSS JOIN period
                    GROUP BY sales_rows.product_id
                )
                """;

    static final String SELECTED_MINIMUM_ORDER = """
            COALESCE((SELECT MAX(ps.minimum_order_quantity) FROM product_supplier ps
                      WHERE ps.product_id = p.id AND ps.outlet_id = p.outlet_id
                        AND ps.supplier_id = chosen.id), 1) AS minimum_order
            """;

    static final String SUPPLIER_JOINS = """
            LEFT JOIN LATERAL (
                SELECT COUNT(DISTINCT ps.supplier_id) AS link_count, MIN(ps.supplier_id) AS only_id
                FROM product_supplier ps
                JOIN supplier linked ON linked.id = ps.supplier_id
                    AND linked.outlet_id = ps.outlet_id AND linked.deleted_at IS NULL
                WHERE ps.product_id = p.id AND ps.outlet_id = p.outlet_id
            ) links ON TRUE
            LEFT JOIN supplier core ON core.id = p.core_supplier_id
                AND core.outlet_id = p.outlet_id AND core.deleted_at IS NULL
            LEFT JOIN supplier chosen ON chosen.id = COALESCE(
                core.id, CASE WHEN links.link_count = 1 THEN links.only_id END)
                AND chosen.outlet_id = p.outlet_id AND chosen.deleted_at IS NULL
            """;

    private ReplenishmentSalesQuery() {}
}
