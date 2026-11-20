package com.orithos.modules.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Applies each product's quantity price points against the combined quantity of its family. */
public final class FamilyPriceCalculator {
    private FamilyPriceCalculator() {}

    public record Line(Long productId, Long familyId, BigDecimal quantity, BigDecimal unitPrice,
                       List<TierPriceCalculator.Tier> tiers) {}

    public static List<BigDecimal> price(List<Line> lines, String distribution,
                                         String quantityRate, String roundingMode) {
        List<BigDecimal> totals = new ArrayList<>(lines.size());
        Map<Long, List<Integer>> familyLines = new LinkedHashMap<>();
        for (int i = 0; i < lines.size(); i++) {
            Line line = lines.get(i);
            totals.add(priceAt(line, line.quantity(), quantityRate, roundingMode));
            if (line.familyId() != null) familyLines.computeIfAbsent(line.familyId(), ignored -> new ArrayList<>()).add(i);
        }

        for (List<Integer> indexes : familyLines.values()) {
            BigDecimal familyQuantity = indexes.stream().map(index -> lines.get(index).quantity())
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            Map<Long, List<Integer>> productLines = new LinkedHashMap<>();
            for (int index : indexes) productLines.computeIfAbsent(lines.get(index).productId(), ignored -> new ArrayList<>()).add(index);

            Map<Long, BigDecimal> familyPointPrices = new LinkedHashMap<>();
            Map<Long, BigDecimal> baseUnitPrices = new LinkedHashMap<>();
            for (Map.Entry<Long, List<Integer>> entry : productLines.entrySet()) {
                Line representative = lines.get(entry.getValue().get(0));
                BigDecimal familyTotal = priceAt(representative, familyQuantity, quantityRate, roundingMode);
                familyPointPrices.put(entry.getKey(), familyTotal.divide(familyQuantity, 12, RoundingMode.HALF_UP));
                baseUnitPrices.put(entry.getKey(), priceAt(representative, BigDecimal.ONE, quantityRate, roundingMode));
            }

            if ("PROPORTIONAL".equalsIgnoreCase(distribution)) {
                allocateProportionally(lines, indexes, productLines, familyPointPrices, baseUnitPrices, totals);
            } else {
                for (Map.Entry<Long, List<Integer>> entry : productLines.entrySet()) {
                    BigDecimal productQuantity = entry.getValue().stream().map(index -> lines.get(index).quantity())
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    BigDecimal productTotal = familyPointPrices.get(entry.getKey()).multiply(productQuantity).setScale(2, RoundingMode.HALF_UP);
                    allocate(productTotal, entry.getValue(), lines, totals, false, baseUnitPrices);
                }
            }
        }
        return List.copyOf(totals);
    }

    private static BigDecimal priceAt(Line line, BigDecimal quantity, String quantityRate, String roundingMode) {
        if (line.tiers() == null || line.tiers().isEmpty()) {
            return quantity.multiply(line.unitPrice()).setScale(2, RoundingMode.HALF_UP);
        }
        return TierPriceCalculator.price(quantity, line.tiers(), quantityRate, roundingMode).lineTotal();
    }

    private static void allocateProportionally(List<Line> lines, List<Integer> indexes,
                                               Map<Long, List<Integer>> productLines,
                                               Map<Long, BigDecimal> familyPointPrices,
                                               Map<Long, BigDecimal> baseUnitPrices,
                                               List<BigDecimal> totals) {
        BigDecimal target = BigDecimal.ZERO;
        for (Map.Entry<Long, List<Integer>> entry : productLines.entrySet()) {
            BigDecimal quantity = entry.getValue().stream().map(index -> lines.get(index).quantity())
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            target = target.add(familyPointPrices.get(entry.getKey()).multiply(quantity));
        }
        target = target.setScale(2, RoundingMode.HALF_UP);
        allocate(target, indexes, lines, totals, true, baseUnitPrices);
    }

    private static void allocate(BigDecimal target, List<Integer> indexes, List<Line> lines,
                                 List<BigDecimal> totals, boolean byBasePrice,
                                 Map<Long, BigDecimal> baseUnitPrices) {
        BigDecimal remainingTarget = target;
        BigDecimal remainingWeight = weightSum(indexes, lines, byBasePrice, baseUnitPrices);
        if (remainingWeight.signum() <= 0) {
            byBasePrice = false;
            remainingWeight = weightSum(indexes, lines, false, baseUnitPrices);
        }
        for (int position = 0; position < indexes.size(); position++) {
            int index = indexes.get(position);
            BigDecimal weight = weight(lines.get(index), byBasePrice, baseUnitPrices);
            BigDecimal amount;
            if (position == indexes.size() - 1 || remainingWeight.signum() <= 0) {
                amount = remainingTarget;
            } else {
                amount = remainingTarget.multiply(weight).divide(remainingWeight, 8, RoundingMode.HALF_UP)
                        .setScale(2, RoundingMode.HALF_UP);
            }
            totals.set(index, amount);
            remainingTarget = remainingTarget.subtract(amount);
            remainingWeight = remainingWeight.subtract(weight);
        }
    }

    private static BigDecimal weight(Line line, boolean byBasePrice, Map<Long, BigDecimal> baseUnitPrices) {
        return (byBasePrice ? baseUnitPrices.get(line.productId()) : BigDecimal.ONE).multiply(line.quantity());
    }

    private static BigDecimal weightSum(List<Integer> indexes, List<Line> lines, boolean byBasePrice,
                                        Map<Long, BigDecimal> baseUnitPrices) {
        BigDecimal total = BigDecimal.ZERO;
        for (int index : indexes) total = total.add(weight(lines.get(index), byBasePrice, baseUnitPrices));
        return total;
    }
}
