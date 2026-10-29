package com.orithos.modules.ai.replenishment;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class ReplenishmentDecisionEngineTest {
    @Test
    void calculatesSafetyStockAndRoundsToCasePack() {
        var result = ReplenishmentDecisionEngine.decide(new ReplenishmentDecisionEngine.Input(
                4, 2, 0, 3, 1, 4, 14, 1.65, 6, true));
        assertEquals(ReplenishmentDecisionEngine.Status.REVIEW, result.status());
        assertEquals(36.0, result.suggestedQuantity());
        assertTrue(result.safetyStock() > 0);
    }

    @Test
    void missingSupplierIsExplicitlyIncomplete() {
        var result = ReplenishmentDecisionEngine.decide(new ReplenishmentDecisionEngine.Input(
                0, 0, 0, 3, 1, 4, 14, 1.65, 6, false));
        assertEquals(ReplenishmentDecisionEngine.Status.INCOMPLETE_DATA, result.status());
    }
}
