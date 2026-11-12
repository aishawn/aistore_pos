package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/** Builds a read-only reorder preview from the tenant's Orithos ledger. */
@Service
public class NativeReplenishmentService {
    private static final int PERIOD_DAYS = 28;
    private static final int DEFAULT_COVERAGE_DAYS = 21;
    private static final int QUERY_TIMEOUT_SECONDS = 5;
    private static final long CACHE_TTL_MILLIS = 15_000;

    private final JdbcTemplate jdbc;
    private final LongSupplier currentTimeMillis;
    private final ConcurrentHashMap<CacheKey, CachedPlan> cache = new ConcurrentHashMap<>();

    public NativeReplenishmentService(JdbcTemplate jdbc) {
        this(jdbc, System::currentTimeMillis);
    }

    NativeReplenishmentService(JdbcTemplate jdbc, LongSupplier currentTimeMillis) {
        this.jdbc = jdbc;
        this.currentTimeMillis = currentTimeMillis;
    }

    public ReplenishmentPlan plan(TenantContext tenant) {
        return plan(tenant, DEFAULT_COVERAGE_DAYS);
    }

    public ReplenishmentPlan plan(TenantContext tenant, int coverageDays) {
        return plan(tenant, coverageDays, 3);
    }

    public ReplenishmentPlan plan(TenantContext tenant, int coverageDays, int suggestionLimit) {
        if (tenant == null || tenant.requireOutletId() == null) return null;
        if (!tenant.canQueryReport()) {
            throw new AccessDeniedException("AI report query permission is required");
        }
        int cover = coverageDays > 0 ? Math.min(coverageDays, 180) : DEFAULT_COVERAGE_DAYS;
        int limit = Math.max(1, Math.min(50, suggestionLimit));
        CacheKey key = new CacheKey(tenant.vendorId(), tenant.requireOutletId(), cover, limit);
        long now = currentTimeMillis.getAsLong();
        cache.entrySet().removeIf(entry -> entry.getValue().expiresAtMillis() <= now);
        CachedPlan cached = cache.get(key);
        if (cached != null && cached.expiresAtMillis() > now) return cached.plan();
        if (cached != null) cache.remove(key, cached);
        return cache.computeIfAbsent(key, ignored -> new CachedPlan(calculate(tenant, cover, limit),
                currentTimeMillis.getAsLong() + CACHE_TTL_MILLIS)).plan();
    }

    private ReplenishmentPlan calculate(TenantContext tenant, int cover, int limit) {
        List<Row> rows = jdbc.query(connection -> {
            var statement = connection.prepareStatement("""
                WITH sales AS (
                    SELECT si.product_id,
                           SUM(si.quantity) FILTER (WHERE COALESCE(s.business_date, s.local_sold_at::date)
                               >= (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 28) AS recent_units,
                           SUM(si.quantity) FILTER (WHERE COALESCE(s.business_date, s.local_sold_at::date)
                               < (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 28) AS previous_units,
                           MAX(s.updated_at) AS sales_data_as_of
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
                       s.sales_data_as_of,
                       EXISTS (SELECT 1 FROM product_supplier ps
                               WHERE ps.product_id = p.id AND ps.outlet_id = p.outlet_id) AS has_supplier,
                       COALESCE((SELECT MAX(ps.minimum_order_quantity) FROM product_supplier ps
                                 WHERE ps.product_id = p.id AND ps.outlet_id = p.outlet_id), 1) AS minimum_order
                FROM product p
                LEFT JOIN product_inventory i ON i.product_id = p.id AND i.outlet_id = p.outlet_id
                LEFT JOIN sales s ON s.product_id = p.id
                WHERE p.outlet_id = ? AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
                ORDER BY p.name, p.id
                """);
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setLong(1, tenant.requireOutletId());
            statement.setLong(2, tenant.requireOutletId());
            return statement;
        }, (rs, rowNum) -> new Row(rs.getLong("id"), rs.getString("name"),
                rs.getDouble("case_quantity"), asDouble(rs.getObject("on_hand")), rs.getDouble("on_order"),
                rs.getDouble("recent_units"), rs.getDouble("previous_units"), rs.getBoolean("has_supplier"),
                rs.getDouble("minimum_order"), timestampInstant(rs.getTimestamp("sales_data_as_of"))));

        List<ReplenishmentSuggestion> suggestions = new ArrayList<>();
        List<String> gaps = new ArrayList<>();
        Instant dataAsOf = rows.stream().map(Row::salesDataAsOf).filter(java.util.Objects::nonNull)
                .max(Instant::compareTo).orElse(null);
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
                gaps.isEmpty() ? "VALID" : "DATA_INCOMPLETE", gaps.stream().distinct().limit(20).toList(), dataAsOf);
    }

    private record Row(long id, String name, double caseQuantity, Double onHand, double onOrder,
                       double recentUnits, double previousUnits, boolean hasSupplier, double minimumOrder,
                       Instant salesDataAsOf) { }

    private record CacheKey(long vendorId, long outletId, int coverageDays, int suggestionLimit) { }
    private record CachedPlan(ReplenishmentPlan plan, long expiresAtMillis) { }

    private static Double asDouble(Object value) {
        return value instanceof Number number ? number.doubleValue() : null;
    }

    private static Instant timestampInstant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }
}
