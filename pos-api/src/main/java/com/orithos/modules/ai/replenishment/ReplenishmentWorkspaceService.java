package com.orithos.modules.ai.replenishment;

import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@Service
public class ReplenishmentWorkspaceService {
    private static final int HISTORY_DAYS = 56;
    private static final int RECENT_PERIOD_DAYS = 28;
    private static final int QUERY_TIMEOUT_SECONDS = 30;
    private static final long INVENTORY_FRESH_MILLIS = Duration.ofHours(26).toMillis();
    private static final String RULES_METHOD = "rules_v1_weighted_velocity";

    private final JdbcTemplate jdbc;
    private final boolean forecastEnabled;
    private final BusinessTimezoneService businessTimezone;

    public ReplenishmentWorkspaceService(
            JdbcTemplate jdbc,
            @Value("${AI_FORECAST_ENABLED:false}") String forecastFlag,
            BusinessTimezoneService businessTimezone) {
        this.jdbc = jdbc;
        this.forecastEnabled = "true".equalsIgnoreCase(forecastFlag == null ? "" : forecastFlag.trim());
        this.businessTimezone = businessTimezone;
    }

    public ReplenishmentWorkspaceView plan(TenantContext tenant, int coverageDays, boolean exceptionOnly, boolean draftEnabled) {
        long outletId = tenant.requireOutletId();
        int cover = coverageDays > 0 ? Math.min(coverageDays, 180) : 21;
        String company = jdbc.queryForObject(
                "SELECT COALESCE(NULLIF(TRIM(o.name), ''), 'Orithos') FROM outlet o WHERE o.id = ?",
                String.class, outletId);

        List<Row> rows = jdbc.query(connection -> {
            var statement = connection.prepareStatement(ReplenishmentSalesQuery.CTE + """
                , barcode AS (
                    SELECT DISTINCT ON (product_id) product_id, code
                    FROM product_barcode
                    WHERE outlet_id = ?
                    ORDER BY product_id, id
                )
                SELECT p.id, p.name, COALESCE(b.code, '') AS sku, p.case_quantity,
                       pi.quantity AS on_hand, COALESCE(pi.on_order, 0) AS on_order,
                       pi.updated_at AS inventory_updated_at,
                       COALESCE(s.sold_7d, 0) AS sold_7d,
                       COALESCE(s.recent_units, 0) AS recent_units,
                       COALESCE(s.previous_units, 0) AS previous_units,
                       CASE WHEN p.cost_percentage <> 0 THEN NULL ELSE
                           COALESCE(pc.average_cost, pc.cost,
                               CASE WHEN p.shopfront_source_updated_at IS NULL OR p.case_cost IS NOT NULL
                                    THEN p.cost END)
                       END AS unit_cost,
                       (SELECT MIN(pp.price) FROM product_price pp
                        WHERE pp.product_id = p.id AND pp.outlet_id = p.outlet_id) AS unit_price,
                       chosen.id AS supplier_id, chosen.name AS supplier_name, chosen.lead_time_days,
                       links.link_count AS supplier_link_count,
                """ + ReplenishmentSalesQuery.SELECTED_MINIMUM_ORDER + """
                FROM product p
                LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.outlet_id = p.outlet_id
                LEFT JOIN product_cost pc ON pc.product_id = p.id AND pc.outlet_id = p.outlet_id
                LEFT JOIN sales s ON s.product_id = p.id
                LEFT JOIN barcode b ON b.product_id = p.id
                """ + ReplenishmentSalesQuery.SUPPLIER_JOINS + """
                WHERE p.outlet_id = ? AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
                  AND p.track_inventory = 1
                ORDER BY p.name, p.id
                """);
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            var zone = businessTimezone.zoneForVendor(tenant.vendorId());
            statement.setObject(1, java.time.LocalDate.now(zone));
            statement.setString(2, zone.getId());
            statement.setLong(3, outletId);
            statement.setString(4, zone.getId());
            statement.setLong(5, outletId);
            statement.setLong(6, outletId);
            return statement;
        }, (rs, rowNum) -> mapRow(rs));

        InventoryMeta inventoryMeta = inventoryMeta(outletId, rows,
                businessTimezone.zoneForVendor(tenant.vendorId()).getId());
        List<ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct> products = new ArrayList<>();
        Map<String, Integer> reviewIssueCounts = new HashMap<>();
        int reviewRequired = 0;

        for (Row row : rows) {
            ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct line = toProduct(row, cover);
            if (line == null) continue;
            if ("REVIEW_DATA".equals(line.recommendationStatus())) {
                reviewRequired++;
                for (String issue : line.dataIssues()) {
                    reviewIssueCounts.merge(issue, 1, Integer::sum);
                }
            }
            if (exceptionOnly && !isException(line)) continue;
            if (!exceptionOnly && line.suggestedQuantity() <= 0
                    && !"REVIEW_DATA".equals(line.recommendationStatus())) {
                continue;
            }
            products.add(line);
        }

        products.sort(Comparator
                .comparing(ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct::daysOfStock,
                        Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Comparator.comparingDouble(
                        ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct::unitsPerDay).reversed())
                .thenComparing(ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct::name)
                .thenComparingLong(ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct::id));

        return new ReplenishmentWorkspaceView(
                company,
                HISTORY_DAYS,
                cover,
                cover,
                products,
                exceptionOnly,
                exceptionOnly ? products.size() : 0,
                false,
                new ReplenishmentWorkspaceView.SalesHistory(
                        businessTimezone.zoneForVendor(tenant.vendorId()).getId(), true, "SIGNED_NET_UNITS"),
                reviewRequired,
                reviewIssueCounts,
                Instant.now().toString(),
                inventoryMeta.history(),
                new ReplenishmentWorkspaceView.Forecast(
                        false,
                        RULES_METHOD,
                        "UNAVAILABLE",
                        null),
                new ReplenishmentWorkspaceView.PurchaseWorkflow(
                        draftEnabled,
                        draftEnabled ? "DRAFT_RFQ" : "READ_ONLY_PREVIEW"),
                new ReplenishmentWorkspaceView.CatalogueCoverage(
                        "COMPLETE", rows.size(), rows.size(), forecastEnabled ? 0 : 0));
    }

    private static boolean isException(ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct product) {
        return product.suggestedQuantity() > 0
                || "REVIEW_DATA".equals(product.recommendationStatus())
                || (product.soldUnits() > 0 && product.onHand() <= 0);
    }

    private ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct toProduct(Row row, int cover) {
        Double onHand = row.onHand();
        if (onHand == null) return null;

        double recentPerDay = row.recentUnits() / (double) RECENT_PERIOD_DAYS;
        double previousPerDay = row.previousUnits() / (double) RECENT_PERIOD_DAYS;
        boolean recentDemandGap = row.recentUnits() <= 0 && row.previousUnits() > 0;
        double demand = recentDemandGap ? 0d : recentPerDay > 0 && previousPerDay > 0
                ? recentPerDay * 0.7 + previousPerDay * 0.3
                : Math.max(recentPerDay, previousPerDay);
        double available = onHand + row.onOrder();
        double forecastStock = available;
        int effectiveCoverage = ReplenishmentDecisionEngine.effectiveCoverage(cover, row.leadTimeDays());
        double quantity = demand > 0 ? ReplenishmentDecisionEngine.coverageOrderQuantity(
                demand, effectiveCoverage, available, row.caseQuantity(), row.minimumOrder()) : 0d;

        List<String> dataIssues = new ArrayList<>();
        String status = "READY";
        String reason;
        if (onHand < 0) dataIssues.add("NEGATIVE_STOCK");
        if (row.supplierId() == null) {
            dataIssues.add(row.supplierLinkCount() > 1 ? "SUPPLIER_SELECTION_REQUIRED" : "SUPPLIER_MISSING");
        }
        if (row.unitCost() == null || row.unitCost() <= 0) dataIssues.add("REVIEW_COST_PRICE");
        if (recentDemandGap) dataIssues.add("RECENT_DEMAND_GAP");

        if (onHand < 0) {
            dataIssues.add("INVENTORY_RECORD_REPAIR");
            status = "REVIEW_DATA";
            quantity = 0;
            reason = "Negative on-hand stock. Reconcile the stock count, sales and receipts before drafting a replenishment order.";
        } else if (recentDemandGap) {
            status = "REVIEW_DATA";
            quantity = 0;
            reason = "Sales were zero in the most recent 28 days after earlier demand. Confirm whether the item was out of stock or discontinued before ordering.";
        } else if (quantity <= 0) {
            status = "NO_DEMAND";
            reason = demand > 0 ? "Stock covers the effective coverage target." : "No verifiable demand in the sales window.";
        } else if (!dataIssues.isEmpty()) {
            if (dataIssues.contains("REVIEW_COST_PRICE")) {
                status = "REVIEW_DATA";
            }
            reason = buildReason(demand, effectiveCoverage, onHand, row.onOrder(), quantity);
        } else {
            reason = buildReason(demand, effectiveCoverage, onHand, row.onOrder(), quantity);
        }

        if (onHand >= 0 && row.supplierId() == null && !recentDemandGap) {
            status = "REVIEW_DATA";
            quantity = 0;
            reason = row.supplierLinkCount() > 1
                    ? "Choose a primary supplier before drafting an order."
                    : "Link a supplier before drafting an order.";
        }

        String trend = trend(row.recentUnits(), row.previousUnits());
        Double trendPercent = trendPercent(row.recentUnits(), row.previousUnits());
        String risk = risk(demand, onHand, row.sold7d());
        String attentionLevel = attentionLevel(dataIssues, onHand, row.sold7d());

        return new ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct(
                row.id(),
                row.name(),
                row.sku(),
                "Units",
                row.sold7d(),
                row.recentUnits(),
                row.previousUnits(),
                demand,
                trendPercent,
                trend,
                onHand,
                forecastStock,
                demand > 0 ? Math.max(0d, onHand) / demand : null,
                status,
                List.copyOf(dataIssues),
                quantity,
                reason,
                List.of(reason),
                RULES_METHOD,
                row.unitCost(),
                row.unitPrice(),
                risk,
                attentionLevel,
                List.copyOf(dataIssues), row.supplierId(), row.supplierName(),
                row.caseQuantity() > 0 ? row.caseQuantity() : null, row.onOrder(), row.leadTimeDays());
    }

    private static String buildReason(double demand, int effectiveCoverage, double onHand, double onOrder, double quantity) {
        return String.format(Locale.ROOT,
                "Weighted demand %.2f units/day × %d effective coverage days − forecast stock %.1f (on hand %.1f + on order %.1f) → suggested %s units.",
                demand, effectiveCoverage, onHand + onOrder, onHand, onOrder,
                quantity == Math.floor(quantity) ? String.format(Locale.ROOT, "%.0f", quantity) : String.valueOf(quantity));
    }

    private static String trend(double recent, double previous) {
        if (recent <= 0 && previous <= 0) return null;
        if (previous <= 0 && recent > 0) return "new";
        double change = (recent - previous) / Math.max(previous, 1d);
        if (change > 0.1) return "up";
        if (change < -0.1) return "down";
        return "steady";
    }

    private static Double trendPercent(double recent, double previous) {
        if (previous <= 0) return recent > 0 ? 100d : null;
        return (recent - previous) / previous * 100d;
    }

    private static String risk(double demand, double onHand, double sold7d) {
        if (sold7d > 0 && onHand <= 0) return "HIGH";
        if (demand > 0 && onHand / demand < 7) return "MEDIUM";
        if (demand > 0) return "LOW";
        return "UNKNOWN";
    }

    private static String attentionLevel(List<String> issues, double onHand, double sold7d) {
        if (!issues.isEmpty()) return "REVIEW";
        if (sold7d > 0 && onHand <= 0) return "HIGH";
        if (sold7d > 0) return "MEDIUM";
        return "LOW";
    }

    private InventoryMeta inventoryMeta(long outletId, List<Row> rows, String timezone) {
        int expected = rows.size();
        int captured = (int) rows.stream().filter(r -> r.onHand() != null).count();
        int negative = (int) rows.stream().filter(r -> r.onHand() != null && r.onHand() < 0).count();
        Instant latest = rows.stream()
                .map(Row::inventoryUpdatedAt)
                .filter(Objects::nonNull)
                .max(Instant::compareTo)
                .orElse(null);
        long now = System.currentTimeMillis();
        boolean everyRecordFresh = rows.stream().allMatch(row -> isFreshInventoryRecord(row, now));
        int staleOrUnverified = (int) rows.stream()
                .filter(row -> row.onHand() != null && !isFreshInventoryRecord(row, now))
                .count();

        String status = "UNAVAILABLE";
        double coverage = expected == 0 ? 0 : captured / (double) expected;
        if (expected > 0) {
            if (everyRecordFresh && coverage >= 0.85) status = "FRESH";
            else if (coverage >= 0.5) status = "REVIEW";
            else status = "STALE";
        }

        Map<String, Integer> missing = new HashMap<>();
        if (negative > 0) missing.put("availableQty", negative);
        if (staleOrUnverified > 0) missing.put("staleInventory", staleOrUnverified);
        SnapshotHistory snapshots = snapshotHistory(outletId, timezone);

        ReplenishmentWorkspaceView.InventoryHistory history = new ReplenishmentWorkspaceView.InventoryHistory(
                status,
                latest == null ? null : latest.toString(),
                timezone,
                expected,
                captured,
                expected == 0 ? 0d : captured / (double) expected,
                snapshots.observedDays(),
                snapshots.gapDays(),
                snapshots.invalidSnapshots(),
                missing.isEmpty() ? Map.of() : Map.copyOf(missing),
                snapshots.firstBusinessDate(),
                snapshots.latestBusinessDate());
        return new InventoryMeta(history);
    }

    private SnapshotHistory snapshotHistory(long outletId, String timezone) {
        ZoneId zone = ZoneId.of(timezone);
        LocalDate today = LocalDate.now(zone);
        LocalDate from = today.minusDays(HISTORY_DAYS - 1L);
        List<Map<String, Object>> captures = jdbc.queryForList("""
                SELECT business_date, expected_products, capture_status
                FROM inventory_snapshot_capture
                WHERE outlet_id = ? AND business_date BETWEEN ? AND ?
                ORDER BY business_date
                """, outletId, from, today);
        List<LocalDate> observed = captures.stream()
                .filter(row -> numberValue(row.get("expected_products")) > 0)
                .map(row -> localDateValue(row.get("business_date")))
                .filter(Objects::nonNull)
                .toList();
        LocalDate first = observed.isEmpty() ? null : observed.getFirst();
        LocalDate latest = observed.isEmpty() ? null : observed.getLast();
        int gaps = first == null ? 0 : Math.max(0, (int) (latest.toEpochDay() - first.toEpochDay() + 1) - observed.size());
        int invalid = (int) captures.stream()
                .filter(row -> numberValue(row.get("expected_products")) > 0)
                .filter(row -> !"COMPLETE".equalsIgnoreCase(String.valueOf(row.get("capture_status"))))
                .count();
        return new SnapshotHistory(observed.size(), gaps, invalid, first, latest);
    }

    private static int numberValue(Object value) {
        return value instanceof Number number ? number.intValue() : 0;
    }

    private static LocalDate localDateValue(Object value) {
        if (value instanceof LocalDate date) return date;
        if (value instanceof java.sql.Date date) return date.toLocalDate();
        return null;
    }

    private static boolean isFreshInventoryRecord(Row row, long now) {
        if (row.onHand() == null || row.inventoryUpdatedAt() == null) return false;
        long age = now - row.inventoryUpdatedAt().toEpochMilli();
        return age >= 0 && age <= INVENTORY_FRESH_MILLIS;
    }

    private static Row mapRow(ResultSet rs) throws java.sql.SQLException {
        return new Row(
                rs.getLong("id"),
                rs.getString("name"),
                rs.getString("sku"),
                rs.getDouble("case_quantity"),
                asDouble(rs.getObject("on_hand")),
                rs.getDouble("on_order"),
                timestampInstant(rs.getTimestamp("inventory_updated_at")),
                rs.getDouble("sold_7d"),
                rs.getDouble("recent_units"),
                rs.getDouble("previous_units"),
                asDouble(rs.getObject("unit_cost")),
                asDouble(rs.getObject("unit_price")),
                rs.getObject("supplier_id", Long.class), rs.getString("supplier_name"),
                rs.getLong("supplier_link_count"),
                rs.getDouble("minimum_order"), rs.getObject("lead_time_days", Integer.class));
    }

    private static Double asDouble(Object value) {
        if (value == null) return null;
        if (value instanceof Number number) return number.doubleValue();
        return null;
    }

    private static Instant timestampInstant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private record Row(long id, String name, String sku, double caseQuantity, Double onHand, double onOrder,
                       Instant inventoryUpdatedAt, double sold7d, double recentUnits, double previousUnits,
                       Double unitCost, Double unitPrice, Long supplierId, String supplierName, long supplierLinkCount, double minimumOrder, Integer leadTimeDays) { }

    private record InventoryMeta(ReplenishmentWorkspaceView.InventoryHistory history) { }
    private record SnapshotHistory(int observedDays, int gapDays, int invalidSnapshots,
                                   LocalDate firstBusinessDate, LocalDate latestBusinessDate) { }
}
