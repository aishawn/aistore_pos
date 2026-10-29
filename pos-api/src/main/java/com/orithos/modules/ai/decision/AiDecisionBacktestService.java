package com.orithos.modules.ai.decision;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.pricing.PricingDecisionEngine;
import com.orithos.modules.ai.replenishment.ReplenishmentDecisionEngine;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.security.PermissionAccess;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Replays immutable Odoo read snapshots through the same deterministic policy
 * used by the preview endpoints. It never calls Odoo and never writes business
 * data, so a run is safe to execute in production for a selected store.
 */
@Service
public class AiDecisionBacktestService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final PermissionAccess permissions;

    public AiDecisionBacktestService(JdbcTemplate jdbc, ObjectMapper mapper, PermissionAccess permissions) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.permissions = permissions;
    }

    public Map<String, Object> run(TenantContext tenant, String type, Instant from, Instant to) {
        String decisionType = normalizeType(type);
        permissions.requirePermission("REPLENISHMENT".equals(decisionType)
                ? "stock.replenishment" : "ai.price_suggestions");
        if (tenant == null || tenant.requireOutletId() == null) {
            throw new BusinessException(40010, "A store outlet is required");
        }
        Instant end = to == null ? Instant.now() : to;
        Instant start = from == null ? end.minus(28, ChronoUnit.DAYS) : from;
        if (!start.isBefore(end)) throw new BusinessException(40010, "Backtest window is invalid");
        List<Snapshot> rows = jdbc.query("""
                SELECT object_type, source_record_id, payload, data_as_of
                FROM odoo_read_snapshot
                WHERE vendor_id = ? AND outlet_id = ?
                  AND ingested_at >= ? AND ingested_at < ?
                ORDER BY ingested_at ASC, id ASC
                """, (rs, row) -> new Snapshot(rs.getString(1), rs.getString(2),
                        parsePayload(rs.getString(3)), rs.getTimestamp(4).toInstant()),
                tenant.vendorId(), tenant.requireOutletId(), Timestamp.from(start), Timestamp.from(end));

        UUID runId = UUID.randomUUID();
        if (rows.isEmpty()) {
            Map<String, Object> metrics = Map.of("reason", "no Odoo snapshots in selected window",
                    "snapshotRows", 0, "evaluatedItems", 0);
            persist(runId, tenant, decisionType, start, end, "none", "BLOCKED", metrics);
            return response(runId, decisionType, start, end, "BLOCKED", metrics);
        }
        Map<String, Object> metrics = "PRICING".equals(decisionType)
                ? priceMetrics(rows) : replenishmentMetrics(rows);
        String status = ((Number) metrics.getOrDefault("evaluatedItems", 0)).intValue() > 0
                ? "PASS" : "BLOCKED";
        String sourceVersion = rows.stream().map(Snapshot::asOf).max(Instant::compareTo)
                .map(Instant::toString).orElse("unknown");
        persist(runId, tenant, decisionType, start, end, sourceVersion, status, metrics);
        return response(runId, decisionType, start, end, status, metrics);
    }

    private Map<String, Object> priceMetrics(List<Snapshot> rows) {
        Map<String, JsonNode> products = latest(rows, "PRODUCT");
        Map<String, JsonNode> prices = latest(rows, "PRICE");
        Map<String, JsonNode> inventory = latest(rows, "INVENTORY");
        Map<String, Double> sales = salesByProduct(rows);
        PricingDecisionEngine.Limits limits = new PricingDecisionEngine.Limits(
                0.25, 30, 0.10, 2.0, 10, 0.05, 0.30, 0.15, 0.25, 0.05);
        int evaluated = 0, review = 0, hold = 0, incomplete = 0;
        double delta = 0;
        for (String id : prices.keySet()) {
            JsonNode price = prices.get(id);
            JsonNode product = products.get(id);
            JsonNode stock = inventory.get(id);
            double current = decimal(price, "listPrice");
            double cost = decimal(product, "standard_price");
            double onHand = decimal(stock, "qtyAvailable");
            if (current <= 0 || product == null || stock == null) { incomplete++; continue; }
            PricingDecisionEngine.Decision decision = PricingDecisionEngine.decide(
                    new PricingDecisionEngine.Input(current, cost, sales.getOrDefault(id, 0d) / 28d,
                            onHand, false, false), limits);
            evaluated++;
            switch (decision.status()) {
                case REVIEW -> { review++; delta += decision.delta() == null ? 0 : decision.delta(); }
                case HOLD -> hold++;
                case INSUFFICIENT_DATA -> incomplete++;
            }
        }
        return metrics("pricing", rows.size(), evaluated, review, hold, incomplete, delta);
    }

    private Map<String, Object> replenishmentMetrics(List<Snapshot> rows) {
        Map<String, JsonNode> inventory = latest(rows, "INVENTORY");
        Map<String, Double> sales = salesByProduct(rows);
        int evaluated = 0, review = 0, hold = 0, incomplete = 0;
        double suggested = 0;
        for (Map.Entry<String, JsonNode> entry : inventory.entrySet()) {
            JsonNode node = entry.getValue();
            double onHand = decimal(node, "qtyAvailable");
            if (onHand < 0) { incomplete++; continue; }
            double demand = sales.getOrDefault(entry.getKey(), 0d) / 28d;
            ReplenishmentDecisionEngine.Decision decision = ReplenishmentDecisionEngine.decide(
                    new ReplenishmentDecisionEngine.Input(onHand, 0, 0, demand, 0,
                            1, 21, 1.65, 1, true));
            evaluated++;
            if (decision.status() == ReplenishmentDecisionEngine.Status.REVIEW) {
                review++; suggested += decision.suggestedQuantity();
            } else if (decision.status() == ReplenishmentDecisionEngine.Status.HOLD) hold++;
            else incomplete++;
        }
        return metrics("replenishment", rows.size(), evaluated, review, hold, incomplete, suggested);
    }

    private Map<String, JsonNode> latest(List<Snapshot> rows, String type) {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        for (Snapshot row : rows) if (type.equals(row.type())) out.put(row.recordId(), row.payload());
        return out;
    }

    private Map<String, Double> salesByProduct(List<Snapshot> rows) {
        Map<String, Double> out = new LinkedHashMap<>();
        for (Snapshot row : rows) if ("SALE_LINE".equals(row.type())) {
            String id = relationId(row.payload().get("product_id"));
            if (id == null) id = row.recordId();
            out.merge(id, decimal(row.payload(), "qty"), Double::sum);
        }
        return out;
    }

    private Map<String, Object> metrics(String kind, int snapshots, int evaluated, int review,
                                        int hold, int incomplete, double aggregate) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("kind", kind); result.put("snapshotRows", snapshots);
        result.put("evaluatedItems", evaluated); result.put("reviewItems", review);
        result.put("holdItems", hold); result.put("incompleteItems", incomplete);
        result.put("aggregate", BigDecimal.valueOf(aggregate).setScale(2, java.math.RoundingMode.HALF_UP));
        return result;
    }

    private void persist(UUID id, TenantContext tenant, String type, Instant from, Instant to,
                         String source, String status, Map<String, Object> metrics) {
        try {
            jdbc.update("""
                    INSERT INTO ai_decision_backtest_run
                    (id, vendor_id, outlet_id, user_id, decision_type, window_from, window_to,
                     source_version, status, metrics_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
                    """, id, tenant.vendorId(), tenant.requireOutletId(), tenant.userId(), type,
                    Timestamp.from(from), Timestamp.from(to), source, status, json(metrics));
        } catch (RuntimeException e) {
            throw new BusinessException(50320, "Backtest result could not be persisted");
        }
    }

    private Map<String, Object> response(UUID id, String type, Instant from, Instant to,
                                         String status, Map<String, Object> metrics) {
        return Map.of("runId", id, "type", type, "windowFrom", from, "windowTo", to,
                "status", status, "metrics", metrics, "readOnly", true);
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (JsonProcessingException e) { throw new BusinessException(50010, "Backtest metrics encoding failed"); }
    }

    private JsonNode parsePayload(String value) {
        try { return mapper.readTree(value == null ? "{}" : value); }
        catch (JsonProcessingException e) { throw new BusinessException(50320, "Backtest snapshot payload is invalid"); }
    }

    private static String normalizeType(String type) {
        String value = type == null ? "" : type.trim().toUpperCase();
        if (!List.of("PRICING", "REPLENISHMENT").contains(value))
            throw new BusinessException(40010, "Unsupported backtest type");
        return value;
    }

    private static double decimal(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) return -1;
        return node.get(field).asDouble(-1);
    }

    private static String relationId(JsonNode node) {
        return node != null && node.isArray() && !node.isEmpty() ? node.get(0).asText() : null;
    }

    private record Snapshot(String type, String recordId, JsonNode payload, Instant asOf) { }
}
