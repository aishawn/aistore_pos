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
}
