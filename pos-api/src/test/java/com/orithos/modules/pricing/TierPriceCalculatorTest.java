package com.orithos.modules.pricing;

import com.orithos.common.BusinessException;
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
    void highMixCombinesPackPointsAndBaseUnits() {
        var result = TierPriceCalculator.price(new BigDecimal("3"), TIERS, "HIGH_MIX_PRICE", "REDISTRIBUTE");

        assertEquals(new BigDecimal("25.00"), result.lineTotal());
    }

    @Test
    void quantityRateUsesTheLowestEligibleUnitPrice() {
        var result = TierPriceCalculator.price(new BigDecimal("3"), TIERS, "QUANTITY_RATE", "REDISTRIBUTE");

        assertEquals(new BigDecimal("22.50"), result.lineTotal());
    }

    @Test
    void shopfrontHighMixUsesPackPlusBaseUnitsForSevenItems() {
        List<TierPriceCalculator.Tier> shopfrontPoints = List.of(
                new TierPriceCalculator.Tier(new BigDecimal("1"), new BigDecimal("3.50")),
                new TierPriceCalculator.Tier(new BigDecimal("6"), new BigDecimal("2.50")),
                new TierPriceCalculator.Tier(new BigDecimal("24"), new BigDecimal("2.083333")));

        assertEquals(new BigDecimal("18.50"), TierPriceCalculator.price(
                new BigDecimal("7"), shopfrontPoints, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
        assertEquals(new BigDecimal("17.50"), TierPriceCalculator.price(
                new BigDecimal("7"), shopfrontPoints, "QUANTITY_RATE", "REDISTRIBUTE").lineTotal());
    }

    @Test
    void highMixChoosesTheCheapestCombinationInsteadOfTheLargestPackFirst() {
        List<TierPriceCalculator.Tier> points = List.of(
                new TierPriceCalculator.Tier(new BigDecimal("1"), new BigDecimal("10.00")),
                new TierPriceCalculator.Tier(new BigDecimal("3"), new BigDecimal("4.00")),
                new TierPriceCalculator.Tier(new BigDecimal("4"), new BigDecimal("7.00")));

        assertEquals(new BigDecimal("22.00"), TierPriceCalculator.price(
                new BigDecimal("4"), points, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
    }

    @Test
    void importedLemonPricePointsMatchShopfrontPackTotals() {
        List<TierPriceCalculator.Tier> points = List.of(
                new TierPriceCalculator.Tier(new BigDecimal("1"), new BigDecimal("8.99")),
                new TierPriceCalculator.Tier(new BigDecimal("4"), new BigDecimal("6.7475")),
                new TierPriceCalculator.Tier(new BigDecimal("10"), new BigDecimal("5.199")));

        assertEquals(new BigDecimal("26.99"), TierPriceCalculator.price(
                new BigDecimal("4"), points, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
        assertEquals(new BigDecimal("53.96"), TierPriceCalculator.price(
                new BigDecimal("7"), points, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
        assertEquals(new BigDecimal("51.99"), TierPriceCalculator.price(
                new BigDecimal("10"), points, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
        assertEquals(new BigDecimal("47.23"), TierPriceCalculator.price(
                new BigDecimal("7"), points, "QUANTITY_RATE", "REDISTRIBUTE").lineTotal());
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
    void fractionalQuantityUsesPackPointsAndBaseRateForRemainder() {
        var result = TierPriceCalculator.price(new BigDecimal("2.5"), TIERS, "HIGH_MIX_PRICE", "ROUND");

        assertEquals(new BigDecimal("20.00"), result.lineTotal());
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
    void largeQuantitiesStillChooseTheCheapestTierCombination() {
        List<TierPriceCalculator.Tier> points = List.of(
                new TierPriceCalculator.Tier(new BigDecimal("1"), new BigDecimal("100.00")),
                new TierPriceCalculator.Tier(new BigDecimal("40000"), new BigDecimal("0.001")),
                new TierPriceCalculator.Tier(new BigDecimal("60001"), new BigDecimal("0.001")));

        assertEquals(new BigDecimal("120.00"), TierPriceCalculator.price(
                new BigDecimal("120000"), points, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
    }

    @Test
    void largeQuantitiesRejectUnprovenApproximateHighMixPrices() {
        List<TierPriceCalculator.Tier> points = List.of(
                new TierPriceCalculator.Tier(new BigDecimal("1"), new BigDecimal("100.00")),
                new TierPriceCalculator.Tier(new BigDecimal("40000"), new BigDecimal("0.001")),
                new TierPriceCalculator.Tier(new BigDecimal("60001"), new BigDecimal("0.001")));

        assertThrows(BusinessException.class, () -> TierPriceCalculator.price(
                new BigDecimal("120001"), points, "HIGH_MIX_PRICE", "REDISTRIBUTE"));
    }

    @Test
    void rejectsQuantityPrecisionFinerThanTheSupportedCalculationQuantum() {
        assertEquals(new BigDecimal("10.00"), TierPriceCalculator.price(
                new BigDecimal("1.00001"), TIERS, "HIGH_MIX_PRICE", "REDISTRIBUTE").lineTotal());
    }
}
