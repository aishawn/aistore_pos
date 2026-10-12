package com.orithos.modules.ai.report;

import java.util.Locale;
import java.util.Map;

/**
 * Whitelist views for AI report SQL and which tenant column each scan must filter.
 */
public final class AiReportTableCatalog {

    public static final int MAX_NESTING = 5;

    public record Policy(String name, boolean outletId, boolean vendorId, boolean costView) {
        public String tenantColumn() {
            if (outletId) {
                return "outlet_id";
            }
            if (vendorId) {
                return "vendor_id";
            }
            return null;
        }
    }

    private static final Map<String, Policy> BY_NAME = Map.of(
            "ai_rpt_sale_item", new Policy("ai_rpt_sale_item", true, false, false),
            "ai_rpt_product", new Policy("ai_rpt_product", true, false, false),
            "ai_rpt_inventory", new Policy("ai_rpt_inventory", true, false, false),
            "ai_rpt_customer_sale", new Policy("ai_rpt_customer_sale", true, false, false),
            "ai_rpt_sale_item_cost", new Policy("ai_rpt_sale_item_cost", true, false, true)
    );

    private AiReportTableCatalog() {}

    public static String bareName(String table) {
        String t = table == null ? "" : table.toLowerCase(Locale.ROOT).replace("`", "").trim();
        int dot = t.lastIndexOf('.');
        return dot >= 0 ? t.substring(dot + 1) : t;
    }

    public static Policy policy(String table) {
        return BY_NAME.get(bareName(table));
    }

    public static boolean isAllowed(String table, TenantContext tenant) {
        Policy p = policy(table);
        if (p == null) {
            return false;
        }
        if (p.costView() && (tenant == null || !tenant.canQueryCost())) {
            return false;
        }
        return true;
    }
}
