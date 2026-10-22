package com.orithos.modules.ai;

import com.orithos.modules.ai.report.OdooReportQueryService;
import com.orithos.modules.ai.report.ReportPeriodResolver;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Read-only tools for the qa path. Tenant comes from {@link AssistantTenantContext}, never from model args.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class PosAssistantTools {

    private final OdooReportQueryService queryService;
    private final ReportPeriodResolver periodResolver;

    public PosAssistantTools(OdooReportQueryService queryService, ReportPeriodResolver periodResolver) {
        this.queryService = queryService;
        this.periodResolver = periodResolver;
    }

    @Tool(description = "Get sales totals for a date range in the current store. Use for revenue / takings questions.")
    public String lookupSales(
            @ToolParam(description = "ISO date YYYY-MM-DD start, or today/yesterday") String from,
            @ToolParam(description = "ISO date YYYY-MM-DD end inclusive, or today/yesterday") String to) {
        return runReport("report_sales", Map.of(
                "from", nullToEmpty(from),
                "to", nullToEmpty(to)
        ), "Sales");
    }

    @Tool(description = "Look up on-hand stock for a product name in the current store catalogue.")
    public String lookupStock(
            @ToolParam(description = "Product name fragment to search") String productName) {
        if (productName == null || productName.isBlank()) {
            return "NEED_PRODUCT: tell me which product to check.";
        }
        return runReport("report_stock", Map.of("query", productName.trim()), "Stock");
    }

    @Tool(description = "Average ticket and sale count for a date range in the current store.")
    public String lookupAverageTicket(
            @ToolParam(description = "ISO date YYYY-MM-DD start, or today/yesterday") String from,
            @ToolParam(description = "ISO date YYYY-MM-DD end inclusive, or today/yesterday") String to) {
        return runReport("report_aov", Map.of(
                "from", nullToEmpty(from),
                "to", nullToEmpty(to)
        ), "Average ticket");
    }

    @Tool(description = "Count sellable products in the current store catalogue. Use for 'how many products' questions.")
    public String countProducts() {
        TenantContext tenant = AssistantTenantContext.get();
        if (tenant == null) {
            return "NO_STORE: sign in to a store first.";
        }
        Integer count = queryService.countSellableProducts(tenant);
        if (count == null) {
            return "Product count unavailable. Open Products to browse the catalogue.";
        }
        return "Sellable products in catalogue: " + count;
    }

    @Tool(description = "Search products by name in the current store catalogue. Read-only.")
    public String searchProducts(
            @ToolParam(description = "Product name fragment to search") String productName) {
        if (productName == null || productName.isBlank()) {
            return "NEED_PRODUCT: tell me which product name to search.";
        }
        TenantContext tenant = AssistantTenantContext.get();
        if (tenant == null) {
            return "NO_STORE: sign in to a store first.";
        }
        List<Map<String, Object>> rows = queryService.searchProducts(tenant, productName.trim(), 8);
        if (rows.isEmpty()) {
            return "No catalogue matches for \"" + productName.trim() + "\".";
        }
        return rows.stream()
                .map(row -> row.getOrDefault("name", "") + " qty=" + row.getOrDefault("quantity", "")
                        + " price=" + row.getOrDefault("list_price", ""))
                .collect(Collectors.joining(" | "));
    }

    private String runReport(String intent, Map<String, String> slots, String label) {
        TenantContext tenant = AssistantTenantContext.get();
        if (tenant == null) {
            return "NO_STORE: sign in to a store first.";
        }
        var window = periodResolver.resolve(slots, "", 1, queryService.businessTimezone(tenant));
        OdooReportQueryService.Result result = queryService.query(tenant, intent, slots, window);
        if (result.error() != null && !result.error().isBlank()) {
            return label + " unavailable: " + result.error();
        }
        List<Map<String, Object>> rows = result.rows();
        if (rows == null || rows.isEmpty()) {
            return label + ": no rows for the selected period.";
        }
        return rows.stream()
                .limit(8)
                .map(row -> row.entrySet().stream()
                        .map(e -> e.getKey() + "=" + e.getValue())
                        .collect(Collectors.joining(", ")))
                .collect(Collectors.joining(" | "));
    }

    private static String nullToEmpty(String v) {
        return v == null ? "" : v.trim();
    }
}
