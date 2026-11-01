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
import java.util.HashSet;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Service
public class ForecastService {
    private static final Logger log = LoggerFactory.getLogger(ForecastService.class);
    private final JdbcTemplate jdbc;
    private final ForecastClient client;
    private final ObjectMapper mapper;
    private final boolean enabled;
    private final int maxHistoryDays;
    private final int maxProducts;

    public ForecastService(JdbcTemplate jdbc, ForecastClient client, ObjectMapper mapper,
                           @Value("${app.ai.forecast.enabled:false}") boolean enabled,
                           @Value("${app.ai.forecast.max-history-days:365}") int maxHistoryDays,
                           @Value("${app.ai.forecast.max-products:500}") int maxProducts) {
        this.jdbc = jdbc; this.client = client; this.mapper = mapper; this.enabled = enabled;
        this.maxHistoryDays = Math.max(14, Math.min(maxHistoryDays, 730));
        this.maxProducts = Math.max(1, Math.min(maxProducts, 2000));
    }

    public ForecastDtos.Response forecast(TenantContext tenant, int horizonDays) {
        if (!enabled) throw new BusinessException(50332, "AI forecast is disabled.");
        long startedAt = System.nanoTime();
        int horizon = Math.max(1, Math.min(horizonDays, 90));
        List<ForecastDtos.Series> series = new ArrayList<>();
        Map<Long, List<Daily>> grouped = new LinkedHashMap<>();
        jdbc.query("""
                SELECT COALESCE(s.product_id, i.product_id) AS product_id,
                       COALESCE(s.business_date, i.business_date) AS business_date,
                       COALESCE(s.units_sold, 0) AS units_sold,
                       COALESCE(i.stockout_flag, s.stockout_flag, false) AS stockout_flag,
                       COALESCE(i.data_quality_status, s.data_quality_status) AS data_quality_status
                FROM ai_sales_daily s
                FULL OUTER JOIN ai_inventory_daily i
                  ON i.vendor_id = s.vendor_id AND i.outlet_id = s.outlet_id
                 AND i.product_id = s.product_id AND i.business_date = s.business_date
                WHERE COALESCE(s.vendor_id, i.vendor_id) = ?
                  AND COALESCE(s.outlet_id, i.outlet_id) = ?
                  AND COALESCE(s.business_date, i.business_date) >= CURRENT_DATE - (? * INTERVAL '1 day')
                  AND (s.product_id IS NULL OR s.data_quality_status IN ('VALID', 'CENSORED_DEMAND'))
                ORDER BY product_id, business_date
                """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> grouped.computeIfAbsent(rs.getLong("product_id"), ignored -> new ArrayList<>())
                .add(new Daily(rs.getDate("business_date").toLocalDate(), rs.getDouble("units_sold"),
                        rs.getBoolean("stockout_flag") || "CENSORED_DEMAND".equals(rs.getString("data_quality_status")))),
                tenant.vendorId(), tenant.requireOutletId(), maxHistoryDays);
        log.info("AI forecast history loaded vendorId={} outletId={} products={} elapsedMs={}",
                tenant.vendorId(), tenant.requireOutletId(), grouped.size(), elapsedMs(startedAt));
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
                  AND source_version IS NOT NULL AND trim(source_version) <> ''
                ORDER BY data_as_of DESC LIMIT 1
                """, rs -> rs.next() ? rs.getString(1) : "unknown",
                tenant.vendorId(), tenant.requireOutletId());
        requireVerifiedSourceVersion(sourceVersion);
        Set<Long> expectedProducts = new HashSet<>();
        series.forEach(item -> expectedProducts.add(item.productId()));
        List<ForecastDtos.Item> items = new ArrayList<>();
        ForecastDtos.Response firstBatch = null;
        List<List<ForecastDtos.Series>> requestBatches = batches(series, maxProducts);
        ExecutorService executor = Executors.newFixedThreadPool(Math.min(4, requestBatches.size()));
        try {
            List<Future<ForecastDtos.Response>> responses = new ArrayList<>();
            for (List<ForecastDtos.Series> batch : requestBatches) {
                responses.add(executor.submit(() -> client.forecast(new ForecastDtos.Request(
                        tenant.vendorId(), tenant.requireOutletId(), horizon, sourceVersion, LocalDate.now(), batch))));
            }
            for (int index = 0; index < requestBatches.size(); index++) {
                List<ForecastDtos.Series> batch = requestBatches.get(index);
                ForecastDtos.Response batchResponse;
                try {
                    batchResponse = responses.get(index).get(120, TimeUnit.SECONDS);
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new BusinessException(50331, "Forecast service was interrupted.");
                } catch (ExecutionException | TimeoutException error) {
                    throw new BusinessException(50331, "Forecast service is temporarily unavailable.");
                }
                log.info("AI forecast batch completed vendorId={} outletId={} batch={} of {} products={} elapsedMs={}",
                        tenant.vendorId(), tenant.requireOutletId(), index + 1, requestBatches.size(), batch.size(), elapsedMs(startedAt));
                validateBatchCoverage(batch, batchResponse);
                if (firstBatch == null) firstBatch = batchResponse;
                items.addAll(batchResponse.items());
            }
        } finally {
            executor.shutdownNow();
        }
        ForecastDtos.Response response = new ForecastDtos.Response(firstBatch.model(), firstBatch.modelVersion(),
                sourceVersion, horizon, items);
        if (items.size() != expectedProducts.size()
                || items.stream().map(ForecastDtos.Item::productId).distinct().count() != expectedProducts.size()) {
            throw new BusinessException(50331, "Forecast results do not cover the requested products.");
        }
        persistSnapshot(tenant, response);
        log.info("AI forecast completed vendorId={} outletId={} products={} elapsedMs={}",
                tenant.vendorId(), tenant.requireOutletId(), items.size(), elapsedMs(startedAt));
        return response;
    }

    static void requireVerifiedSourceVersion(String sourceVersion) {
        if (sourceVersion == null || sourceVersion.isBlank() || "unknown".equalsIgnoreCase(sourceVersion)) {
            throw new BusinessException(40431,
                    "Daily sales history has no verified source snapshot; run a read-only Odoo sync first.");
        }
    }

    private static long elapsedMs(long startedAt) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
    }

    static void validateBatchCoverage(List<ForecastDtos.Series> requested, ForecastDtos.Response response) {
        if (response == null || response.items() == null) {
            throw new BusinessException(50331, "Forecast service returned an incomplete result.");
        }
        Set<Long> requestedIds = requested.stream().map(ForecastDtos.Series::productId)
                .collect(java.util.stream.Collectors.toSet());
        Set<Long> returnedIds = new HashSet<>();
        for (ForecastDtos.Item item : response.items()) {
            if (item == null || !returnedIds.add(item.productId())) {
                throw new BusinessException(50331, "Forecast service returned duplicate or invalid products.");
            }
        }
        if (!requestedIds.equals(returnedIds)) {
            throw new BusinessException(50331, "Forecast results do not match the requested products.");
        }
    }

    static List<List<ForecastDtos.Series>> batches(List<ForecastDtos.Series> series, int batchSize) {
        if (batchSize < 1) throw new IllegalArgumentException("batchSize must be positive");
        List<List<ForecastDtos.Series>> batches = new ArrayList<>();
        for (int offset = 0; offset < series.size(); offset += batchSize) {
            batches.add(List.copyOf(series.subList(offset, Math.min(series.size(), offset + batchSize))));
        }
        return List.copyOf(batches);
    }

    void persistSnapshot(TenantContext tenant, ForecastDtos.Response response) {
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
