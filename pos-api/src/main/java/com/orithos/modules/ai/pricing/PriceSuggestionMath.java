package com.orithos.modules.ai.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Port of {@code pos-ui/src/lib/price-suggestion-math.ts} for in-chat pricing briefs.
 * Does not invent GST — only simple percentage sale taxes from the native catalogue.
 */
public final class PriceSuggestionMath {

    private PriceSuggestionMath() {
    }

    public static Double suggestedListPrice(double cost, double margin, List<SuggestionTax> taxes) {
        if (!Double.isFinite(cost) || cost <= 0 || !Double.isFinite(margin) || margin <= 0 || margin >= 1
                || taxes == null || taxes.isEmpty()) {
            return null;
        }
        if (!simplePercentTaxes(taxes)) {
            return null;
        }
        double rate = taxes.stream().mapToDouble(t -> t.amount() / 100d).sum();
        double net = cost / (1 - margin);
        boolean priceInclude = taxes.get(0).priceInclude();
        double stored = priceInclude ? net * (1 + rate) : net;
        double step = priceInclude ? 0.05 : 0.01;
        double rounded = Math.ceil(stored / step - 1e-9) * step;
        return roundCents(rounded);
    }

    public static Double netMargin(double netPrice, double cost) {
        if (!Double.isFinite(netPrice) || netPrice <= 0 || !Double.isFinite(cost) || cost <= 0) {
            return null;
        }
        return (netPrice - cost) / netPrice;
    }

    public static TaxTotals computeSimpleTaxTotals(double price, List<SuggestionTax> taxes) {
        if (!Double.isFinite(price) || price <= 0 || taxes == null || taxes.isEmpty() || !simplePercentTaxes(taxes)) {
            return null;
        }
        double rate = taxes.stream().mapToDouble(t -> t.amount() / 100d).sum();
        boolean priceInclude = taxes.get(0).priceInclude();
        double totalIncluded = priceInclude ? price : price * (1 + rate);
        double totalExcluded = priceInclude ? price / (1 + rate) : price;
        if (!Double.isFinite(totalExcluded) || !Double.isFinite(totalIncluded)
                || totalExcluded <= 0 || totalIncluded < totalExcluded) {
            return null;
        }
        return new TaxTotals(roundCents(totalExcluded), roundCents(totalIncluded));
    }

    public static boolean simplePercentTaxes(List<SuggestionTax> taxes) {
        if (taxes == null || taxes.isEmpty()) {
            return false;
        }
        boolean priceInclude = taxes.get(0).priceInclude();
        for (SuggestionTax tax : taxes) {
            if (!"percent".equalsIgnoreCase(tax.amountType())
                    || !Double.isFinite(tax.amount()) || tax.amount() < 0
                    || tax.includeBaseAmount()
                    || tax.priceInclude() != priceInclude) {
                return false;
            }
        }
        return true;
    }

    private static double roundCents(double value) {
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    public record TaxTotals(double totalExcluded, double totalIncluded) {
    }
}
