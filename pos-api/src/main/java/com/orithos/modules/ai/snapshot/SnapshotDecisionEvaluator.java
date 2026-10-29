package com.orithos.modules.ai.snapshot;

import com.orithos.modules.ai.pricing.PricingDecisionEngine;
import com.orithos.modules.ai.replenishment.ReplenishmentDecisionEngine;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Replays deterministic pricing and replenishment rules from one immutable snapshot version. */
@Component
public class SnapshotDecisionEvaluator {
    private static final PricingDecisionEngine.Limits PRICE_LIMITS = new PricingDecisionEngine.Limits(
            0.25, 60, 0.10, 4.0, 10, 0.05, 0.30, 0.15, 0.05, 0.05);
    private final OdooReadSnapshotRepository repository;

    public SnapshotDecisionEvaluator(OdooReadSnapshotRepository repository) { this.repository = repository; }

    public Map<String, Object> evaluatePricing(TenantContext tenant, String sourceVersion) {
        Map<String, OdooReadSnapshotRepository.SnapshotRow> inventory = byId(repository.findVersion(tenant, sourceVersion, "INVENTORY"));
        Map<String, OdooReadSnapshotRepository.SnapshotRow> sales = byId(repository.findVersion(tenant, sourceVersion, "SALE_LINE"));
        List<Map<String, Object>> items = new ArrayList<>();
        for (OdooReadSnapshotRepository.SnapshotRow row : repository.findVersion(tenant, sourceVersion, "PRICE")) {
            Map<String, Object> p = row.payload();
            String id = row.sourceRecordId();
            if (!hasNumber(p, "listPrice") || !hasNumber(p, "standardPrice")
                    || inventory.get(id) == null || !hasNumber(inventory.get(id).payload(), "qtyAvailable")) {
                Map<String, Object> incomplete = new LinkedHashMap<>();
                incomplete.put("productId", id); incomplete.put("name", p.get("name"));
                incomplete.put("status", PricingDecisionEngine.Status.INSUFFICIENT_DATA.name());
                incomplete.put("reason", "price, cost, or inventory data is missing");
                items.add(incomplete);
                continue;
            }
            double units = number(sales.get(id), "units");
            double stock = number(inventory.get(id), "qtyAvailable");
            PricingDecisionEngine.Decision decision = PricingDecisionEngine.decide(
                    new PricingDecisionEngine.Input(number(p, "listPrice"), number(p, "standardPrice"),
                            units / 28d, stock, false, false), PRICE_LIMITS);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("productId", id); item.put("name", p.get("name")); item.put("status", decision.status().name());
            item.put("suggestedPrice", decision.suggestedPrice()); item.put("delta", decision.delta());
            item.put("evidence", decision.evidence()); item.put("reason", decision.reason());
            items.add(item);
        }
        return Map.of("algorithm", "pricing-rule-v1", "sourceVersion", sourceVersion, "items", items);
    }

    public Map<String, Object> evaluateReplenishment(TenantContext tenant, String sourceVersion) {
        Map<String, OdooReadSnapshotRepository.SnapshotRow> sales = byId(repository.findVersion(tenant, sourceVersion, "SALE_LINE"));
        List<Map<String, Object>> items = new ArrayList<>();
        for (OdooReadSnapshotRepository.SnapshotRow row : repository.findVersion(tenant, sourceVersion, "INVENTORY")) {
            String id = row.sourceRecordId();
            Map<String, Object> payload = row.payload();
            if (!hasNumber(payload, "qtyAvailable") || !hasNumber(payload, "onOrder")
                    || !hasNumber(payload, "backorder") || !hasNumber(payload, "casePack")
                    || !Boolean.TRUE.equals(payload.get("supplierAvailable"))) {
                Map<String, Object> incomplete = new LinkedHashMap<>();
                incomplete.put("productId", id); incomplete.put("name", payload.get("name"));
                incomplete.put("status", ReplenishmentDecisionEngine.Status.INCOMPLETE_DATA.name());
                incomplete.put("explanation", "supplier, on-order, backorder, or case-pack data is missing");
                items.add(incomplete);
                continue;
            }
            double units = number(sales.get(id), "units");
            double onHand = number(payload, "qtyAvailable");
            double average = units / 28d;
            ReplenishmentDecisionEngine.Decision decision = ReplenishmentDecisionEngine.decide(
                    new ReplenishmentDecisionEngine.Input(onHand, number(payload, "onOrder"),
                            number(payload, "backorder"), average, Math.sqrt(Math.max(average, 0)),
                            number(payload, "leadTimeDays"), number(payload, "coverageDays"),
                            number(payload, "serviceFactor"), number(payload, "casePack"), true));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("productId", id); item.put("name", payload.get("name"));
            item.put("status", decision.status().name()); item.put("reorderPoint", decision.reorderPoint());
            item.put("safetyStock", decision.safetyStock()); item.put("suggestedQuantity", decision.suggestedQuantity());
            item.put("explanation", decision.explanation()); items.add(item);
        }
        return Map.of("algorithm", "replenishment-rule-v1", "sourceVersion", sourceVersion, "items", items);
    }

    /** Replays the deterministic rule against two immutable snapshots without writes. */
    public Map<String, Object> compare(TenantContext tenant, String type,
                                       String baselineVersion, String candidateVersion) {
        String normalized = type == null ? "" : type.trim().toUpperCase(Locale.ROOT);
        if (!List.of("PRICING", "REPLENISHMENT").contains(normalized)) {
            throw new IllegalArgumentException("Unsupported backtest type");
        }
        requireVersion(baselineVersion);
        requireVersion(candidateVersion);
        Map<String, Object> baseline = "PRICING".equals(normalized)
                ? evaluatePricing(tenant, baselineVersion)
                : evaluateReplenishment(tenant, baselineVersion);
        Map<String, Object> candidate = "PRICING".equals(normalized)
                ? evaluatePricing(tenant, candidateVersion)
                : evaluateReplenishment(tenant, candidateVersion);
        Map<String, Object> baselineSummary = summarize(normalized, baseline);
        Map<String, Object> candidateSummary = summarize(normalized, candidate);
        Map<String, Object> delta = new LinkedHashMap<>();
        delta.put("actionableCount", number(candidateSummary, "actionableCount")
                - number(baselineSummary, "actionableCount"));
        delta.put("insufficientDataCount", number(candidateSummary, "insufficientDataCount")
                - number(baselineSummary, "insufficientDataCount"));
        delta.put("recommendationValueTotal", number(candidateSummary, "recommendationValueTotal")
                - number(baselineSummary, "recommendationValueTotal"));
        return Map.of("status", "READ_ONLY", "type", normalized,
                "algorithm", "PRICING".equals(normalized) ? "pricing-rule-v1" : "replenishment-rule-v1",
                "baselineVersion", baselineVersion, "candidateVersion", candidateVersion,
                "baseline", baselineSummary, "candidate", candidateSummary, "delta", delta);
    }

    private static Map<String, Object> summarize(String type, Map<String, Object> replay) {
        List<?> items = replay.get("items") instanceof List<?> list ? list : List.of();
        int actionable = 0;
        int incomplete = 0;
        double value = 0d;
        for (Object raw : items) {
            if (!(raw instanceof Map<?, ?> item)) continue;
            String status = String.valueOf(item.get("status"));
            if ("INSUFFICIENT_DATA".equals(status) || "INCOMPLETE_DATA".equals(status)) {
                incomplete++;
                continue;
            }
            actionable++;
            value += numberAny(item, "PRICING".equals(type) ? "suggestedPrice" : "suggestedQuantity");
        }
        return Map.of("itemCount", items.size(), "actionableCount", actionable,
                "insufficientDataCount", incomplete, "recommendationValueTotal", value);
    }

    private static double numberAny(Map<?, ?> values, String key) {
        Object value = values.get(key);
        if (value instanceof Number number) return number.doubleValue();
        try { return value == null ? 0d : Double.parseDouble(value.toString()); }
        catch (RuntimeException ignored) { return 0d; }
    }

    private static void requireVersion(String version) {
        if (version == null || version.isBlank() || version.length() > 160
                || !version.matches("[A-Za-z0-9._:-]+")) {
            throw new IllegalArgumentException("Invalid snapshot version");
        }
    }

    private static Map<String, OdooReadSnapshotRepository.SnapshotRow> byId(List<OdooReadSnapshotRepository.SnapshotRow> rows) {
        Map<String, OdooReadSnapshotRepository.SnapshotRow> result = new LinkedHashMap<>();
        for (OdooReadSnapshotRepository.SnapshotRow row : rows) result.put(row.sourceRecordId(), row);
        return result;
    }

    private static double number(Map<String, Object> payload, String key) {
        if (payload == null) return 0;
        Object value = payload.get(key);
        if (value instanceof Number number) return number.doubleValue();
        try { return value == null ? 0 : Double.parseDouble(value.toString()); }
        catch (RuntimeException ignored) { return 0; }
    }

    private static double number(OdooReadSnapshotRepository.SnapshotRow row, String key) {
        return row == null ? 0 : number(row.payload(), key);
    }

    private static boolean hasNumber(Map<String, Object> payload, String key) {
        if (payload == null || payload.get(key) == null) return false;
        if (payload.get(key) instanceof Number) return true;
        try {
            Double.parseDouble(payload.get(key).toString());
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }
}
