package com.orithos.modules.report;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

/**
 * One-day sales aggregate. JSON field names are English camelCase.
 */
public record DailySalesReport(
        LocalDate date,
        BigDecimal totalSales,
        BigDecimal cost,
        long transactionCount,
        BigDecimal grossProfit,
        BigDecimal grossProfitMargin
) {
    static DailySalesReport of(LocalDate date, BigDecimal totalSales, BigDecimal cost, long transactionCount) {
        BigDecimal sales = scaleMoney(totalSales);
        BigDecimal cogs = scaleMoney(cost);
        BigDecimal profit = sales.subtract(cogs).setScale(2, RoundingMode.HALF_UP);
        BigDecimal margin = sales.compareTo(BigDecimal.ZERO) == 0
                ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                : profit.multiply(BigDecimal.valueOf(100)).divide(sales, 2, RoundingMode.HALF_UP);
        return new DailySalesReport(date, sales, cogs, transactionCount, profit, margin);
    }

    private static BigDecimal scaleMoney(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }
}
