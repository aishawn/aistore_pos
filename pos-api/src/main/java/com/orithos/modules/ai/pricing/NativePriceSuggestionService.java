package com.orithos.modules.ai.pricing;

import com.orithos.modules.ai.report.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Builds margin review suggestions only from the tenant's Orithos catalogue and ledger. */
@Service
public class NativePriceSuggestionService {
    private static final double DEFAULT_MARGIN = 0.30;

    private final JdbcTemplate jdbc;

    public NativePriceSuggestionService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public PriceReviewBrief review(TenantContext tenant) { return review(tenant, DEFAULT_MARGIN); }

    public PriceReviewBrief review(TenantContext tenant, double marginTarget) {
        if (tenant == null || tenant.requireOutletId() == null || !tenant.canQueryCost()) return null;
        double margin = marginTarget > 0 && marginTarget < 1 ? marginTarget : DEFAULT_MARGIN;
        List<Row> rows = jdbc.query("""
                WITH sold AS (
                    SELECT si.product_id, SUM(si.quantity) AS units
                    FROM sale s JOIN sale_item si ON si.sale_id = s.id AND si.outlet_id = s.outlet_id
                    WHERE s.outlet_id = ? AND s.status = 'COMPLETED' AND s.refund_reason IS NULL
                      AND COALESCE(s.business_date, s.local_sold_at::date)
                          >= (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 28
                    GROUP BY si.product_id
                )
                SELECT p.id, p.name,
                       (SELECT pp.price FROM product_price pp
                        WHERE pp.product_id = p.id AND pp.outlet_id = p.outlet_id
                        ORDER BY pp.quantity, pp.id LIMIT 1) AS current_price,
                       CASE WHEN p.cost_percentage <> 0 THEN NULL ELSE
                           COALESCE(pc.average_cost, pc.cost,
                               CASE WHEN p.shopfront_source_updated_at IS NULL OR p.case_cost IS NOT NULL
                                    THEN p.cost END)
                       END AS unit_cost,
                       tr.amount AS tax_percent,
                       COALESCE(s.units, 0) AS sold_units
                FROM product p
                LEFT JOIN product_cost pc ON pc.product_id = p.id AND pc.outlet_id = p.outlet_id
                LEFT JOIN tax_rate tr ON tr.id = p.tax_rate_id AND tr.outlet_id = p.outlet_id AND tr.deleted_at IS NULL
                LEFT JOIN sold s ON s.product_id = p.id
                WHERE p.outlet_id = ? AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
                ORDER BY sold_units DESC, p.name, p.id
                LIMIT 80
                """, (rs, rowNum) -> new Row(rs.getLong("id"), rs.getString("name"),
                number(rs.getObject("current_price")), number(rs.getObject("unit_cost")),
                number(rs.getObject("tax_percent")), number(rs.getObject("sold_units"))),
                tenant.requireOutletId(), tenant.requireOutletId());

        List<PriceReviewItem> reviews = new ArrayList<>();
        for (Row row : rows) {
            if (row.price() == null || row.price() <= 0) {
                reviews.add(new PriceReviewItem(row.id(), row.name(), row.soldUnits(), null, null, "unsaleable"));
                continue;
            }
            if (row.cost() == null || row.cost() <= 0) {
                reviews.add(new PriceReviewItem(row.id(), row.name(), row.soldUnits(), row.price(), null, "missing_cost"));
                continue;
            }
            if (row.taxPercent() == null || row.taxPercent() < 0) {
                reviews.add(new PriceReviewItem(row.id(), row.name(), row.soldUnits(), row.price(), null, "review_tax"));
                continue;
            }
            List<SuggestionTax> taxes = List.of(new SuggestionTax(0, row.taxPercent(), "percent", true, false));
            PriceSuggestionMath.TaxTotals current = PriceSuggestionMath.computeSimpleTaxTotals(row.price(), taxes);
            Double target = PriceSuggestionMath.suggestedListPrice(row.cost(), margin, taxes);
            if (current == null || target == null) {
                reviews.add(new PriceReviewItem(row.id(), row.name(), row.soldUnits(), row.price(), null, "review_tax"));
            } else if (PriceSuggestionMath.netMargin(current.totalExcluded(), row.cost()) != null
                    && PriceSuggestionMath.netMargin(current.totalExcluded(), row.cost()) + 0.005 < margin) {
                reviews.add(new PriceReviewItem(row.id(), row.name(), row.soldUnits(), current.totalIncluded(),
                        target > current.totalIncluded() ? target : null,
                        target > current.totalIncluded() ? "raise" : "review_cost"));
            } else {
                reviews.add(new PriceReviewItem(row.id(), row.name(), row.soldUnits(), current.totalIncluded(), null, "ok"));
            }
        }
        return new PriceReviewBrief(margin, reviews.stream()
                .filter(row -> "raise".equals(row.status()) || row.status().startsWith("review_"))
                .sorted(Comparator.comparingDouble(PriceReviewItem::soldUnits).reversed().thenComparing(PriceReviewItem::name))
                .limit(3).toList());
    }

    private static Double number(Object value) {
        return value instanceof Number number ? number.doubleValue() : null;
    }

    private record Row(long id, String name, Double price, Double cost, Double taxPercent, double soldUnits) { }
}
