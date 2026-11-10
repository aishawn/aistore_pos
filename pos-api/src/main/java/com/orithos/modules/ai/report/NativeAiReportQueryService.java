package com.orithos.modules.ai.report;

import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Executes fixed AI report templates against the tenant's Orithos read-only views. */
@Service
public class NativeAiReportQueryService {

    private static final int MAX_LIST_ROWS = 50;
    private static final int MAX_CATALOG_ROWS = 10_000;
    private static final int PAGE_SIZE = 500;

    private final AiReportDataSourceRegistry dataSources;
    private final ReportTemplateRegistry templates;

    public NativeAiReportQueryService(AiReportDataSourceRegistry dataSources,
                                      ReportTemplateRegistry templates) {
        this.dataSources = dataSources;
        this.templates = templates;
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
            ReportTemplateRegistry.BoundSql bound = templates.bind(intent, tenant, slots, window);
            if (bound.error() != null) return Result.fail(bound.error());
            List<Map<String, Object>> rows = dataSources.jdbc(tenant.requireOutletId())
                    .queryForList(bound.sql(), bound.params().toArray());
            return Result.ok(rows);
        } catch (DataAccessException | IllegalStateException e) {
            return Result.fail("NATIVE_REPORT_UNAVAILABLE");
        }
    }

    public ProductCountResult countSellableProducts(TenantContext tenant) {
        String error = validateCatalogTenant(tenant);
        if (error != null) return ProductCountResult.fail(error);
        try {
            Integer count = dataSources.jdbc(tenant.requireOutletId()).queryForObject(
                    "SELECT COUNT(*) FROM ai_rpt_product WHERE outlet_id = ? AND status = 'ACTIVE'",
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
            String match = "%" + query.trim() + "%";
            List<Map<String, Object>> rows = dataSources.jdbc(tenant.requireOutletId()).queryForList("""
                    SELECT p.id, p.name, p.barcode, p.list_price,
                           COALESCE(i.quantity, 0) AS quantity
                    FROM ai_rpt_product p
                    LEFT JOIN ai_rpt_inventory i ON i.product_id = p.id AND i.outlet_id = p.outlet_id
                    WHERE p.outlet_id = ? AND p.status = 'ACTIVE'
                      AND (p.name ILIKE ? OR COALESCE(p.barcode, '') ILIKE ?)
                    ORDER BY p.name, p.id
                    LIMIT ?
                    """, tenant.requireOutletId(), match, match,
                    Math.max(1, Math.min(limit <= 0 ? 8 : limit, MAX_LIST_ROWS)));
            return ProductSearchResult.ok(rows);
        } catch (DataAccessException | IllegalStateException e) {
            return ProductSearchResult.fail("NATIVE_REPORT_UNAVAILABLE");
        }
    }

    public ProductCatalogResult listRecommendationProducts(TenantContext tenant) {
        String error = validateCatalogTenant(tenant);
        if (error != null) return ProductCatalogResult.fail(error);
        try {
            List<Map<String, Object>> rows = new ArrayList<>();
            var jdbc = dataSources.jdbc(tenant.requireOutletId());
            for (int offset = 0; offset < MAX_CATALOG_ROWS; offset += PAGE_SIZE) {
                List<Map<String, Object>> page = jdbc.queryForList("""
                        SELECT p.id, p.name, p.list_price, p.list_price AS sell_price,
                               i.quantity, COALESCE(p.category_name, '') AS category
                        FROM ai_rpt_product p
                        JOIN ai_rpt_inventory i ON i.product_id = p.id AND i.outlet_id = p.outlet_id
                        WHERE p.outlet_id = ? AND p.status = 'ACTIVE'
                          AND p.list_price > 0 AND i.quantity > 0
                        ORDER BY p.name, p.id
                        LIMIT ? OFFSET ?
                        """, tenant.requireOutletId(), PAGE_SIZE, offset);
                rows.addAll(page);
                if (page.size() < PAGE_SIZE) break;
            }
            return ProductCatalogResult.ok(rows);
        } catch (DataAccessException | IllegalStateException e) {
            return ProductCatalogResult.fail("NATIVE_REPORT_UNAVAILABLE");
        }
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

    public record Result(List<Map<String, Object>> rows, String error) {
        static Result ok(List<Map<String, Object>> rows) {
            return new Result(rows, null);
        }

        static Result fail(String error) {
            return new Result(List.of(), error);
        }
    }

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
