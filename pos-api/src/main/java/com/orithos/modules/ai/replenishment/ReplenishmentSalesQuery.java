package com.orithos.modules.ai.replenishment;

/** Shared sales windows for the store preview and purchase workspace. */
final class ReplenishmentSalesQuery {
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

    private ReplenishmentSalesQuery() {}
}
