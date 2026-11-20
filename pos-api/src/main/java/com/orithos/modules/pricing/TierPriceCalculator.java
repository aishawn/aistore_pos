package com.orithos.modules.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;

/** Calculates a line total from unit prices that apply at quantity thresholds. */
public final class TierPriceCalculator {
    private TierPriceCalculator() {}

    public record Tier(BigDecimal quantity, BigDecimal price) {}
    public record Result(BigDecimal lineTotal) {}

    public static Result price(BigDecimal quantity, List<Tier> tiers, String quantityRate, String roundingMode) {
        if (quantity == null || quantity.signum() <= 0) throw new IllegalArgumentException("quantity must be positive");
        List<Tier> eligible = tiers == null ? List.of() : tiers.stream()
                .filter(t -> t != null && t.quantity() != null && t.price() != null
                        && t.quantity().signum() > 0 && t.price().signum() >= 0
                        && t.quantity().compareTo(quantity) <= 0)
                .sorted(Comparator.comparing(Tier::quantity))
                .toList();
        if (eligible.isEmpty()) throw new IllegalArgumentException("no price tier applies to the requested quantity");

        List<BigDecimal> prices = eligible.stream().map(Tier::price).toList();
        BigDecimal unitPrice = switch (quantityRate == null ? "HIGH_MIX_PRICE" : quantityRate.toUpperCase()) {
            case "LOW_MIX_PRICE" -> prices.stream().max(BigDecimal::compareTo).orElseThrow();
            case "AVERAGE" -> prices.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                    .divide(BigDecimal.valueOf(prices.size()), 8, RoundingMode.HALF_UP);
            default -> prices.stream().min(BigDecimal::compareTo).orElseThrow();
        };

        String mode = roundingMode == null ? "REDISTRIBUTE" : roundingMode.toUpperCase();
        if ("TRUNCATE".equals(mode)) unitPrice = unitPrice.setScale(2, RoundingMode.DOWN);
        else if ("ROUND".equals(mode)) unitPrice = unitPrice.setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = quantity.multiply(unitPrice);
        if ("TRUNCATE".equals(mode)) total = total.setScale(2, RoundingMode.DOWN);
        else total = total.setScale(2, RoundingMode.HALF_UP);
        return new Result(total);
    }
}
