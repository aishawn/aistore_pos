package com.orithos.modules.pricing;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FamilyPriceCalculatorTest {
    private static final List<TierPriceCalculator.Tier> A_TIERS = List.of(
            tier("1", "10.00"), tier("3", "6.00"));
    private static final List<TierPriceCalculator.Tier> B_TIERS = List.of(
            tier("1", "30.00"), tier("3", "12.00"));

    @Test
    void matchPricePointsUseTheCombinedFamilyQuantityForEachProductsOwnTiers() {
        var lines = List.of(
                line(1L, new BigDecimal("2"), new BigDecimal("10"), A_TIERS),
                line(2L, new BigDecimal("1"), new BigDecimal("20"), B_TIERS));

        List<BigDecimal> totals = FamilyPriceCalculator.price(lines, "MATCH_PRICE_POINTS", "HIGH_MIX_PRICE", "REDISTRIBUTE");

        assertEquals(List.of(new BigDecimal("12.00"), new BigDecimal("12.00")), totals);
        assertEquals(new BigDecimal("24.00"), totals.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    @Test
    void proportionalModeKeepsTheFamilyTotalAndAllocatesItByBaseLineValue() {
        var lines = List.of(
                line(1L, new BigDecimal("2"), new BigDecimal("10"), A_TIERS),
                line(2L, new BigDecimal("1"), new BigDecimal("20"), B_TIERS));

        List<BigDecimal> totals = FamilyPriceCalculator.price(lines, "PROPORTIONAL", "HIGH_MIX_PRICE", "REDISTRIBUTE");

        assertEquals(List.of(new BigDecimal("9.60"), new BigDecimal("14.40")), totals);
        assertEquals(new BigDecimal("24.00"), totals.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    @Test
    void duplicateLinesForTheSameProductShareItsFamilyTierTotalWithoutChangingTheBasketTotal() {
        var lines = List.of(
                line(1L, new BigDecimal("1"), new BigDecimal("10"), A_TIERS),
                line(1L, new BigDecimal("1"), new BigDecimal("10"), A_TIERS),
                line(2L, new BigDecimal("1"), new BigDecimal("20"), B_TIERS));

        List<BigDecimal> totals = FamilyPriceCalculator.price(lines, "MATCH_PRICE_POINTS", "HIGH_MIX_PRICE", "REDISTRIBUTE");

        assertEquals(List.of(new BigDecimal("6.00"), new BigDecimal("6.00"), new BigDecimal("12.00")), totals);
        assertEquals(new BigDecimal("24.00"), totals.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    @Test
    void nonFamilyProductsKeepTheirOwnQuantityPricing() {
        List<BigDecimal> totals = FamilyPriceCalculator.price(
                List.of(new FamilyPriceCalculator.Line(1L, null, new BigDecimal("2"),
                        new BigDecimal("10"), A_TIERS)),
                "MATCH_PRICE_POINTS", "HIGH_MIX_PRICE", "REDISTRIBUTE");

        assertEquals(List.of(new BigDecimal("20.00")), totals);
    }

    @Test
    void familyPricingUsesHighLowAndAverageAtCombinedQuantity() {
        var lines = List.of(
                line(1L, new BigDecimal("2"), new BigDecimal("10"), A_TIERS),
                line(2L, new BigDecimal("1"), new BigDecimal("30"), B_TIERS));

        assertEquals(List.of(new BigDecimal("12.00"), new BigDecimal("12.00")),
                FamilyPriceCalculator.price(lines, "MATCH_PRICE_POINTS", "HIGH_MIX_PRICE", "REDISTRIBUTE"));
        assertEquals(List.of(new BigDecimal("20.00"), new BigDecimal("30.00")),
                FamilyPriceCalculator.price(lines, "MATCH_PRICE_POINTS", "LOW_MIX_PRICE", "REDISTRIBUTE"));
        assertEquals(List.of(new BigDecimal("16.00"), new BigDecimal("21.00")),
                FamilyPriceCalculator.price(lines, "MATCH_PRICE_POINTS", "AVERAGE", "REDISTRIBUTE"));
    }

    private static FamilyPriceCalculator.Line line(long productId, BigDecimal quantity, BigDecimal unitPrice,
                                                    List<TierPriceCalculator.Tier> tiers) {
        return new FamilyPriceCalculator.Line(productId, 7L, quantity, unitPrice, tiers);
    }

    private static TierPriceCalculator.Tier tier(String quantity, String price) {
        return new TierPriceCalculator.Tier(new BigDecimal(quantity), new BigDecimal(price));
    }
}
