package com.orithos.modules.ai.snapshot;

import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SnapshotDecisionEvaluatorTest {
    private final OdooReadSnapshotRepository repository = mock(OdooReadSnapshotRepository.class);
    private final SnapshotDecisionEvaluator evaluator = new SnapshotDecisionEvaluator(repository);
    private final TenantContext tenant = new TenantContext(7, 11, 13L, List.of(13L), Set.of());

    @Test
    void pricingReplayUsesPriceInventoryAndSalesSnapshot() {
        String version = "v1";
        when(repository.findVersion(tenant, version, "PRICE")).thenReturn(List.of(row("10", Map.of(
                "name", "Red", "listPrice", 10.0, "standardPrice", 8.0))));
        when(repository.findVersion(tenant, version, "INVENTORY")).thenReturn(List.of(row("10", Map.of("qtyAvailable", 2))));
        when(repository.findVersion(tenant, version, "SALE_LINE")).thenReturn(List.of(row("10", Map.of("units", 140))));

        Map<String, Object> result = evaluator.evaluatePricing(tenant, version);

        assertEquals("pricing-rule-v1", result.get("algorithm"));
        assertFalse(((List<?>) result.get("items")).isEmpty());
    }

    @Test
    void replenishmentReplayUsesInventoryAndSalesSnapshot() {
        String version = "v1";
        when(repository.findVersion(tenant, version, "INVENTORY")).thenReturn(List.of(row("10", Map.of(
                "name", "Beer", "qtyAvailable", 0))));
        when(repository.findVersion(tenant, version, "SALE_LINE")).thenReturn(List.of(row("10", Map.of("units", 28))));

        Map<String, Object> result = evaluator.evaluateReplenishment(tenant, version);

        assertEquals("replenishment-rule-v1", result.get("algorithm"));
        Map<?, ?> item = (Map<?, ?>) ((List<?>) result.get("items")).get(0);
        assertEquals("REVIEW", item.get("status"));
    }

    private static OdooReadSnapshotRepository.SnapshotRow row(String id, Map<String, Object> payload) {
        return new OdooReadSnapshotRepository.SnapshotRow(id, "VALID", payload);
    }
}
