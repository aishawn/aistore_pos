package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
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
    private static final String STORE_ZONE = "Australia/Adelaide";
    private static final String RULES_METHOD = "rules_v1_weighted_velocity";

    private final JdbcTemplate jdbc;
    private final boolean forecastEnabled;

    public ReplenishmentWorkspaceService(
            JdbcTemplate jdbc,
            @Value("${AI_FORECAST_ENABLED:false}") String forecastFlag) {
        this.jdbc = jdbc;
        this.forecastEnabled = "true".equalsIgnoreCase(forecastFlag == null ? "" : forecastFlag.trim());
    }

    public ReplenishmentWorkspaceView plan(TenantContext tenant, int coverageDays, boolean exceptionOnly, boolean draftEnabled) {
        long outletId = tenant.requireOutletId();
        int cover = coverageDays > 0 ? Math.min(coverageDays, 180) : 21;
        String company = jdbc.queryForObject(
                "SELECT COALESCE(NULLIF(TRIM(o.name), ''), 'Orithos') FROM outlet o WHERE o.id = ?",
                String.class, outletId);

        List<Row> rows = jdbc.query(connection -> {
            var statement = connection.prepareStatement("""
                WITH sales AS (
                    SELECT si.product_id,
                           SUM(si.quantity) FILTER (WHERE COALESCE(s.business_date, s.local_sold_at::date)
                               >= (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 7) AS sold_7d,
                           SUM(si.quantity) FILTER (WHERE COALESCE(s.business_date, s.local_sold_at::date)
                               >= (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 28) AS recent_units,
                           SUM(si.quantity) FILTER (WHERE COALESCE(s.business_date, s.local_sold_at::date)
                               < (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 28
                               AND COALESCE(s.business_date, s.local_sold_at::date)
                                   >= (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 56) AS previous_units
                    FROM sale s
                    JOIN sale_item si ON si.sale_id = s.id AND si.outlet_id = s.outlet_id
                    WHERE s.outlet_id = ? AND s.status = 'COMPLETED' AND s.refund_reason IS NULL
                      AND COALESCE(s.business_date, s.local_sold_at::date)
                          >= (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - 56
                    GROUP BY si.product_id
                ),
                barcode AS (
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
                       COALESCE(p.cost, pc.cost) AS unit_cost,
                       (SELECT MIN(pp.price) FROM product_price pp
                        WHERE pp.product_id = p.id AND pp.outlet_id = p.outlet_id) AS unit_price,
                       EXISTS (SELECT 1 FROM product_supplier ps
                               WHERE ps.product_id = p.id AND ps.outlet_id = p.outlet_id) AS has_supplier,
                       COALESCE((SELECT MAX(ps.minimum_order_quantity) FROM product_supplier ps
                                 WHERE ps.product_id = p.id AND ps.outlet_id = p.outlet_id), 1) AS minimum_order
                FROM product p
                LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.outlet_id = p.outlet_id
                LEFT JOIN product_cost pc ON pc.product_id = p.id AND pc.outlet_id = p.outlet_id
                LEFT JOIN sales s ON s.product_id = p.id
                LEFT JOIN barcode b ON b.product_id = p.id
                WHERE p.outlet_id = ? AND p.deleted_at IS NULL AND p.status = 'ACTIVE'
                  AND p.track_inventory = 1
                ORDER BY p.name, p.id
                """);
            statement.setQueryTimeout(QUERY_TIMEOUT_SECONDS);
            statement.setLong(1, outletId);
            statement.setLong(2, outletId);
            statement.setLong(3, outletId);
            return statement;
        }, (rs, rowNum) -> mapRow(rs));

        InventoryMeta inventoryMeta = inventoryMeta(outletId, rows);
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
            if (!exceptionOnly && line.suggestedQuantity() <= 0 && line.onHand() > 0
                    && !"REVIEW_DATA".equals(line.recommendationStatus())) {
                continue;
            }
            products.add(line);
        }

        products.sort(Comparator
                .comparingDouble(ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct::suggestedQuantity).reversed()
                .thenComparing(ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct::name));

        return new ReplenishmentWorkspaceView(
                company,
                HISTORY_DAYS,
                cover,
                cover,
                products,
                exceptionOnly,
                exceptionOnly ? products.size() : 0,
                false,
                new ReplenishmentWorkspaceView.SalesHistory(STORE_ZONE, true, "SIGNED_NET_UNITS"),
                reviewRequired,
                reviewIssueCounts,
                Instant.now().toString(),
                inventoryMeta.history(),
                new ReplenishmentWorkspaceView.Forecast(
                        forecastEnabled,
                        RULES_METHOD,
                        forecastEnabled ? "UNAVAILABLE" : "UNAVAILABLE",
                        forecastEnabled ? "native_rules_pending" : null),
                new ReplenishmentWorkspaceView.PurchaseWorkflow(
                        draftEnabled,
                        draftEnabled ? "DRAFT_RFQ" : "READ_ONLY_PREVIEW"),
                new ReplenishmentWorkspaceView.CatalogueCoverage(
                        "COMPLETE", rows.size(), rows.size(), forecastEnabled ? 0 : 0));
    }

    private static boolean isException(ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct product) {
        return product.suggestedQuantity() > 0
                || product.onHand() <= 0
                || "REVIEW_DATA".equals(product.recommendationStatus())
                || (product.soldUnits() > 0 && product.onHand() <= 0);
    }

    private ReplenishmentWorkspaceView.ReplenishmentWorkspaceProduct toProduct(Row row, int cover) {
        Double onHand = row.onHand();
        if (onHand == null) return null;

        double recentPerDay = row.recentUnits() / (double) RECENT_PERIOD_DAYS;
        double previousPerDay = row.previousUnits() / (double) RECENT_PERIOD_DAYS;
        double demand = recentPerDay > 0 && previousPerDay > 0
                ? recentPerDay * 0.7 + previousPerDay * 0.3
                : Math.max(recentPerDay, previousPerDay);
        double available = onHand + row.onOrder();
        double forecastStock = available;
        int lead = cover;
        double rawDemandTarget = demand * lead;
        double raw = Math.max(0d, rawDemandTarget - forecastStock);
        double casePack = Math.max(1d, row.caseQuantity());
        double minimum = Math.max(1d, row.minimumOrder());
        double quantity = raw == 0 ? 0 : Math.ceil(Math.max(raw, minimum) / casePack) * casePack;

        List<String> dataIssues = new ArrayList<>();
        String status = "READY";
        String reason;
        if (onHand < 0) dataIssues.add("NEGATIVE_STOCK");
        if (!row.hasSupplier()) dataIssues.add("SUPPLIER_MISSING");
        if (row.unitCost() == null || row.unitCost() <= 0) dataIssues.add("REVIEW_COST_PRICE");

        boolean inventoryRepairOnly = demand <= 0 && onHand < 0 && quantity > 0;
        if (inventoryRepairOnly) {
            dataIssues.add("INVENTORY_RECORD_REPAIR");
            status = "REVIEW_DATA";
            quantity = Math.ceil(Math.max(Math.abs(onHand), minimum) / casePack) * casePack;
            reason = "Negative on-hand with no recent demand: suggested quantity corrects the stock record only. Reconcile sales/receipts before ordering for demand.";
        } else if (quantity <= 0) {
            status = "NO_DEMAND";
            reason = demand > 0 ? "Stock covers the coverage target." : "No verifiable demand in the sales window.";
        } else if (!dataIssues.isEmpty()) {
            if (dataIssues.contains("NEGATIVE_STOCK") || dataIssues.contains("REVIEW_COST_PRICE")) {
                status = "REVIEW_DATA";
            }
            reason = buildReason(demand, cover, lead, onHand, row.onOrder(), quantity);
        } else {
            reason = buildReason(demand, cover, lead, onHand, row.onOrder(), quantity);
        }

        if (!row.hasSupplier()) {
            status = "REVIEW_DATA";
            quantity = 0;
        } else if (onHand == null) {
            return null;
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
                demand > 0 ? available / demand : null,
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
                List.copyOf(dataIssues));
    }

    private static String buildReason(double demand, int cover, int lead, double onHand, double onOrder, double quantity) {
        return String.format(Locale.ROOT,
                "Weighted demand %.2f units/day × %d effective coverage days − forecast stock %.1f (on hand %.1f + on order %.1f) → suggested %s units.",
                demand, lead, onHand + onOrder, onHand, onOrder,
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

    private InventoryMeta inventoryMeta(long outletId, List<Row> rows) {
        int expected = rows.size();
        int captured = (int) rows.stream().filter(r -> r.onHand() != null).count();
        int negative = (int) rows.stream().filter(r -> r.onHand() != null && r.onHand() < 0).count();
        Instant latest = rows.stream()
                .map(Row::inventoryUpdatedAt)
                .filter(Objects::nonNull)
                .max(Instant::compareTo)
                .orElse(null);

        String status = "UNAVAILABLE";
        if (latest != null) {
            long age = System.currentTimeMillis() - latest.toEpochMilli();
            double coverage = expected == 0 ? 0 : captured / (double) expected;
            if (age <= INVENTORY_FRESH_MILLIS && coverage >= 0.85) status = "FRESH";
            else if (coverage >= 0.5) status = "REVIEW";
            else status = "STALE";
        }

        Map<String, Integer> missing = new HashMap<>();
        if (negative > 0) missing.put("availableQty", negative);

        ReplenishmentWorkspaceView.InventoryHistory history = new ReplenishmentWorkspaceView.InventoryHistory(
                status,
                latest == null ? null : latest.toString(),
                STORE_ZONE,
                expected,
                captured,
                expected == 0 ? 0d : captured / (double) expected,
                null,
                null,
                null,
                missing.isEmpty() ? Map.of() : Map.copyOf(missing));
        return new InventoryMeta(history);
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
                rs.getBoolean("has_supplier"),
                rs.getDouble("minimum_order"));
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
                       Double unitCost, Double unitPrice, boolean hasSupplier, double minimumOrder) { }

    private record InventoryMeta(ReplenishmentWorkspaceView.InventoryHistory history) { }
}