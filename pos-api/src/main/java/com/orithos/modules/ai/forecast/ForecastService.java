package com.orithos.modules.ai.forecast;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ForecastService {
    private static final Logger log = LoggerFactory.getLogger(ForecastService.class);
    private final JdbcTemplate jdbc;
    private final ForecastClient client;
    private final ObjectMapper mapper;
    private final boolean enabled;
    private final int maxHistoryDays;

    public ForecastService(JdbcTemplate jdbc, ForecastClient client, ObjectMapper mapper,
                           @Value("${app.ai.forecast.enabled:false}") boolean enabled,
                           @Value("${app.ai.forecast.max-history-days:365}") int maxHistoryDays) {
        this.jdbc = jdbc; this.client = client; this.mapper = mapper; this.enabled = enabled;
        this.maxHistoryDays = Math.max(14, Math.min(maxHistoryDays, 730));
    }

    public ForecastDtos.Response forecast(TenantContext tenant, int horizonDays) {
        if (!enabled) throw new BusinessException(50332, "AI forecast is disabled.");
        int horizon = Math.max(1, Math.min(horizonDays, 90));
        List<ForecastDtos.Series> series = new ArrayList<>();
        Map<Long, List<Daily>> grouped = new LinkedHashMap<>();
        jdbc.query("""
                SELECT product_id, business_date, units_sold
                       , stockout_flag, data_quality_status
                FROM ai_sales_daily
                WHERE vendor_id = ? AND outlet_id = ?
                  AND business_date >= CURRENT_DATE - (? * INTERVAL '1 day')
                  AND data_quality_status IN ('VALID', 'CENSORED_DEMAND')
                ORDER BY product_id, business_date
                """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> grouped.computeIfAbsent(rs.getLong("product_id"), ignored -> new ArrayList<>())
                .add(new Daily(rs.getDate("business_date").toLocalDate(), rs.getDouble("units_sold"),
                        rs.getBoolean("stockout_flag") || "CENSORED_DEMAND".equals(rs.getString("data_quality_status")))),
                tenant.vendorId(), tenant.requireOutletId(), maxHistoryDays);
        for (Map.Entry<Long, List<Daily>> entry : grouped.entrySet()) {
            if (entry.getValue().size() < 2) continue;
            Map<LocalDate, Double> byDate = new HashMap<>();
            for (Daily daily : entry.getValue()) byDate.put(daily.date(), daily.units());
            LocalDate end = entry.getValue().getLast().date();
            LocalDate start = end.minusDays(maxHistoryDays - 1L);
            List<LocalDate> dates = new ArrayList<>();
            List<Double> units = new ArrayList<>();
            List<Boolean> stockoutFlags = new ArrayList<>();
            Map<LocalDate, Boolean> stockoutByDate = new HashMap<>();
            for (Daily daily : entry.getValue()) stockoutByDate.put(daily.date(), daily.stockoutFlag());
            for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
                dates.add(day); units.add(byDate.getOrDefault(day, 0d));
                stockoutFlags.add(stockoutByDate.getOrDefault(day, false));
            }
            series.add(new ForecastDtos.Series(entry.getKey(), dates, units, stockoutFlags));
        }
        if (series.isEmpty()) throw new BusinessException(40431, "No valid daily sales history is available.");
        String sourceVersion = jdbc.query("""
                SELECT source_version FROM ai_sales_daily
                WHERE vendor_id = ? AND outlet_id = ?
                ORDER BY data_as_of DESC LIMIT 1
                """, rs -> rs.next() ? rs.getString(1) : "unknown",
                tenant.vendorId(), tenant.requireOutletId());
        ForecastDtos.Response response = client.forecast(new ForecastDtos.Request(tenant.vendorId(), tenant.requireOutletId(), horizon,
                sourceVersion, LocalDate.now(), series));
        persistSnapshot(tenant, response);
        return response;
    }

    private void persistSnapshot(TenantContext tenant, ForecastDtos.Response response) {
        try {
            jdbc.update("""
                    INSERT INTO ai_forecast_snapshot
                      (id, vendor_id, outlet_id, forecast_type, model_name, model_version,
                       source_version, horizon_days, data_as_of, status, forecast_json)
                    VALUES (?, ?, ?, 'SALES', ?, ?, ?, ?, ?, 'COMPLETED', ?::jsonb)
                    """, java.util.UUID.randomUUID(), tenant.vendorId(), tenant.requireOutletId(),
                    response.model(), response.modelVersion(), response.sourceVersion(), response.horizonDays(),
                    Timestamp.from(Instant.now()), json(response));
        } catch (RuntimeException error) {
            // Forecasts remain read-only and usable when audit storage is temporarily unavailable.
            log.warn("AI forecast snapshot persistence failed vendorId={} outletId={} causeType={}",
                    tenant.vendorId(), tenant.requireOutletId(), error.getClass().getSimpleName());
        }
    }

    private String json(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (JsonProcessingException error) { throw new IllegalArgumentException("forecast JSON encoding failed", error); }
    }

    private record Daily(LocalDate date, double units, boolean stockoutFlag) { }
}
