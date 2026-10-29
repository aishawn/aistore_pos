package com.orithos.modules.ai.pricing;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Deterministic, explainable first-generation pricing policy. It produces a
 * proposal only; an Odoo adapter and a human confirmation are required to write.
 */
public final class PricingDecisionEngine {
    private PricingDecisionEngine() {
    }

    public static Decision decide(Input input, Limits limits) {
        if (input == null || limits == null || input.currentPrice() <= 0 || input.cost() < 0
                || input.averageDailyUnits() < 0 || input.stockUnits() < 0) {
            return Decision.insufficient("invalid or incomplete pricing data");
        }
        if (input.promoLocked() || input.manualLock()) {
            return Decision.hold("price is locked by an active rule");
        }
        double target = input.currentPrice();
        if (input.averageDailyUnits() < limits.slowMovingDailyUnits() && input.stockUnits() > limits.highStockUnits()) {
            target = input.currentPrice() * (1 - limits.slowMovingDiscount());
        } else if (input.averageDailyUnits() >= limits.strongDemandDailyUnits()
                && input.stockUnits() <= limits.lowStockUnits()) {
            target = input.currentPrice() * (1 + limits.strongDemandIncrease());
        } else {
            return Decision.hold("current demand and stock are within policy bands");
        }
        double floor = input.cost() == 0 ? 0 : input.cost() / (1 - limits.minimumMargin());
        target = Math.max(target, floor);
        double change = target / input.currentPrice() - 1;
        if (Math.abs(change) > limits.maxChangeRate()) {
            target = input.currentPrice() * (1 + Math.copySign(limits.maxChangeRate(), change));
        }
        target = round(target, limits.roundingStep());
        if (target <= 0 || Math.abs(target - input.currentPrice()) < limits.minimumChange()) {
            return Decision.hold("calculated change is below the review threshold");
        }
        return new Decision(Status.REVIEW, round(target, 2), round(target - input.currentPrice(), 2),
                List.of("demand=" + input.averageDailyUnits(), "stock=" + input.stockUnits()), "policy recommendation");
    }

    private static double round(double value, double step) {
        if (step <= 0) return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue();
        return BigDecimal.valueOf(Math.ceil(value / step - 1e-9) * step).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    public enum Status { REVIEW, HOLD, INSUFFICIENT_DATA }

    public record Input(double currentPrice, double cost, double averageDailyUnits, double stockUnits,
                        boolean promoLocked, boolean manualLock) { }

    public record Limits(double slowMovingDailyUnits, double highStockUnits, double slowMovingDiscount,
                         double strongDemandDailyUnits, double lowStockUnits, double strongDemandIncrease,
                         double minimumMargin, double maxChangeRate, double minimumChange, double roundingStep) {
        public Limits {
            if (minimumMargin < 0 || minimumMargin >= 1 || maxChangeRate < 0 || maxChangeRate > 1
                    || slowMovingDiscount < 0 || strongDemandIncrease < 0) {
                throw new IllegalArgumentException("invalid pricing limits");
            }
        }
    }

    public record Decision(Status status, Double suggestedPrice, Double delta, List<String> evidence, String reason) {
        static Decision hold(String reason) { return new Decision(Status.HOLD, null, null, List.of(), reason); }
        static Decision insufficient(String reason) { return new Decision(Status.INSUFFICIENT_DATA, null, null, List.of(), reason); }
    }
}
