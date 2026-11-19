package com.orithos.modules.platform;

import com.orithos.common.AustraliaTime;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class DemoSandboxService {

    private static final String DEMO_STORE = "demo";
    private static final String SKR_STORE = "skr";
    private static final String SOURCE_SHOPFRONT = "shopfront";
    private static final List<String> CLONE_PHASES = List.of("target_barcodes", "source_mappings", "source_barcodes");

    private final JdbcTemplate jdbc;
    private final ShopfrontProductMappingCloneService mappingCloneService;
    private final String crawlerBaseUrl;
    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    public DemoSandboxService(
            JdbcTemplate jdbc,
            ShopfrontProductMappingCloneService mappingCloneService,
            @Value("${app.shopfront.source-report-base-url:}") String crawlerBaseUrl) {
        this.jdbc = jdbc;
        this.mappingCloneService = mappingCloneService;
        this.crawlerBaseUrl = crawlerBaseUrl == null ? "" : crawlerBaseUrl.strip().replaceAll("/+$", "");
    }

    public Map<String, Object> status() {
        long demoOutlet = requireOutletId(DEMO_STORE);
        long skrOutlet = requireOutletId(SKR_STORE);
        LocalDate yesterday = AustraliaTime.today().minusDays(1);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("demo_store_key", DEMO_STORE);
        result.put("skr_store_key", SKR_STORE);
        result.put("demo_outlet_id", demoOutlet);
        result.put("skr_outlet_id", skrOutlet);
        result.put("business_day", yesterday.toString());
        result.put("demo", outletDrift(demoOutlet, DEMO_STORE, yesterday));
        result.put("skr", outletDrift(skrOutlet, SKR_STORE, yesterday));
        result.put("parity", paritySummary(demoOutlet, skrOutlet, yesterday));
        result.put("product_mappings", Map.of(
                "demo_mapped", mappedProducts(DEMO_STORE),
                "skr_mapped", mappedProducts(SKR_STORE)));
        result.put("crawler_configured", !crawlerBaseUrl.isBlank());
        return result;
    }

    public Map<String, Object> purgeLocalWrites() {
        long demoOutlet = requireOutletId(DEMO_STORE);
        List<Long> saleIds = jdbc.query(
                """
                        SELECT id FROM sale
                        WHERE outlet_id = ?
                          AND (source_system IS NULL OR source_system IS DISTINCT FROM ?)
                        ORDER BY id
                        """,
                (rs, rowNum) -> rs.getLong(1),
                demoOutlet,
                SOURCE_SHOPFRONT);
        int payments = 0;
        int items = 0;
        int sales = 0;
        for (Long saleId : saleIds) {
            if (saleId == null || saleId <= 0) {
                continue;
            }
            payments += jdbc.update("DELETE FROM sale_payment WHERE sale_id = ? AND outlet_id = ?", saleId, demoOutlet);
            items += jdbc.update("DELETE FROM sale_item WHERE sale_id = ? AND outlet_id = ?", saleId, demoOutlet);
            sales += jdbc.update("DELETE FROM sale WHERE id = ? AND outlet_id = ?", saleId, demoOutlet);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("demo_outlet_id", demoOutlet);
        result.put("removed_sales", sales);
        result.put("removed_items", items);
        result.put("removed_payments", payments);
        return result;
    }

    public Map<String, Object> queueDemoSync() {
        if (crawlerBaseUrl.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Crawler base URL is not configured");
        }
        String url = crawlerBaseUrl + "/shopfront-sync-daily?store=" + DEMO_STORE;
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(20))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .header("Accept", "application/json")
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("crawler_url", crawlerBaseUrl);
            result.put("http_status", response.statusCode());
            result.put("body_preview", response.body() == null ? "" : response.body().substring(0, Math.min(500, response.body().length())));
            result.put("queued", response.statusCode() >= 200 && response.statusCode() < 300);
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                        "Crawler declined demo sync (HTTP " + response.statusCode() + ")");
            }
            return result;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Could not queue crawler sync for demo: " + e.getMessage());
        }
    }

    public Map<String, Object> cloneMappingsPhase(String phase, int limit) {
        return mappingCloneService.clone(SKR_STORE, DEMO_STORE, phase, limit);
    }

    public Map<String, Object> cloneMappingsAllPhases(int limit) {
        Map<String, Object> summary = new LinkedHashMap<>();
        List<Map<String, Object>> phases = new ArrayList<>();
        boolean anyMore = false;
        for (String phase : CLONE_PHASES) {
            Map<String, Object> batch = mappingCloneService.clone(SKR_STORE, DEMO_STORE, phase, limit);
            phases.add(batch);
            if (Boolean.TRUE.equals(batch.get("more"))) {
                anyMore = true;
            }
        }
        summary.put("phases", phases);
        summary.put("more", anyMore);
        if (!phases.isEmpty()) {
            summary.put("target_mapped_count", phases.get(phases.size() - 1).get("target_mapped_count"));
            summary.put("source_mapped_count", phases.get(phases.size() - 1).get("source_mapped_count"));
        }
        return summary;
    }

    public Map<String, Object> rebaseline(List<String> steps, int cloneLimit) {
        if (steps == null || steps.isEmpty()) {
            steps = List.of("purge", "queue_sync", "clone_mappings", "verify");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, Object> executed = new LinkedHashMap<>();
        for (String raw : steps) {
            String step = raw == null ? "" : raw.trim().toLowerCase();
            switch (step) {
                case "purge" -> executed.put("purge", purgeLocalWrites());
                case "queue_sync" -> executed.put("queue_sync", queueDemoSync());
                case "clone_mappings" -> executed.put("clone_mappings", cloneMappingsAllPhases(cloneLimit));
                case "verify" -> executed.put("verify", status());
                default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown step: " + raw);
            }
        }
        result.put("steps", steps);
        result.put("executed", executed);
        if (executed.containsKey("verify")) {
            result.put("verify", executed.get("verify"));
        } else {
            result.put("verify", status());
        }
        return result;
    }

    private long requireOutletId(String storeKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT outlet_id, enabled FROM shopfront_store_mapping WHERE store_key = ? LIMIT 1",
                storeKey);
        if (rows.isEmpty() || !isEnabled(rows.getFirst().get("enabled"))) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "No enabled shopfront mapping for store_key=" + storeKey);
        }
        long outletId = longValue(rows.getFirst().get("outlet_id"));
        if (outletId <= 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Shopfront mapping has no numeric outlet_id for store_key=" + storeKey);
        }
        return outletId;
    }

    private static boolean isEnabled(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        return value != null && !"false".equalsIgnoreCase(String.valueOf(value));
    }

    private static long longValue(Object value) {
        if (value == null) {
            return 0;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private int mappedProducts(String storeKey) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_product_mapping WHERE store_key = ? AND status = 'MAPPED'",
                Integer.class,
                storeKey);
        return count == null ? 0 : count;
    }

    private Map<String, Object> outletDrift(long outletId, String storeKey, LocalDate day) {
        Map<String, Object> row = jdbc.queryForMap("""
                SELECT COUNT(*) AS transactions,
                       COALESCE(SUM(total_price), 0) AS revenue,
                       COUNT(*) FILTER (WHERE source_system = 'shopfront') AS shopfront_transactions,
                       COALESCE(SUM(total_price) FILTER (WHERE source_system = 'shopfront'), 0) AS shopfront_revenue,
                       COUNT(*) FILTER (WHERE source_system IS DISTINCT FROM 'shopfront') AS other_transactions,
                       COALESCE(SUM(total_price) FILTER (WHERE source_system IS DISTINCT FROM 'shopfront'), 0) AS other_revenue
                FROM sale
                WHERE outlet_id = ?
                  AND status = 'COMPLETED'
                  AND COALESCE(business_date, DATE(local_sold_at), DATE(created_at)) = CAST(? AS date)
                """, outletId, day);
        Map<String, Object> mapped = new LinkedHashMap<>();
        mapped.put("store_key", storeKey);
        mapped.put("outlet_id", outletId);
        mapped.put("transactions", row.get("transactions"));
        mapped.put("revenue", row.get("revenue"));
        mapped.put("shopfront_transactions", row.get("shopfront_transactions"));
        mapped.put("shopfront_revenue", row.get("shopfront_revenue"));
        mapped.put("other_transactions", row.get("other_transactions"));
        mapped.put("other_revenue", row.get("other_revenue"));
        return mapped;
    }

    private Map<String, Object> paritySummary(long demoOutlet, long skrOutlet, LocalDate day) {
        BigDecimal demoShopfront = shopfrontRevenue(demoOutlet, day);
        BigDecimal skrShopfront = shopfrontRevenue(skrOutlet, day);
        Map<String, Object> parity = new LinkedHashMap<>();
        parity.put("shopfront_revenue_match", demoShopfront.compareTo(skrShopfront) == 0);
        parity.put("demo_shopfront_revenue", demoShopfront);
        parity.put("skr_shopfront_revenue", skrShopfront);
        parity.put("demo_other_sales", countOtherSales(demoOutlet));
        return parity;
    }

    private BigDecimal shopfrontRevenue(long outletId, LocalDate day) {
        BigDecimal value = jdbc.queryForObject("""
                SELECT COALESCE(SUM(total_price), 0)
                FROM sale
                WHERE outlet_id = ?
                  AND status = 'COMPLETED'
                  AND source_system = 'shopfront'
                  AND COALESCE(business_date, DATE(local_sold_at), DATE(created_at)) = CAST(? AS date)
                """, BigDecimal.class, outletId, day);
        return Objects.requireNonNullElse(value, BigDecimal.ZERO);
    }

    private long countOtherSales(long demoOutlet) {
        Long count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM sale
                WHERE outlet_id = ?
                  AND (source_system IS NULL OR source_system IS DISTINCT FROM 'shopfront')
                """, Long.class, demoOutlet);
        return count == null ? 0 : count;
    }
}