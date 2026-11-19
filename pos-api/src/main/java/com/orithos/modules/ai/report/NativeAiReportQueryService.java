package com.orithos.modules.ai.report;

import com.orithos.modules.report.ReportQueryService;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/** Executes fixed AI report templates against the tenant's Orithos read-only views. */
@Service
public class NativeAiReportQueryService {

    private static final int MAX_LIST_ROWS = 50;
    private static final int MAX_CATALOG_ROWS = 10_000;
    static final long TEMPLATE_CACHE_TTL_MILLIS = 5_000;
    static final long CATALOG_CACHE_TTL_MILLIS = 15_000;
    private static final int MAX_TEMPLATE_CACHE_ENTRIES = 512;
    private static final int MAX_CATALOG_CACHE_ENTRIES = 64;

    private final AiReportDataSourceRegistry dataSources;
    private final ReportTemplateRegistry templates;
    private final ReportQueryService reportQueryService;
    private final LongSupplier currentTimeMillis;
    private final ConcurrentHashMap<QueryCacheKey, CachedResult> templateCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<CatalogCacheKey, CachedCatalog> catalogCache = new ConcurrentHashMap<>();

    @Autowired
    public NativeAiReportQueryService(AiReportDataSourceRegistry dataSources,
                                      ReportTemplateRegistry templates,
                                      ReportQueryService reportQueryService) {
        this(dataSources, templates, reportQueryService, System::currentTimeMillis);
    }

    NativeAiReportQueryService(AiReportDataSourceRegistry dataSources,
                               ReportTemplateRegistry templates,
                               ReportQueryService reportQueryService,
                               LongSupplier currentTimeMillis) {
        this.dataSources = dataSources;
        this.templates = templates;
        this.reportQueryService = reportQueryService;
        this.currentTimeMillis = currentTimeMillis;
    }

    public Result query(TenantContext tenant, String intent, Map<String, String> slots,
                        ReportPeriodResolver.Window window) {
        if (tenant == null || tenant.requireOutletId() == null) return Result.fail("NO_OUTLET");
        if (!tenant.canQueryReport()) return Result.fail("NO_PERMISSION");
        if ("report_stock_value".equals(intent) && !tenant.canQueryCost()) {
            return Result.fail("NO_COST_PERMISSION");
        }
        if (!ReportTemplateRegistry.TEMPLATE_INTENTS.contains(intent)) {
            return Result.fail("UNKNOWN_TEMPLATE");
        }

        try {
            if ("report_aov".equals(intent)) {
                Map<String, Object> overview = reportQueryService.nativeOverview(tenant.vendorId(),
                        tenant.requireOutletId(), window.from().toLocalDate(),
                        window.toExclusive().minusNanos(1).toLocalDate());
                Object transactionValue = overview.get("transactions");
                Object averageSale = overview.get("averageSale");
                Object grossSales = overview.get("grossSales");
                if (!(transactionValue instanceof Number) || grossSales == null) {
                    return Result.fail("AUTHORITATIVE_REPORT_INCOMPLETE");
                }
                var transactions = ReportQueryService.toDecimal(transactionValue);
                if (transactions.signum() < 0) {
                    return Result.fail("AUTHORITATIVE_REPORT_INCOMPLETE");
                }
                if (transactions.signum() == 0) {
                    return Result.ok(List.of(), null, stringValue(overview.get("dataSource")));
                }
                if (averageSale == null) {
                    return Result.fail("AUTHORITATIVE_REPORT_INCOMPLETE");
                }
                return Result.ok(List.of(Map.of(
                        "aov", averageSale,
                        "tickets", transactionValue,
                        "sales", grossSales)), stringValue(overview.get("dataAsOf")),
                        stringValue(overview.get("dataSource")));
            }
            if ("report_stock_summary".equals(intent)) {
                Map<String, Object> overview = reportQueryService.nativeOverview(tenant.vendorId(),
                        tenant.requireOutletId(), window.from().toLocalDate(),
                        window.toExclusive().minusNanos(1).toLocalDate());
                if (!Boolean.TRUE.equals(overview.get("inventoryAvailable"))
                        || !(overview.get("inventoryUnits") instanceof Number)
                        || !(overview.get("inventorySkuCount") instanceof Number)
                        || !(overview.get("inventoryPositiveSkuCount") instanceof Number)
                        || !(overview.get("negativeStockProducts") instanceof Number)) {
                    return Result.fail("AUTHORITATIVE_REPORT_INCOMPLETE");
                }
                return Result.ok(List.of(Map.of(
                        "positiveUnits", overview.get("inventoryUnits"),
                        "positiveSkus", overview.get("inventoryPositiveSkuCount"),
                        "negativeSkus", overview.get("negativeStockProducts"),
                        "totalSkus", overview.get("inventorySkuCount"),
                        "dataSource", stringValue(overview.get("dataSource")))),
                        null, stringValue(overview.get("dataSource")));
            }
            ReportTemplateRegistry.BoundSql bound = templates.bind(intent, tenant, slots, window);
            if (bound.error() != null) return Result.fail(bound.error());
            QueryCacheKey key = QueryCacheKey.of(tenant, intent, slots, window);
            long now = currentTimeMillis.getAsLong();
            CachedResult cached = templateCache.get(key);
            if (cached != null && cached.expiresAtMillis() > now) return cached.result();
            if (cached != null) templateCache.remove(key, cached);
            List<Map<String, Object>> rows = dataSources.jdbc(tenant.requireOutletId())
                    .queryForList(bound.sql(), bound.params().toArray());
            Result result = Result.ok(rows, null, AiReportDataSourceRegistry.DATA_SOURCE_NAME);
            if (templateCache.size() >= MAX_TEMPLATE_CACHE_ENTRIES) templateCache.clear();
            templateCache.put(key, CachedResult.of(result,
                    currentTimeMillis.getAsLong() + TEMPLATE_CACHE_TTL_MILLIS));
            return result;
        } catch (DataAccessException | IllegalStateException e) {
            return Result.fail("NATIVE_REPORT_UNAVAILABLE");
        }
    }

    public ProductCountResult countSellableProducts(TenantContext tenant) {
        String error = validateCatalogTenant(tenant);
        if (error != null) return ProductCountResult.fail(error);
        try {
            Integer count = dataSources.jdbc(tenant.requireOutletId()).queryForObject(
                    "SELECT COUNT(*) FROM ai_rpt_product_count WHERE outlet_id = ? AND status = 'ACTIVE'",
                    Integer.class, tenant.requireOutletId());
            return ProductCountResult.ok(count == null ? 0 : count);
        } catch (DataAccessException | IllegalStateException e) {
            return ProductCountResult.fail("NATIVE_REPORT_UNAVAILABLE");
        }
    }

    public ProductSearchResult searchProducts(TenantContext tenant, String query, int limit) {
        String error = validateCatalogTenant(tenant);
        if (error != null) return ProductSearchResult.fail(error);
        if (query == null || query.isBlank()) return ProductSearchResult.fail("NEED_PRODUCT");
        try {
            long outletId = tenant.requireOutletId();
            int rowLimit = Math.max(1, Math.min(limit <= 0 ? 8 : limit, MAX_LIST_ROWS));
            String term = query.trim();
            String match = "%" + term + "%";
            var jdbc = dataSources.jdbc(outletId);
            List<Map<String, Object>> candidates = jdbc.queryForList("""
                    SELECT p.id, p.name
                    FROM ai_rpt_product_count p
                    WHERE p.outlet_id = ? AND p.status = 'ACTIVE' AND p.name ILIKE ?
                    ORDER BY p.name, p.id
                    LIMIT ?
                    """, outletId, match, rowLimit);

            String barcodePredicate = term.matches("\\d{6,14}") ? "b.code = ?" : "b.code ILIKE ?";
            List<Map<String, Object>> barcodeCandidates = jdbc.queryForList("""
                    SELECT p.id, p.name
                    FROM ai_rpt_product_barcode b
                    JOIN ai_rpt_product_count p ON p.id = b.product_id AND p.outlet_id = b.outlet_id
                    WHERE b.outlet_id = ? AND %s AND p.status = 'ACTIVE'
                    ORDER BY p.name, p.id
                    LIMIT ?
                    """.formatted(barcodePredicate), outletId,
                    term.matches("\\d{6,14}") ? term : match, rowLimit);

            Map<Long, String> matchedProducts = new LinkedHashMap<>();
            addProductCandidates(matchedProducts, candidates);
            addProductCandidates(matchedProducts, barcodeCandidates);
            List<Map.Entry<Long, String>> selected = matchedProducts.entrySet().stream()
                    .sorted(Map.Entry.<Long, String>comparingByValue(String.CASE_INSENSITIVE_ORDER)
                            .thenComparingLong(Map.Entry::getKey))
                    .limit(rowLimit)
                    .toList();
            if (selected.isEmpty()) return ProductSearchResult.ok(List.of());

            List<Object> detailParams = new ArrayList<>();
            detailParams.add(outletId);
            selected.forEach(entry -> detailParams.add(entry.getKey()));
            String idPlaceholders = String.join(",", java.util.Collections.nCopies(selected.size(), "?"));
            List<Map<String, Object>> rows = jdbc.queryForList("""
                    SELECT p.id, p.name, p.barcode, p.list_price,
                           COALESCE(i.quantity, 0) AS quantity
                    FROM ai_rpt_product p
                    LEFT JOIN ai_rpt_inventory i ON i.product_id = p.id AND i.outlet_id = p.outlet_id
                    WHERE p.outlet_id = ? AND p.status = 'ACTIVE' AND p.id IN (%s)
                    ORDER BY p.name, p.id
                    """.formatted(idPlaceholders), detailParams.toArray());
            return ProductSearchResult.ok(rows);
        } catch (DataAccessException | IllegalStateException e) {
            return ProductSearchResult.fail("NATIVE_REPORT_UNAVAILABLE");
        }
    }

    private static void addProductCandidates(Map<Long, String> target, List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            if (row.get("id") instanceof Number id && id.longValue() > 0) {
                String name = row.get("name") == null ? "" : row.get("name").toString();
                target.putIfAbsent(id.longValue(), name);
            }
        }
    }

    public ProductCatalogResult listRecommendationProducts(TenantContext tenant) {
        String error = validateCatalogTenant(tenant);
        if (error != null) return ProductCatalogResult.fail(error);
        long now = currentTimeMillis.getAsLong();
        catalogCache.entrySet().removeIf(entry -> entry.getValue().expiresAtMillis() <= now);
        CatalogCacheKey key = new CatalogCacheKey(tenant.vendorId(), tenant.requireOutletId());
        CachedCatalog cached = catalogCache.get(key);
        if (cached != null && cached.expiresAtMillis() > now) return cached.result();
        if (cached != null) catalogCache.remove(key, cached);
        if (catalogCache.size() >= MAX_CATALOG_CACHE_ENTRIES) catalogCache.clear();

        CachedCatalog loaded = catalogCache.computeIfAbsent(key, ignored -> {
            try {
                List<Map<String, Object>> rows = dataSources.jdbc(tenant.requireOutletId()).queryForList("""
                        SELECT p.id, p.name, p.list_price, p.list_price AS sell_price,
                               i.quantity, COALESCE(p.category_name, '') AS category
                        FROM ai_rpt_product p
                        JOIN ai_rpt_inventory i ON i.product_id = p.id AND i.outlet_id = p.outlet_id
                        WHERE p.outlet_id = ? AND p.status = 'ACTIVE'
                          AND p.list_price > 0 AND i.quantity > 0
                        ORDER BY p.name, p.id
                        LIMIT ?
                        """, tenant.requireOutletId(), MAX_CATALOG_ROWS);
                ProductCatalogResult result = ProductCatalogResult.ok(List.copyOf(rows));
                return new CachedCatalog(result, currentTimeMillis.getAsLong() + CATALOG_CACHE_TTL_MILLIS);
            } catch (DataAccessException | IllegalStateException e) {
                return null;
            }
        });
        return loaded == null ? ProductCatalogResult.fail("NATIVE_REPORT_UNAVAILABLE") : loaded.result();
    }

    public ProductCatalogResult searchPriceProducts(TenantContext tenant, BigDecimal threshold,
                                                     boolean lowerBound, String categoryToken) {
        String error = validateCatalogTenant(tenant);
        if (error != null) return ProductCatalogResult.fail(error);
        if (threshold == null) return ProductCatalogResult.fail("INVALID_THRESHOLD");
        try {
            String comparator = lowerBound ? "<=" : ">=";
            String sql = """
                    SELECT p.id, p.name, p.list_price, COALESCE(i.quantity, 0) AS quantity,
                           COALESCE(p.category_name, '') AS category
                    FROM ai_rpt_product p
                    LEFT JOIN ai_rpt_inventory i ON i.product_id = p.id AND i.outlet_id = p.outlet_id
                    WHERE p.outlet_id = ? AND p.status = 'ACTIVE' AND p.list_price > 0
                      AND p.list_price %s ?
                    """.formatted(comparator);
            List<Object> params = new ArrayList<>(List.of(tenant.requireOutletId(), threshold));
            if (categoryToken != null && !categoryToken.isBlank()) {
                sql += " AND COALESCE(p.category_name, '') ILIKE ?";
                params.add("%" + categoryToken.trim() + "%");
            }
            sql += " ORDER BY p.list_price, p.name, p.id LIMIT 50";
            return ProductCatalogResult.ok(dataSources.jdbc(tenant.requireOutletId())
                    .queryForList(sql, params.toArray()));
        } catch (DataAccessException | IllegalStateException e) {
            return ProductCatalogResult.fail("NATIVE_REPORT_UNAVAILABLE");
        }
    }

    public ZoneId businessTimezone(TenantContext tenant) {
        return com.orithos.common.AustraliaTime.ZONE;
    }

    private static String validateCatalogTenant(TenantContext tenant) {
        if (tenant == null) return "NO_STORE";
        if (tenant.requireOutletId() == null) return "NO_OUTLET";
        return tenant.canQueryReport() ? null : "NO_PERMISSION";
    }

    private static String stringValue(Object value) {
        return value instanceof String text && !text.isBlank() ? text : null;
    }

    public record Result(List<Map<String, Object>> rows, String error, String dataAsOf, String dataSource) {
        public Result(List<Map<String, Object>> rows, String error) {
            this(rows, error, null, null);
        }

        public Result(List<Map<String, Object>> rows, String error, String dataAsOf) {
            this(rows, error, dataAsOf, null);
        }

        static Result ok(List<Map<String, Object>> rows) {
            return new Result(rows, null, null, AiReportDataSourceRegistry.DATA_SOURCE_NAME);
        }

        static Result ok(List<Map<String, Object>> rows, String dataAsOf) {
            return new Result(rows, null, dataAsOf, AiReportDataSourceRegistry.DATA_SOURCE_NAME);
        }

        static Result ok(List<Map<String, Object>> rows, String dataAsOf, String dataSource) {
            return new Result(rows, null, dataAsOf, dataSource);
        }

        static Result fail(String error) {
            return new Result(List.of(), error, null);
        }
    }

    private record QueryCacheKey(long vendorId, long outletId, String intent, Map<String, String> slots,
                                 java.time.LocalDateTime from, java.time.LocalDateTime toExclusive,
                                 boolean canQueryCost) {
        static QueryCacheKey of(TenantContext tenant, String intent, Map<String, String> slots,
                                ReportPeriodResolver.Window window) {
            Map<String, String> normalizedSlots = slots == null ? Map.of()
                    : Collections.unmodifiableMap(new TreeMap<>(slots));
            return new QueryCacheKey(tenant.vendorId(), tenant.requireOutletId(), intent, normalizedSlots,
                    window.from(), window.toExclusive(), tenant.canQueryCost());
        }
    }

    private record CachedResult(Result result, long expiresAtMillis) {
        static CachedResult of(Result result, long expiresAtMillis) {
            List<Map<String, Object>> rows = result.rows().stream()
                    .map(row -> Collections.unmodifiableMap(new LinkedHashMap<>(row)))
                    .toList();
            return new CachedResult(new Result(rows, result.error(), result.dataAsOf(), result.dataSource()),
                    expiresAtMillis);
        }
    }

    private record CatalogCacheKey(long vendorId, long outletId) {}
    private record CachedCatalog(ProductCatalogResult result, long expiresAtMillis) {}

    public record ProductCountResult(Integer count, String error) {
        static ProductCountResult ok(int count) { return new ProductCountResult(count, null); }
        static ProductCountResult fail(String error) { return new ProductCountResult(null, error); }
    }

    public record ProductSearchResult(List<Map<String, Object>> rows, String error) {
        static ProductSearchResult ok(List<Map<String, Object>> rows) { return new ProductSearchResult(rows, null); }
        static ProductSearchResult fail(String error) { return new ProductSearchResult(List.of(), error); }
    }

    public record ProductCatalogResult(List<Map<String, Object>> rows, String error) {
        static ProductCatalogResult ok(List<Map<String, Object>> rows) { return new ProductCatalogResult(rows, null); }
        static ProductCatalogResult fail(String error) { return new ProductCatalogResult(List.of(), error); }
    }
}
