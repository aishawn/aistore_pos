package com.orithos.modules.ai.snapshot;

import com.orithos.modules.ai.pricing.PricingDecisionEngine;
import com.orithos.modules.ai.replenishment.ReplenishmentDecisionEngine;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
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
            double units = number(sales.get(id), "units");
            double onHand = number(row.payload(), "qtyAvailable");
            double average = units / 28d;
            ReplenishmentDecisionEngine.Decision decision = ReplenishmentDecisionEngine.decide(
                    new ReplenishmentDecisionEngine.Input(onHand, 0, 0, average, Math.sqrt(Math.max(average, 0)),
                            7, 21, 1.65, 1, true));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("productId", id); item.put("name", row.payload().get("name"));
            item.put("status", decision.status().name()); item.put("reorderPoint", decision.reorderPoint());
            item.put("safetyStock", decision.safetyStock()); item.put("suggestedQuantity", decision.suggestedQuantity());
            item.put("explanation", decision.explanation()); items.add(item);
        }
        return Map.of("algorithm", "replenishment-rule-v1", "sourceVersion", sourceVersion, "items", items);
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
}
