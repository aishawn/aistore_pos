package com.orithos.modules.ai.forecast;

import java.time.LocalDate;
import java.util.List;

public final class ForecastDtos {
    private ForecastDtos() { }

    public record Series(long productId, List<LocalDate> dates, List<Double> units,
                         List<Boolean> stockoutFlags) { }
    public record Request(long vendorId, long outletId, int horizonDays, String sourceVersion,
                          java.time.LocalDate forecastStartDate, List<Series> series) { }
    public record Point(LocalDate date, double p50, double p80, double p90) { }
    public record Item(long productId, List<Point> forecast, String dataQuality, String confidence) { }
    public record Response(String model, String modelVersion, String sourceVersion,
                           int horizonDays, List<Item> items) { }
}
