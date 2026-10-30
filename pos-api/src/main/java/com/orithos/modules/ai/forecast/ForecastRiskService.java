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
        for (ForecastDtos.Item item : response.items()) {
            Inventory current = inventory.get(item.productId());
            if (current == null || current.onHand() == null) continue;
            double availableStock = current.projectedAvailable() == null
                    ? current.onHand() : current.projectedAvailable();
            int day = firstStockoutDay(item.forecast(), availableStock);
            double cumulative = day == 0 ? 0d : item.forecast().subList(0, day).stream()
                    .mapToDouble(ForecastDtos.Point::p50).sum();
            if (day > 0) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("productId", item.productId()); row.put("stockoutInDays", day);
                row.put("onHand", current.onHand()); row.put("availableStock", availableStock);
                row.put("forecastDemand", cumulative);
                row.put("severity", day <= Math.max(1, current.leadTimeDays()) ? "CRITICAL" : "WARNING");
                row.put("confidence", item.confidence()); row.put("reason", "forecast demand exceeds available stock");
                stockout.add(row);
            }
            double avg = item.forecast().stream().mapToDouble(ForecastDtos.Point::p50).average().orElse(0d);
            if (avg > 0d && current.onHand() > avg * 30d) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("productId", item.productId()); row.put("onHand", current.onHand());
                row.put("estimatedDaysOfStock", Math.round(current.onHand() / avg));
                row.put("estimatedCashValue", current.cost() == null ? null : current.onHand() * current.cost());
                row.put("severity", "WATCH"); row.put("reason", "stock exceeds 30 days of forecast demand");
                overstock.add(row);
            }
        }
        return Map.of("status", "READ_ONLY", "sourceVersion", response.sourceVersion(),
                "model", response.model(), "stockoutAlerts", stockout, "overstockAlerts", overstock);
    }

    private Map<Long, Inventory> inventory(TenantContext tenant) {
        Map<Long, Inventory> result = new LinkedHashMap<>();
        jdbc.query("""
                SELECT product_id, on_hand,
                       COALESCE((inv.payload->>'virtualAvailable')::numeric, i.on_hand) AS available_stock,
                       COALESCE((p.payload->>'standard_price')::numeric, 0) AS cost,
                       COALESCE((inv.payload->>'leadTimeDays')::numeric, 0) AS lead_time
                FROM ai_inventory_daily i
                LEFT JOIN LATERAL (
                    SELECT payload FROM odoo_read_snapshot s
                    WHERE s.vendor_id = i.vendor_id AND s.outlet_id = i.outlet_id
                      AND s.object_type = 'PRODUCT' AND s.source_record_id = i.product_id::text
                    ORDER BY s.event_time DESC LIMIT 1
                ) p ON TRUE
                LEFT JOIN LATERAL (
                    SELECT payload FROM odoo_read_snapshot s
                    WHERE s.vendor_id = i.vendor_id AND s.outlet_id = i.outlet_id
                      AND s.object_type = 'INVENTORY' AND s.source_record_id = i.product_id::text
                    ORDER BY s.event_time DESC LIMIT 1
                ) inv ON TRUE
                WHERE i.vendor_id = ? AND i.outlet_id = ? AND i.business_date = CURRENT_DATE
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
        double cumulative = 0d;
        for (int index = 0; index < forecast.size(); index++) {
            cumulative += forecast.get(index).p50();
            if (cumulative > availableStock) return index + 1;
        }
        return 0;
    }

    private record Inventory(Double onHand, Double projectedAvailable, Double cost, int leadTimeDays) { }
}
