package com.orithos.modules.user;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Fixed store permission catalog and default grants for managed roles.
 * IDs 9101–9102 are shared with {@code AiReportSchemaMigrator}.
 */
public final class StorePermissionCatalog {

    public static final String MANAGED_ADMIN = "ADMIN";
    public static final String MANAGED_MANAGER = "MANAGER";
    public static final String MANAGED_CLERK = "CLERK";

    public record Def(int id, String name, String safeName, String section) {}

    private static final List<Def> ALL = List.of(
            new Def(9201, "Checkout / sell", "sell.checkout", "Sell"),
            new Def(9202, "Refund", "sell.refund", "Sell"),
            new Def(9203, "Void sale", "sell.void", "Sell"),
            new Def(9204, "Discount / price override", "sell.discount", "Sell"),
            new Def(9205, "Open register", "sell.register.open", "Sell"),
            new Def(9206, "Close register", "sell.register.close", "Sell"),
            new Def(9207, "Cash in / out", "sell.cash.move", "Sell"),

            new Def(9210, "View products", "stock.products.view", "Stock"),
            new Def(9211, "Edit products", "stock.products.edit", "Stock"),
            new Def(9212, "Import / export products", "stock.products.import_export", "Stock"),
            new Def(9213, "Replenishment", "stock.replenishment", "Stock"),
            new Def(9214, "Purchases", "stock.purchases", "Stock"),
            new Def(9215, "Receive stock", "stock.receive", "Stock"),
            new Def(9216, "Stocktake", "stock.stocktake", "Stock"),
            new Def(9217, "Suppliers", "stock.suppliers", "Stock"),
            new Def(9218, "Supplier invoices", "stock.invoices", "Stock"),

            new Def(9220, "View customers", "customers.view", "Customers"),
            new Def(9221, "Edit customers", "customers.edit", "Customers"),
            new Def(9222, "Customer groups", "customers.groups", "Customers"),
            new Def(9223, "Price lists", "customers.pricelists", "Customers"),
            new Def(9224, "Customer balances", "customers.balances", "Customers"),
            new Def(9225, "Gift cards", "customers.gift_cards", "Customers"),

            new Def(9230, "Reports dashboard", "reports.dashboard", "Reports"),

            new Def(9240, "AI Assistant", "ai.assistant", "AI"),
            new Def(9241, "Recommend", "ai.recommend", "AI"),
            new Def(9242, "Sommelier", "ai.sommelier", "AI"),
            new Def(9243, "Find grocery", "ai.grocery", "AI"),
            new Def(9244, "Price suggestions", "ai.price_suggestions", "AI"),
            new Def(9245, "Invoice OCR", "ai.invoice", "AI"),
            new Def(9101, "AI Report Query", "ai.report.query", "AI"),
            new Def(9102, "AI Report Cost", "ai.report.cost", "AI"),

            new Def(9250, "View settings", "settings.view", "Settings"),
            new Def(9251, "Store settings", "settings.store", "Settings"),
            new Def(9252, "Manage users", "settings.users", "Settings"),
            new Def(9253, "Manage permissions", "settings.permissions", "Settings"),
            new Def(9254, "Data tools", "settings.data", "Settings"),
            new Def(9255, "Integrations", "settings.integrations", "Settings")
    );

    /** Permissions managers do not receive by default (admin-only). */
    public static final Set<String> ADMIN_ONLY_SAFE_NAMES = Set.of(
            "settings.data",
            "settings.integrations"
    );

    public static final Set<String> CLERK_DEFAULT_SAFE_NAMES = Set.of(
            "sell.checkout",
            "stock.products.view",
            "customers.view",
            "reports.dashboard",
            "ai.assistant"
    );

    private StorePermissionCatalog() {}

    public static List<Def> all() {
        return ALL;
    }

    public static List<String> allSafeNames() {
        List<String> names = new ArrayList<>(ALL.size());
        for (Def def : ALL) {
            names.add(def.safeName());
        }
        return names;
    }

    public static Map<String, Integer> idBySafeName() {
        Map<String, Integer> map = new LinkedHashMap<>();
        for (Def def : ALL) {
            map.put(def.safeName(), def.id());
        }
        return map;
    }

    public static List<Integer> managerDefaultIds() {
        List<Integer> ids = new ArrayList<>();
        for (Def def : ALL) {
            if (!ADMIN_ONLY_SAFE_NAMES.contains(def.safeName())) {
                ids.add(def.id());
            }
        }
        return ids;
    }

    public static List<Integer> clerkDefaultIds() {
        Map<String, Integer> ids = idBySafeName();
        List<Integer> result = new ArrayList<>();
        for (String safe : CLERK_DEFAULT_SAFE_NAMES) {
            Integer id = ids.get(safe);
            if (id != null) {
                result.add(id);
            }
        }
        return result;
    }

    public static List<Integer> allIds() {
        List<Integer> ids = new ArrayList<>(ALL.size());
        for (Def def : ALL) {
            ids.add(def.id());
        }
        return ids;
    }
}
