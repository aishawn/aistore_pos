package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Builds a read-only reorder preview from the tenant's Orithos ledger. */
@Service
public class NativeReplenishmentService {
    private static final int PERIOD_DAYS = 28;
    private static final int DEFAULT_COVERAGE_DAYS = 21;

    private final JdbcTemplate jdbc;

    public NativeReplenishmentService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public ReplenishmentPlan plan(TenantContext tenant) {
        return plan(tenant, DEFAULT_COVERAGE_DAYS);
    }

    public ReplenishmentPlan plan(TenantContext tenant, int coverageDays) {
        return plan(tenant, coverageDays, 3);
    }

    public ReplenishmentPlan plan(TenantContext tenant, int coverageDays, int suggestionLimit) {
        if (tenant == null || tenant.requireOutletId() == null) return null;
        int cover = coverageDays > 0 ? Math.min(coverageDays, 180) : DEFAULT_COVERAGE_DAYS;
        int limit = Math.max(1, Math.min(50, suggestionLimit));
        List<Row> rows = jdbc.query("""
                WITH sales AS (
                    SELECT si.product_id,
                           SUM(si.quantity) FILTER (WHERE COALESCE(s.business_date, s.local_sold_at::date)
                               >= (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 28) AS recent_units,
                           SUM(si.quantity) FILTER (WHERE COALESCE(s.business_date, s.local_sold_at::date)
                               < (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 28) AS previous_units
                    FROM sale s
                    JOIN sale_item si ON si.sale_id = s.id AND si.outlet_id = s.outlet_id
                    WHERE s.outlet_id = ? AND s.status = 'COMPLETED' AND s.refund_reason IS NULL
                      AND COALESCE(s.business_date, s.local_sold_at::date)
                          >= (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 56
                    GROUP BY si.product_id
                )
                SELECT p.id, p.name, p.case_quantity, i.quantity AS on_hand,
                       COALESCE(i.on_order, 0) AS on_order,
                       COALESCE(s.recent_units, 0) AS recent_units,
                       COALESCE(s.previous_units, 0) AS previous_units,
                       EXISTS (SELECT 1 FROM product_supplier ps
                               WHERE ps.product_id = p.id AND ps.outlet_id = p.outlet_id) AS has_supplier,
                       COALESCE((SELECT MAX(ps.minimum_order_quantity) FROM product_supplier ps
                                 WHERE ps.product_id = p.id AND ps.outlet_id = p.outlet_id), 1) AS minimum_order
                FROM product p
                LEFT JOIN product_inventory i ON i.product_id = p.id AND i.outlet_id = p.outlet_id
                LEFT JOIN sales s ON s.product_id = p.id
                WHERE p.outlet_id = ? AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
                ORDER BY p.name, p.id
                """, (rs, rowNum) -> new Row(rs.getLong("id"), rs.getString("name"),
                rs.getDouble("case_quantity"), asDouble(rs.getObject("on_hand")), rs.getDouble("on_order"),
                rs.getDouble("recent_units"), rs.getDouble("previous_units"), rs.getBoolean("has_supplier"),
                rs.getDouble("minimum_order")), tenant.requireOutletId(), tenant.requireOutletId());

        List<ReplenishmentSuggestion> suggestions = new ArrayList<>();
        List<String> gaps = new ArrayList<>();
        for (Row row : rows) {
            if (row.onHand() == null) {
                gaps.add(row.name() + ": inventory unavailable");
                continue;
            }
            if (!row.hasSupplier()) {
                gaps.add(row.name() + ": supplier unavailable");
                continue;
            }
            double recentPerDay = row.recentUnits() / PERIOD_DAYS;
            double previousPerDay = row.previousUnits() / PERIOD_DAYS;
            double demand = recentPerDay > 0 && previousPerDay > 0
                    ? recentPerDay * 0.7 + previousPerDay * 0.3
                    : Math.max(recentPerDay, previousPerDay);
            double available = row.onHand() + row.onOrder();
            double casePack = Math.max(1d, row.caseQuantity());
            double minimum = Math.max(1d, row.minimumOrder());
            double raw = Math.max(0d, demand * cover - available);
            double quantity = raw == 0 ? 0 : Math.ceil(Math.max(raw, minimum) / casePack) * casePack;
            if (quantity <= 0) continue;
            suggestions.add(new ReplenishmentSuggestion(row.id(), row.name(), "units", quantity,
                    demand > 0 ? available / demand : null, demand, row.onHand(), available));
        }
        suggestions.sort(Comparator.comparingDouble(ReplenishmentSuggestion::suggestedQuantity).reversed()
                .thenComparing(Comparator.comparingDouble(ReplenishmentSuggestion::unitsPerDay).reversed())
                .thenComparing(ReplenishmentSuggestion::name));
        return new ReplenishmentPlan(cover, suggestions.size(), suggestions.stream().limit(limit).toList(),
                gaps.isEmpty() ? "VALID" : "DATA_INCOMPLETE", gaps.stream().distinct().limit(20).toList(), Instant.now());
    }

    private record Row(long id, String name, double caseQuantity, Double onHand, double onOrder,
                       double recentUnits, double previousUnits, boolean hasSupplier, double minimumOrder) { }

    private static Double asDouble(Object value) {
        return value instanceof Number number ? number.doubleValue() : null;
    }
}
