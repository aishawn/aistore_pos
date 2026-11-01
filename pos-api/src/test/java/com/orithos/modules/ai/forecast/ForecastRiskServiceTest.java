package com.orithos.modules.ai.forecast;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ForecastRiskServiceTest {
    @Test
    void incomingStockPreventsFalseStockoutAlert() {
        List<ForecastDtos.Point> forecast = List.of(
                new ForecastDtos.Point(LocalDate.parse("2026-11-01"), 4, 5, 6),
                new ForecastDtos.Point(LocalDate.parse("2026-11-02"), 4, 5, 6),
                new ForecastDtos.Point(LocalDate.parse("2026-11-03"), 4, 5, 6));

        assertEquals(0, ForecastRiskService.firstStockoutDay(forecast, 30));
        assertEquals(3, ForecastRiskService.firstStockoutDay(forecast, 8));
    }

    @Test
    void zeroDemandDoesNotCreateStockout() {
        List<ForecastDtos.Point> forecast = List.of(
                new ForecastDtos.Point(LocalDate.parse("2026-11-01"), 0, 0, 0),
                new ForecastDtos.Point(LocalDate.parse("2026-11-02"), 0, 0, 0));

        assertEquals(0, ForecastRiskService.firstStockoutDay(forecast, 0));
    }

    @Test
    void negativeInventoryIsDataQualityNotNormalStockout() {
        assertEquals(true, ForecastRiskService.hasNegativeBalance(-1d, -1d));
        assertEquals(true, ForecastRiskService.hasNegativeBalance(2d, -1d));
        assertEquals(false, ForecastRiskService.hasNegativeBalance(2d, 1d));
        assertEquals(0, ForecastRiskService.firstStockoutDay(
                List.of(new ForecastDtos.Point(LocalDate.parse("2026-11-01"), 4, 5, 6)), -1));
    }

    @Test
    void lowConfidenceForecastIsNotActionable() {
        ForecastDtos.Point point = new ForecastDtos.Point(LocalDate.parse("2026-11-01"), 4, 5, 6);
        assertEquals(false, ForecastRiskService.isActionableForecast(
                new ForecastDtos.Item(1, List.of(point), "VALID", "LOW")));
        assertEquals(false, ForecastRiskService.isActionableForecast(
                new ForecastDtos.Item(1, List.of(point), "CENSORED_DEMAND", "MEDIUM")));
        assertEquals(true, ForecastRiskService.isActionableForecast(
                new ForecastDtos.Item(1, List.of(point), "VALID", "MEDIUM")));
    }
}
