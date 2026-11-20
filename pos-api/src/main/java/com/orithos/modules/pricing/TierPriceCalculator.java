package com.orithos.modules.pricing;

import com.orithos.common.BusinessException;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;

/** Calculates a line total from unit prices that apply at quantity thresholds. */
public final class TierPriceCalculator {
    private static final int MAX_KNAPSACK_STEPS = 100_000;

    private TierPriceCalculator() {}

    public record Tier(BigDecimal quantity, BigDecimal price) {}
    public record Result(BigDecimal lineTotal) {}

    public static Result price(BigDecimal quantity, List<Tier> tiers, String quantityRate, String roundingMode) {
        if (quantity == null || quantity.signum() <= 0) throw new IllegalArgumentException("quantity must be positive");
        List<Tier> valid = tiers == null ? List.of() : tiers.stream()
                .filter(t -> t != null && t.quantity() != null && t.price() != null
                        && t.quantity().signum() > 0 && t.price().signum() >= 0)
                .sorted(Comparator.comparing(Tier::quantity))
                .toList();
        if (valid.isEmpty()) throw new IllegalArgumentException("no valid price tier is available");
        List<Tier> eligible = valid.stream().filter(t -> t.quantity().compareTo(quantity) <= 0).toList();
        Tier base = valid.get(0);
        String mode = roundingMode == null ? "REDISTRIBUTE" : roundingMode.toUpperCase();
        if (eligible.isEmpty()) {
            return new Result(roundTotal(quantity.multiply(roundUnitPrice(base.price(), mode)), mode));
        }

        String rate = quantityRate == null ? "HIGH_MIX_PRICE" : quantityRate.toUpperCase();
        if ("HIGH_MIX_PRICE".equals(rate)) {
            return new Result(highMixTotal(quantity, eligible, base.quantity(), base.price(), mode));
        }

        List<BigDecimal> prices = eligible.stream().map(Tier::price).toList();
        BigDecimal unitPrice = switch (rate) {
            case "LOW_MIX_PRICE" -> prices.stream().max(BigDecimal::compareTo).orElseThrow();
            case "AVERAGE" -> prices.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                    .divide(BigDecimal.valueOf(prices.size()), 8, RoundingMode.HALF_UP);
            default -> prices.stream().min(BigDecimal::compareTo).orElseThrow();
        };

        if ("TRUNCATE".equals(mode)) unitPrice = unitPrice.setScale(2, RoundingMode.DOWN);
        else if ("ROUND".equals(mode)) unitPrice = unitPrice.setScale(2, RoundingMode.HALF_UP);
        return new Result(roundTotal(quantity.multiply(unitPrice), mode));
    }

    private static BigDecimal highMixTotal(BigDecimal quantity, List<Tier> eligible,
                                           BigDecimal baseQuantity, BigDecimal baseUnitPrice, String roundingMode) {
        int scale = Math.max(0, quantity.stripTrailingZeros().scale());
        for (Tier tier : eligible) scale = Math.max(scale, tier.quantity().stripTrailingZeros().scale());
        BigInteger targetUnits = quantity.setScale(scale).unscaledValue();
        BigInteger divisor = targetUnits;
        for (Tier tier : eligible) divisor = divisor.gcd(tier.quantity().setScale(scale).unscaledValue());
        BigInteger targetStepsValue = targetUnits.divide(divisor);

        if (targetStepsValue.compareTo(BigInteger.valueOf(MAX_KNAPSACK_STEPS)) > 0) {
            return largeHighMixTotal(quantity, eligible, baseUnitPrice, roundingMode);
        }

        final int quantityScale = scale;
        final BigInteger quantityDivisor = divisor;
        int targetSteps = targetStepsValue.intValueExact();
        BigDecimal[] best = new BigDecimal[targetSteps + 1];
        best[0] = BigDecimal.ZERO;
        List<Pack> packs = eligible.stream()
                .map(tier -> new Pack(
                        tier.quantity().setScale(quantityScale).unscaledValue().divide(quantityDivisor).intValueExact(),
                        packTotal(tier, baseQuantity, roundingMode)))
                .toList();
        for (int step = 0; step <= targetSteps; step++) {
            if (best[step] == null) continue;
            for (Pack pack : packs) {
                int next = step + pack.steps();
                if (next > targetSteps) continue;
                BigDecimal candidate = best[step].add(pack.total());
                if (best[next] == null || candidate.compareTo(best[next]) < 0) best[next] = candidate;
            }
        }

        BigDecimal result = null;
        for (int step = 0; step <= targetSteps; step++) {
            if (best[step] == null) continue;
            BigDecimal usedQuantity = new BigDecimal(quantityDivisor.multiply(BigInteger.valueOf(step)), quantityScale);
            BigDecimal remainder = quantity.subtract(usedQuantity);
            BigDecimal candidate = best[step].add(remainder.multiply(roundUnitPrice(baseUnitPrice, roundingMode)));
            if (result == null || candidate.compareTo(result) < 0) result = candidate;
        }
        return roundTotal(result == null ? quantity.multiply(baseUnitPrice) : result, roundingMode);
    }

    private static BigDecimal largeHighMixTotal(BigDecimal quantity, List<Tier> eligible,
                                                BigDecimal baseUnitPrice, String roundingMode) {
        BigDecimal baseRate = roundUnitPrice(baseUnitPrice, roundingMode);
        BigDecimal lowestRate = baseRate;
        List<PackRate> rates = eligible.stream()
                .map(tier -> new PackRate(tier, packTotal(tier, eligible.get(0).quantity(), roundingMode)
                        .divide(tier.quantity(), 18, RoundingMode.DOWN)))
                .toList();
        for (PackRate rate : rates) {
            if (rate.unitPrice().compareTo(lowestRate) < 0) lowestRate = rate.unitPrice();
        }

        BigDecimal lowerBound = roundTotal(quantity.multiply(lowestRate), roundingMode);
        if (baseRate.compareTo(lowestRate) == 0) return lowerBound;
        for (PackRate rate : rates) {
            if (quantity.remainder(rate.tier().quantity()).signum() != 0) continue;
            BigDecimal count = quantity.divideToIntegralValue(rate.tier().quantity());
            BigDecimal candidate = roundTotal(packTotal(rate.tier(), eligible.get(0).quantity(), roundingMode)
                    .multiply(count), roundingMode);
            if (candidate.compareTo(lowerBound) == 0) return candidate;
        }
        throw new BusinessException("Unable to calculate this quantity safely with the configured price tiers.");
    }

    private static BigDecimal packTotal(Tier tier, BigDecimal baseQuantity, String mode) {
        if (tier.quantity().compareTo(baseQuantity) == 0) {
            return tier.quantity().multiply(roundUnitPrice(tier.price(), mode));
        }
        return tier.quantity().multiply(tier.price()).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal roundUnitPrice(BigDecimal unitPrice, String mode) {
        if ("TRUNCATE".equals(mode)) return unitPrice.setScale(2, RoundingMode.DOWN);
        if ("ROUND".equals(mode)) return unitPrice.setScale(2, RoundingMode.HALF_UP);
        return unitPrice;
    }

    private static BigDecimal roundTotal(BigDecimal total, String mode) {
        return "TRUNCATE".equals(mode)
                ? total.setScale(2, RoundingMode.DOWN)
                : total.setScale(2, RoundingMode.HALF_UP);
    }

    private record Pack(int steps, BigDecimal total) {}
    private record PackRate(Tier tier, BigDecimal unitPrice) {}
}
