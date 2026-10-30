package com.orithos.modules.ai.forecast;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ForecastService {
    private final JdbcTemplate jdbc;
    private final ForecastClient client;
    private final boolean enabled;
    private final int maxHistoryDays;

    public ForecastService(JdbcTemplate jdbc, ForecastClient client,
                           @Value("${app.ai.forecast.enabled:false}") boolean enabled,
                           @Value("${app.ai.forecast.max-history-days:365}") int maxHistoryDays) {
        this.jdbc = jdbc; this.client = client; this.enabled = enabled;
        this.maxHistoryDays = Math.max(14, Math.min(maxHistoryDays, 730));
    }

    public ForecastDtos.Response forecast(TenantContext tenant, int horizonDays) {
        if (!enabled) throw new BusinessException(50332, "AI forecast is disabled.");
        int horizon = Math.max(1, Math.min(horizonDays, 90));
        List<ForecastDtos.Series> series = new ArrayList<>();
        Map<Long, List<Daily>> grouped = new LinkedHashMap<>();
        jdbc.query("""
                SELECT product_id, business_date, units_sold
                FROM ai_sales_daily
                WHERE vendor_id = ? AND outlet_id = ?
                  AND business_date >= CURRENT_DATE - (? * INTERVAL '1 day')
                  AND data_quality_status = 'VALID'
                ORDER BY product_id, business_date
                """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> grouped.computeIfAbsent(rs.getLong("product_id"), ignored -> new ArrayList<>())
                .add(new Daily(rs.getDate("business_date").toLocalDate(), rs.getDouble("units_sold"))),
                tenant.vendorId(), tenant.requireOutletId(), maxHistoryDays);
        for (Map.Entry<Long, List<Daily>> entry : grouped.entrySet()) {
            if (entry.getValue().size() < 2) continue;
            Map<LocalDate, Double> byDate = new HashMap<>();
            for (Daily daily : entry.getValue()) byDate.put(daily.date(), daily.units());
            LocalDate end = entry.getValue().getLast().date();
            LocalDate start = end.minusDays(maxHistoryDays - 1L);
            List<LocalDate> dates = new ArrayList<>();
            List<Double> units = new ArrayList<>();
            for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
                dates.add(day); units.add(byDate.getOrDefault(day, 0d));
            }
            series.add(new ForecastDtos.Series(entry.getKey(), dates, units));
        }
        if (series.isEmpty()) throw new BusinessException(40431, "No valid daily sales history is available.");
        String sourceVersion = jdbc.query("""
                SELECT source_version FROM ai_sales_daily
                WHERE vendor_id = ? AND outlet_id = ?
                ORDER BY data_as_of DESC LIMIT 1
                """, rs -> rs.next() ? rs.getString(1) : "unknown",
                tenant.vendorId(), tenant.requireOutletId());
        return client.forecast(new ForecastDtos.Request(tenant.vendorId(), tenant.requireOutletId(), horizon,
                sourceVersion, LocalDate.now(), series));
    }

    private record Daily(LocalDate date, double units) { }
}
