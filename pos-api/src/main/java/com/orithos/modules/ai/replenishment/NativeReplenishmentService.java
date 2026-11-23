package com.orithos.modules.ai.replenishment;

import com.orithos.config.CorrelationIdContext;
import com.orithos.common.AustraliaTime;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.ai.report.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/** Builds a read-only reorder preview from the tenant's Orithos ledger. */
@Service
public class NativeReplenishmentService {
    private static final Logger log = LoggerFactory.getLogger(NativeReplenishmentService.class);
    private static final int PERIOD_DAYS = 28;
    private static final int DEFAULT_COVERAGE_DAYS = 21;
    private static final int QUERY_TIMEOUT_SECONDS = 5;
    private static final long CACHE_TTL_MILLIS = 15_000;
    private static final long INVENTORY_MAX_AGE_MILLIS = java.time.Duration.ofHours(24).toMillis();

    private final JdbcTemplate jdbc;
    private final LongSupplier currentTimeMillis;
    private final BusinessTimezoneService businessTimezone;
    private final ConcurrentHashMap<CacheKey, CachedPlan> cache = new ConcurrentHashMap<>();

    public NativeReplenishmentService(JdbcTemplate jdbc) {
        this(jdbc, System::currentTimeMillis, null);
    }

    @Autowired
    public NativeReplenishmentService(JdbcTemplate jdbc, BusinessTimezoneService businessTimezone) {
        this(jdbc, System::currentTimeMillis, businessTimezone);
    }

    NativeReplenishmentService(JdbcTemplate jdbc, LongSupplier currentTimeMillis) {
        this(jdbc, currentTimeMillis, null);
    }

    NativeReplenishmentService(JdbcTemplate jdbc, LongSupplier currentTimeMillis,
                              BusinessTimezoneService businessTimezone) {
        this.jdbc = jdbc;
        this.currentTimeMillis = currentTimeMillis;
        this.businessTimezone = businessTimezone;
    }

    public ReplenishmentPlan plan(TenantContext tenant) {
        return plan(tenant, DEFAULT_COVERAGE_DAYS);
    }

    public ReplenishmentPlan plan(TenantContext tenant, int coverageDays) {
        return plan(tenant, coverageDays, 3);
    }

    public ReplenishmentPlan plan(TenantContext tenant, int coverageDays, int suggestionLimit) {
        long startedAt = System.nanoTime();
        String correlationId = CorrelationIdContext.current();
        if (tenant == null || tenant.requireOutletId() == null) {
            log.warn("AI replenishment query failed correlationId={} category=tenant_unavailable elapsedMs={} dataGapCount=unknown",
                    correlationId, elapsedMs(startedAt));
            return null;
        }
        if (!tenant.canQueryReport()) {
            log.warn("AI replenishment query failed correlationId={} category=permission elapsedMs={} dataGapCount=0",
                    correlationId, elapsedMs(startedAt));
            throw new AccessDeniedException("AI report query permission is required");
        }
        int cover = coverageDays > 0 ? Math.min(coverageDays, 180) : DEFAULT_COVERAGE_DAYS;
        int limit = Math.max(1, Math.min(50, suggestionLimit));
        long now = currentTimeMillis.getAsLong();
        ZoneId zone = businessTimezone == null ? AustraliaTime.ZONE : businessTimezone.zoneForVendor(tenant.vendorId());
        LocalDate today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        CacheKey key = new CacheKey(tenant.vendorId(), tenant.requireOutletId(), cover, limit, today, zone);
        cache.entrySet().removeIf(entry -> entry.getValue().expiresAtMillis() <= now);
        CachedPlan cached = cache.get(key);
        if (cached != null && cached.expiresAtMillis() > now) {
            logPlan(correlationId, startedAt, cached.plan(), true);
            return cached.plan();
        }
        if (cached != null) cache.remove(key, cached);
        try {
            ReplenishmentPlan plan = cache.computeIfAbsent(key, ignored -> new CachedPlan(calculate(tenant, cover, limit, today, zone),
                    currentTimeMillis.getAsLong() + CACHE_TTL_MILLIS)).plan();
            logPlan(correlationId, startedAt, plan, false);
            return plan;
        } catch (RuntimeException e) {
            log.warn("AI replenishment query failed correlationId={} category={} elapsedMs={} dataGapCount=unknown exceptionType={}",
                    correlationId, failureCategory(e), elapsedMs(startedAt), e.getClass().getSimpleName());
            throw e;
        }
    }

    private static void logPlan(String correlationId, long startedAt, ReplenishmentPlan plan, boolean cacheHit) {
        log.info("AI replenishment query completed correlationId={} category=none elapsedMs={} dataGapCount={} dataStatus={} cacheHit={}",
                correlationId, elapsedMs(startedAt), plan.dataGapCount(), plan.dataQualityStatus(), cacheHit);
    }

    private static int elapsedMs(long startedAt) {
        return (int) Math.max(0, (System.nanoTime() - startedAt) / 1_000_000L);
    }

    private static String failureCategory(Throwable error) {
        java.util.Set<Throwable> seen = java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        for (Throwable current = error; current != null && seen.add(current); current = current.getCause()) {
            if (current instanceof java.util.concurrent.TimeoutException
                    || current.getClass().getSimpleName().toLowerCase(java.util.Locale.ROOT).contains("timeout")) {
                return "timeout";
            }
            if (current instanceof DataAccessException || current instanceof SQLException) return "data_access";
        }
        return "service";
    }

    private ReplenishmentPlan calculate(TenantContext tenant, int cover, int limit, LocalDate today, ZoneId zone) {
        LocalDate from = today.minusDays(2L * PERIOD_DAYS - 1);
        List<Row> rows = jdbc.query(connection -> {
            var statement = connection.prepareStatement(ReplenishmentSalesQuery.CTE + """
                SELECT p.id, p.name, p.case_quantity, i.quantity AS on_hand, i.updated_at AS inventory_data_as_of,
                       COALESCE(i.on_order, 0) AS on_order,
                       COALESCE(s.recent_units, 0) AS recent_units,
                       COALESCE(s.previous_units, 0) AS previous_units,
                       s.sales_data_as_of,
                       chosen.id IS NOT NULL AS has_supplier,
                       chosen.lead_time_days,
                       cost.cost > 0 AS has_recorded_cost,
                """ + ReplenishmentSalesQuery.SELECTED_MINIMUM_ORDER + """
                FROM product p
                LEFT JOIN product_inventory i ON i.product_id = p.id AND i.outlet_id = p.outlet_id
                LEFT JOIN sales s ON s.product_id = p.id
                LEFT JOIN ai_rpt_inventory_cost cost ON cost.product_id = p.id AND cost.outlet_id = p.outlet_id
                """ + ReplenishmentSalesQuery.SUPPLIER_JOINS + """
                WHERE p.outlet_id = ? AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
                  AND p.track_inventory = 1
                ORDER BY COALESCE(s.sold_7d, 0) DESC, COALESCE(s.recent_units, 0) DESC, p.name, p.id
                """);
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setObject(1, today);
            statement.setString(2, zone.getId());
            statement.setLong(3, tenant.requireOutletId());
            statement.setString(4, zone.getId());
            statement.setLong(5, tenant.requireOutletId());
            return statement;
        }, (rs, rowNum) -> new Row(rs.getLong("id"), rs.getString("name"),
                rs.getDouble("case_quantity"), asDouble(rs.getObject("on_hand")), rs.getDouble("on_order"),
                rs.getDouble("recent_units"), rs.getDouble("previous_units"), rs.getBoolean("has_supplier"),
                rs.getBoolean("has_recorded_cost"),
                rs.getDouble("minimum_order"), rs.getObject("lead_time_days", Integer.class),
                timestampInstant(rs.getTimestamp("sales_data_as_of")),
                timestampInstant(rs.getTimestamp("inventory_data_as_of"))));

        List<ReplenishmentSuggestion> suggestions = new ArrayList<>();
        List<String> gaps = new ArrayList<>();
        int dataGapCount = 0;
        int inventoryGapCount = 0;
        int supplierGapCount = 0;
        int costGapCount = 0;
        Instant salesDataAsOf = rows.stream().map(Row::salesDataAsOf).filter(java.util.Objects::nonNull)
                .max(Instant::compareTo).orElse(null);
        if (salesDataAsOf == null) {
            return new ReplenishmentPlan(cover, 0, List.of(), "NO_DATA",
                    List.of("sales history unavailable"), null, rows.size(), 0, 0, 0, from, today, zone.getId());
        }
        Instant inventoryDataAsOf = rows.stream().map(Row::inventoryDataAsOf).filter(java.util.Objects::nonNull)
                .max(Instant::compareTo).orElse(null);
        Instant dataAsOf = inventoryDataAsOf == null || salesDataAsOf.isAfter(inventoryDataAsOf)
                ? salesDataAsOf : inventoryDataAsOf;
        long now = currentTimeMillis.getAsLong();
        long inventoryFreshnessCutoff = now - INVENTORY_MAX_AGE_MILLIS;
        for (Row row : rows) {
            if (row.onHand() == null || row.inventoryDataAsOf() == null
                    || row.inventoryDataAsOf().toEpochMilli() < inventoryFreshnessCutoff
                    || row.inventoryDataAsOf().toEpochMilli() > now) {
                dataGapCount++;
                inventoryGapCount++;
                String reason = row.onHand() == null ? "inventory unavailable"
                        : row.inventoryDataAsOf() == null ? "inventory timestamp unavailable" : "inventory data stale";
                gaps.add(row.name() + ": " + reason);
                continue;
            }
            if (row.onHand() < 0) {
                dataGapCount++;
                inventoryGapCount++;
                gaps.add(row.name() + ": negative stock; stock reconciliation needed");
                continue;
            }
            double recentPerDay = row.recentUnits() / PERIOD_DAYS;
            double previousPerDay = row.previousUnits() / PERIOD_DAYS;
            double demand = recentPerDay > 0 && previousPerDay > 0
                    ? recentPerDay * 0.7 + previousPerDay * 0.3
                    : Math.max(recentPerDay, previousPerDay);
            if (demand <= 0) continue;
            double available = row.onHand() + row.onOrder();
            int effectiveCoverage = ReplenishmentDecisionEngine.effectiveCoverage(cover, row.leadTimeDays());
            double quantity = ReplenishmentDecisionEngine.coverageOrderQuantity(
                    demand, effectiveCoverage, available, row.caseQuantity(), row.minimumOrder());
            if (quantity <= 0) continue;
            if (!row.hasSupplier()) {
                dataGapCount++;
                supplierGapCount++;
                gaps.add(row.name() + ": supplier unavailable");
                continue;
            }
            if (!row.hasRecordedCost()) {
                dataGapCount++;
                costGapCount++;
                gaps.add(row.name() + ": positive recorded purchase cost unavailable");
                continue;
            }
            suggestions.add(new ReplenishmentSuggestion(row.id(), row.name(), "units", quantity,
                    Math.max(0d, row.onHand()) / demand, demand, row.onHand(), available, row.leadTimeDays()));
        }
        suggestions.sort(Comparator
                .comparing(ReplenishmentSuggestion::daysOfStock, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Comparator.comparingDouble(ReplenishmentSuggestion::unitsPerDay).reversed())
                .thenComparing(Comparator.comparingDouble(ReplenishmentSuggestion::suggestedQuantity).reversed())
                .thenComparing(ReplenishmentSuggestion::name)
                .thenComparingLong(ReplenishmentSuggestion::productId));
        return new ReplenishmentPlan(cover, suggestions.size(), suggestions.stream().limit(limit).toList(),
                gaps.isEmpty() ? "VALID" : "DATA_INCOMPLETE", gaps.stream().distinct().limit(20).toList(),
                dataAsOf, dataGapCount, inventoryGapCount, supplierGapCount, costGapCount, from, today, zone.getId());
    }

    private record Row(long id, String name, double caseQuantity, Double onHand, double onOrder,
                       double recentUnits, double previousUnits, boolean hasSupplier, boolean hasRecordedCost,
                       double minimumOrder, Integer leadTimeDays,
                       Instant salesDataAsOf, Instant inventoryDataAsOf) { }

    private record CacheKey(long vendorId, long outletId, int coverageDays, int suggestionLimit,
                            LocalDate today, ZoneId zone) { }
    private record CachedPlan(ReplenishmentPlan plan, long expiresAtMillis) { }

    private static Double asDouble(Object value) {
        return value instanceof Number number ? number.doubleValue() : null;
    }

    private static Instant timestampInstant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }
}
