package com.orithos.modules.pricing;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TierPriceCalculatorTest {

    private static final List<TierPriceCalculator.Tier> TIERS = List.of(
            new TierPriceCalculator.Tier(new BigDecimal("1"), new BigDecimal("10.00")),
            new TierPriceCalculator.Tier(new BigDecimal("2"), new BigDecimal("7.50")));

    @Test
    void highMixUsesTheLowestEligibleUnitPrice() {
        var result = TierPriceCalculator.price(new BigDecimal("3"), TIERS, "HIGH_MIX_PRICE", "REDISTRIBUTE");

        assertEquals(new BigDecimal("22.50"), result.lineTotal());
    }

    @Test
    void lowMixUsesTheHighestEligibleUnitPrice() {
        var result = TierPriceCalculator.price(new BigDecimal("3"), TIERS, "LOW_MIX_PRICE", "REDISTRIBUTE");

        assertEquals(new BigDecimal("30.00"), result.lineTotal());
    }

    @Test
    void averageUsesTheMeanOfEligibleUnitPrices() {
        var result = TierPriceCalculator.price(new BigDecimal("3"), TIERS, "AVERAGE", "REDISTRIBUTE");

        assertEquals(new BigDecimal("26.25"), result.lineTotal());
    }

    @Test
    void fractionalQuantityUsesTheBestApplicableUnitRate() {
        var result = TierPriceCalculator.price(new BigDecimal("2.5"), TIERS, "HIGH_MIX_PRICE", "ROUND");

        assertEquals(new BigDecimal("18.75"), result.lineTotal());
    }

    @Test
    void truncateAndRoundApplyToTierTotalsWhileRedistributeRoundsTheLineTotal() {
        List<TierPriceCalculator.Tier> fractionalCentTier = List.of(
                new TierPriceCalculator.Tier(new BigDecimal("1"), new BigDecimal("0.335")));

        assertEquals(new BigDecimal("0.99"), TierPriceCalculator.price(
                new BigDecimal("3"), fractionalCentTier, "HIGH_MIX_PRICE", "TRUNCATE").lineTotal());
        assertEquals(new BigDecimal("1.02"), TierPriceCalculator.price(
                new BigDecimal("3"), fractionalCentTier, "HIGH_MIX_PRICE", "ROUND").lineTotal());
        assertEquals(new BigDecimal("1.01"), TierPriceCalculator.price(
                new BigDecimal("3"), fractionalCentTier, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
    }

    @Test
    void supportsLargeWholeQuantities() {
        assertEquals(new BigDecimal("16106127360.00"), TierPriceCalculator.price(
                new BigDecimal("2147483648"), TIERS, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
    }

    @Test
    void rejectsQuantityPrecisionFinerThanTheSupportedCalculationQuantum() {
        assertEquals(new BigDecimal("10.00"), TierPriceCalculator.price(
                new BigDecimal("1.00001"), TIERS, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
    }
}
