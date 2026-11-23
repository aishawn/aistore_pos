package com.orithos.modules.ai.replenishment;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Deterministic reorder-point calculation used before any purchase draft. */
public final class ReplenishmentDecisionEngine {
    private ReplenishmentDecisionEngine() { }

    static int effectiveCoverage(int coverageDays, Integer leadTimeDays) {
        return leadTimeDays == null ? coverageDays : Math.max(coverageDays, leadTimeDays);
    }

    static double coverageOrderQuantity(double demand, int effectiveCoverage, double available,
                                        double caseQuantity, double minimumOrder) {
        double shortfall = demand * effectiveCoverage - available;
        if (shortfall <= 0) return 0;
        double casePack = Math.max(1d, caseQuantity);
        return Math.ceil(Math.max(shortfall, Math.max(1d, minimumOrder)) / casePack) * casePack;
    }

    public static Decision decide(Input input) {
        if (input == null || input.onHand() < 0 || input.onOrder() < 0 || input.averageDailyDemand() < 0
                || input.demandStdDev() < 0 || input.leadTimeDays() < 0 || input.coverageDays() < 0
                || input.casePack() <= 0) {
            return Decision.incomplete("invalid inventory or demand data");
        }
        if (!input.supplierAvailable()) return Decision.incomplete("supplier is unavailable");
        double safety = input.serviceFactor() * input.demandStdDev() * Math.sqrt(input.leadTimeDays());
        double reorderPoint = input.averageDailyDemand() * input.leadTimeDays() + safety;
        double target = input.averageDailyDemand() * input.coverageDays() + safety;
        double raw = Math.max(0, target - input.onHand() - input.onOrder() + input.backorder());
        double suggested = Math.ceil(raw / input.casePack()) * input.casePack();
        return new Decision(round(reorderPoint), round(safety), round(suggested),
                suggested > 0 ? Status.REVIEW : Status.HOLD, "lead time, demand variability and coverage policy");
    }

    private static double round(double value) { return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).doubleValue(); }

    public enum Status { REVIEW, HOLD, INCOMPLETE_DATA }
    public record Input(double onHand, double onOrder, double backorder, double averageDailyDemand,
                        double demandStdDev, double leadTimeDays, double coverageDays, double serviceFactor,
                        double casePack, boolean supplierAvailable) { }
    public record Decision(double reorderPoint, double safetyStock, double suggestedQuantity,
                           Status status, String explanation) {
        static Decision incomplete(String reason) { return new Decision(0, 0, 0, Status.INCOMPLETE_DATA, reason); }
    }
}
