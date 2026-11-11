package com.orithos.modules.ai.forecast;

import com.orithos.modules.ai.report.TenantContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ForecastRiskService {
    private final ForecastService forecasts;
    private final JdbcTemplate jdbc;

    public ForecastRiskService(ForecastService forecasts, JdbcTemplate jdbc) {
        this.forecasts = forecasts; this.jdbc = jdbc;
    }

    public Map<String, Object> risks(TenantContext tenant, int horizonDays) {
        ForecastDtos.Response response = forecasts.forecast(tenant, horizonDays);
        Map<Long, Inventory> inventory = inventory(tenant);
        List<Map<String, Object>> stockout = new ArrayList<>();
        List<Map<String, Object>> overstock = new ArrayList<>();
        List<Map<String, Object>> dataQuality = new ArrayList<>();
        for (ForecastDtos.Item item : response.items()) {
            Inventory current = inventory.get(item.productId());
            if (current == null || current.onHand() == null) continue;
            double availableStock = current.projectedAvailable() == null
                    ? current.onHand() : current.projectedAvailable();
            double averageDemand = item.forecast().stream()
                    .mapToDouble(ForecastDtos.Point::p50).average().orElse(0d);
            boolean negativeBalance = hasNegativeBalance(current.onHand(), availableStock);
            if (negativeBalance) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("productId", item.productId());
                row.put("onHand", current.onHand());
                row.put("availableStock", availableStock);
                row.put("severity", "DATA_QUALITY");
                row.put("dataQuality", "NEGATIVE_ON_HAND");
                row.put("reasonCode", "NEGATIVE_ON_HAND");
                row.put("reason", "inventory balance is negative; stockout and days-of-stock are not reliable");
                row.put("confidence", item.confidence());
                dataQuality.add(row);
                continue;
            }
            if (!isActionableForecast(item)) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("productId", item.productId());
                row.put("onHand", current.onHand());
                row.put("availableStock", availableStock);
                row.put("severity", "DATA_QUALITY");
                row.put("dataQuality", item.dataQuality());
                row.put("reasonCode", "LOW_CONFIDENCE_FORECAST");
                row.put("reason", "forecast is not reliable enough for an actionable stock risk");
                row.put("confidence", item.confidence());
                dataQuality.add(row);
                continue;
            }
            // A zero-demand forecast cannot establish a future stockout. Keep
            // the item out of both stockout and days-of-stock calculations.
            int day = negativeBalance || averageDemand <= 0d
                    ? 0 : firstStockoutDay(item.forecast(), availableStock);
            double cumulative = day == 0 ? 0d : item.forecast().subList(0, day).stream()
                    .mapToDouble(ForecastDtos.Point::p50).sum();
            if (day > 0 && cumulative > 0d) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("productId", item.productId()); row.put("stockoutInDays", day);
                row.put("onHand", current.onHand()); row.put("availableStock", availableStock);
                row.put("forecastDemand", cumulative);
                row.put("dataQuality", item.dataQuality());
                row.put("reasonCode", "FORECAST_DEMAND_EXCEEDS_AVAILABLE");
                row.put("severity", day <= Math.max(1, current.leadTimeDays()) ? "CRITICAL" : "WARNING");
                row.put("confidence", item.confidence()); row.put("reason", "forecast demand exceeds available stock");
                stockout.add(row);
            }
            if (!negativeBalance && averageDemand > 0d && current.onHand() > averageDemand * 30d) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("productId", item.productId()); row.put("onHand", current.onHand());
                row.put("estimatedDaysOfStock", Math.round(current.onHand() / averageDemand));
                row.put("estimatedCashValue", current.cost() == null ? null : current.onHand() * current.cost());
                row.put("dataQuality", item.dataQuality());
                row.put("reasonCode", "STOCK_EXCEEDS_30_DAYS_DEMAND");
                row.put("severity", "WATCH"); row.put("reason", "stock exceeds 30 days of forecast demand");
                overstock.add(row);
            }
        }
        return Map.of("status", "READ_ONLY", "sourceVersion", response.sourceVersion(),
                "model", response.model(), "stockoutAlerts", stockout, "overstockAlerts", overstock,
                "dataQualityAlerts", dataQuality);
    }

    private Map<Long, Inventory> inventory(TenantContext tenant) {
        Map<Long, Inventory> result = new LinkedHashMap<>();
        jdbc.query("""
                SELECT p.id AS product_id, COALESCE(i.quantity, 0) AS on_hand,
                       COALESCE(i.quantity, 0) + COALESCE(i.on_order, 0) AS available_stock,
                       COALESCE(pc.average_cost, pc.cost, p.cost, 0) AS cost,
                       0 AS lead_time
                FROM product p
                JOIN outlet o ON o.id = p.outlet_id AND o.vendor_id = ? AND o.deleted_at IS NULL
                LEFT JOIN product_inventory i ON i.product_id = p.id AND i.outlet_id = p.outlet_id
                LEFT JOIN product_cost pc ON pc.product_id = p.id AND pc.outlet_id = p.outlet_id
                WHERE p.outlet_id = ? AND p.deleted_at IS NULL
                """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> result.put(rs.getLong("product_id"), new Inventory(
                        asDouble(rs.getObject("on_hand")), asDouble(rs.getObject("available_stock")),
                        asDouble(rs.getObject("cost")),
                        rs.getInt("lead_time"))), tenant.vendorId(), tenant.requireOutletId());
        return result;
    }

    private static Double asDouble(Object value) {
        return value instanceof Number number ? number.doubleValue() : null;
    }

    static int firstStockoutDay(List<ForecastDtos.Point> forecast, double availableStock) {
        if (availableStock < 0d || forecast.stream().mapToDouble(ForecastDtos.Point::p50).sum() <= 0d) {
            return 0;
        }
        double cumulative = 0d;
        for (int index = 0; index < forecast.size(); index++) {
            cumulative += forecast.get(index).p50();
            if (cumulative > availableStock) return index + 1;
        }
        return 0;
    }

    static boolean hasNegativeBalance(Double onHand, Double availableStock) {
        return (onHand != null && onHand < 0d) || (availableStock != null && availableStock < 0d);
    }

    static boolean isActionableForecast(ForecastDtos.Item item) {
        return "VALID".equals(item.dataQuality()) && !"LOW".equals(item.confidence());
    }

    private record Inventory(Double onHand, Double projectedAvailable, Double cost, int leadTimeDays) { }
}
