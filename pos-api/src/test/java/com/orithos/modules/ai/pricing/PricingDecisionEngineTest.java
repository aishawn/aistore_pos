package com.orithos.modules.ai.pricing;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PricingDecisionEngineTest {
    private static final PricingDecisionEngine.Limits LIMITS = new PricingDecisionEngine.Limits(
            1, 100, .10, 10, 5, .05, .30, .15, .05, .05);

    @Test
    void recommendsDiscountForSlowMovingOverstockButRespectsMarginFloor() {
        var result = PricingDecisionEngine.decide(
                new PricingDecisionEngine.Input(20, 10, .5, 150, false, false), LIMITS);
        assertEquals(PricingDecisionEngine.Status.REVIEW, result.status());
        assertEquals(18.0, result.suggestedPrice());
    }

    @Test
    void locksPromotionalProductsAndRejectsIncompleteData() {
        assertEquals(PricingDecisionEngine.Status.HOLD, PricingDecisionEngine.decide(
                new PricingDecisionEngine.Input(20, 10, 20, 1, true, false), LIMITS).status());
        assertEquals(PricingDecisionEngine.Status.INSUFFICIENT_DATA, PricingDecisionEngine.decide(
                new PricingDecisionEngine.Input(0, 10, 1, 1, false, false), LIMITS).status());
    }

    @Test
    void refusesWhenMarginFloorCannotFitChangeLimit() {
        var result = PricingDecisionEngine.decide(
                new PricingDecisionEngine.Input(20, 19, .5, 150, false, false), LIMITS);
        assertEquals(PricingDecisionEngine.Status.HOLD, result.status());
        assertTrue(result.reason().contains("maximum price-change"));
    }
}
