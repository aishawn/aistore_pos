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
import java.util.function.ToIntFunction;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Service
public class ForecastService {
    private static final int MAX_FORECAST_REQUEST_BYTES = 12 * 1024 * 1024;
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
                SELECT si.product_id,
                       COALESCE(s.business_date, s.local_sold_at::date) AS business_date,
                       SUM(si.quantity) AS units_sold
                FROM sale s
                JOIN sale_item si ON si.sale_id = s.id AND si.outlet_id = s.outlet_id
                JOIN outlet o ON o.id = s.outlet_id AND o.vendor_id = ? AND o.deleted_at IS NULL
                JOIN product p ON p.id = si.product_id AND p.outlet_id = s.outlet_id AND p.deleted_at IS NULL
                WHERE s.outlet_id = ? AND s.status = 'COMPLETED' AND s.refund_reason IS NULL
                  AND COALESCE(s.business_date, s.local_sold_at::date)
                      >= (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')::date - ?
                GROUP BY si.product_id, COALESCE(s.business_date, s.local_sold_at::date)
                ORDER BY si.product_id, business_date
                """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> grouped.computeIfAbsent(rs.getLong("product_id"), ignored -> new ArrayList<>())
                .add(new Daily(rs.getDate("business_date").toLocalDate(), rs.getDouble("units_sold"), false)),
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
                SELECT MAX(s.updated_at)::text FROM sale s
                JOIN outlet o ON o.id = s.outlet_id AND o.vendor_id = ? AND o.deleted_at IS NULL
                WHERE s.outlet_id = ? AND s.status = 'COMPLETED' AND s.refund_reason IS NULL
                """, rs -> {
                    if (!rs.next()) return "unknown";
                    String updatedAt = rs.getString(1);
                    return updatedAt == null || updatedAt.isBlank() ? "unknown" : "orithos-ledger-" + updatedAt;
                },
                tenant.vendorId(), tenant.requireOutletId());
        requireVerifiedSourceVersion(sourceVersion);
        Set<Long> expectedProducts = new HashSet<>();
        series.forEach(item -> expectedProducts.add(item.productId()));
        List<ForecastDtos.Item> items = new ArrayList<>();
        ForecastDtos.Response firstBatch = null;
        LocalDate forecastStartDate = LocalDate.now();
        List<List<ForecastDtos.Series>> requestBatches = requestBatches(
                series, tenant, horizon, sourceVersion, forecastStartDate);
        ExecutorService executor = Executors.newFixedThreadPool(Math.min(4, requestBatches.size()));
        try {
            List<Future<ForecastDtos.Response>> responses = new ArrayList<>();
            for (List<ForecastDtos.Series> batch : requestBatches) {
                responses.add(executor.submit(() -> client.forecast(new ForecastDtos.Request(
                        tenant.vendorId(), tenant.requireOutletId(), horizon, sourceVersion, forecastStartDate, batch))));
            }
            for (int index = 0; index < requestBatches.size(); index++) {
                List<ForecastDtos.Series> batch = requestBatches.get(index);
                ForecastDtos.Response batchResponse;
                try {
                    batchResponse = responses.get(index).get(120, TimeUnit.SECONDS);
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    log.warn("AI forecast batch interrupted vendorId={} outletId={} batch={} of {} products={} elapsedMs={}",
                            tenant.vendorId(), tenant.requireOutletId(), index + 1, requestBatches.size(), batch.size(), elapsedMs(startedAt));
                    throw new BusinessException(50331, "Forecast service was interrupted.");
                } catch (ExecutionException | TimeoutException error) {
                    Throwable cause = error instanceof ExecutionException && error.getCause() != null
                            ? error.getCause() : error;
                    log.warn("AI forecast batch failed vendorId={} outletId={} batch={} of {} products={} causeType={} elapsedMs={}",
                            tenant.vendorId(), tenant.requireOutletId(), index + 1, requestBatches.size(), batch.size(),
                            cause.getClass().getSimpleName(), elapsedMs(startedAt));
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
        if (sourceVersion == null || !sourceVersion.startsWith("orithos-ledger-")) {
            throw new BusinessException(40431,
                    "Orithos does not have verified completed sales history for this store.");
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

    static List<List<ForecastDtos.Series>> batchesByPayloadSize(List<ForecastDtos.Series> series,
                                                                 int maxProducts, int maxRequestBytes,
                                                                 int emptyRequestBytes,
                                                                 ToIntFunction<ForecastDtos.Series> seriesSizeBytes) {
        if (maxProducts < 1) throw new IllegalArgumentException("maxProducts must be positive");
        if (maxRequestBytes < 1 || emptyRequestBytes < 0) {
            throw new IllegalArgumentException("request byte limits must be positive");
        }
        List<List<ForecastDtos.Series>> result = new ArrayList<>();
        List<ForecastDtos.Series> current = new ArrayList<>();
        int currentRequestBytes = emptyRequestBytes;
        for (ForecastDtos.Series item : series) {
            int itemBytes = seriesSizeBytes.applyAsInt(item);
            if (itemBytes < 0) throw new IllegalArgumentException("series size must not be negative");
            int candidateBytes = currentRequestBytes + (current.isEmpty() ? 0 : 1) + itemBytes;
            if (!current.isEmpty() && (current.size() >= maxProducts || candidateBytes > maxRequestBytes)) {
                result.add(List.copyOf(current));
                current.clear();
                currentRequestBytes = emptyRequestBytes;
                candidateBytes = currentRequestBytes + itemBytes;
            }
            if (candidateBytes > maxRequestBytes) {
                throw new IllegalArgumentException("a forecast series exceeds the request byte limit");
            }
            current.add(item);
            currentRequestBytes = candidateBytes;
        }
        if (!current.isEmpty()) result.add(List.copyOf(current));
        return List.copyOf(result);
    }

    private List<List<ForecastDtos.Series>> requestBatches(List<ForecastDtos.Series> series,
                                                            TenantContext tenant, int horizon,
                                                            String sourceVersion, LocalDate forecastStartDate) {
        try {
            int emptyRequestBytes = mapper.writeValueAsBytes(new ForecastDtos.Request(
                    tenant.vendorId(), tenant.requireOutletId(), horizon, sourceVersion,
                    forecastStartDate, List.of())).length;
            return batchesByPayloadSize(series, maxProducts, MAX_FORECAST_REQUEST_BYTES, emptyRequestBytes,
                    item -> serializedSize(item));
        } catch (JsonProcessingException error) {
            throw new BusinessException(50331, "Forecast request could not be prepared.");
        }
    }

    private int serializedSize(ForecastDtos.Series series) {
        try {
            return mapper.writeValueAsBytes(series).length;
        } catch (JsonProcessingException error) {
            throw new IllegalArgumentException("forecast series JSON encoding failed", error);
        }
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
