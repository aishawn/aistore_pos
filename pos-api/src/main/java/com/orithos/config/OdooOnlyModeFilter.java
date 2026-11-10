package com.orithos.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.ApiResult;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Fail closed for the old PostgreSQL POS API when a deployment is Odoo-only.
 * Odoo routes are served by the Next BFF and are not affected. This prevents
 * unscoped reference controllers from becoming a second writable tenant store.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public final class OdooOnlyModeFilter extends OncePerRequestFilter {
    private static final Set<String> LEGACY_PREFIXES = Set.of(
            "/api/barcode-templates", "/api/bulk-price-edit", "/api/buying-periods",
            "/api/capped-pricing", "/api/classifications", "/api/customer-displays",
            "/api/customer-payments", "/api/customers", "/api/external-stocktakes",
            "/api/future-costs", "/api/future-prices", "/api/gift-cards", "/api/host",
            "/api/host-connections", "/api/kitchen-screens",
            "/api/mail-log", "/api/notifications", "/api/order-reviews", "/api/orders",
            "/api/outlets", "/api/payment-methods", "/api/price-lists", "/api/price-sets",
            "/api/product-backorders", "/api/products", "/api/promotion-categories",
            "/api/promotions", "/api/push-devices", "/api/quick-menu", "/api/receipts",
            "/api/register-closures", "/api/registers", "/api/reports", "/api/resources",
            "/api/sale-keys", "/api/sales", "/api/security-events", "/api/settings",
            "/api/shelf-tickets", "/api/statements", "/api/stock-list", "/api/stocktakes",
            "/api/suppliers", "/api/supply-chain", "/api/tax-rates", "/api/ticket-template-pages",
            "/api/ticket-templates", "/api/transferees", "/api/trashed-items",
            "/api/vendor-connections", "/api/webhooks");

    private final boolean enabled;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public OdooOnlyModeFilter(@Value("${app.odoo-only-mode:false}") boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        if (enabled && isLegacy(request.getRequestURI(), request.getMethod())) {
            response.setStatus(HttpServletResponse.SC_GONE);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write(objectMapper.writeValueAsString(
            ApiResult.fail(41001, "This Classic POS API route is retired.")));
            return;
        }
        chain.doFilter(request, response);
    }

    private static boolean isLegacy(String path, String method) {
        // Orders now have vendor-scoped Orithos handlers and are the native
        // purchasing ledger. Keep unrelated Classic endpoints behind the gate.
        if (path.equals("/api/orders") || path.startsWith("/api/orders/")) {
            return false;
        }
        // Supplier CRUD, import, product links, and merge all derive vendor
        // scope from the authenticated user in SupplierController/Service.
        if (path.equals("/api/suppliers") || path.startsWith("/api/suppliers/")) {
            return false;
        }
        // Only scoped sales reads and the validated checkout workflow are live.
        // Legacy sale create/update endpoints accept client-authored ledger values.
        if (path.equals("/api/sales") || path.startsWith("/api/sales/")) {
            return !"GET".equalsIgnoreCase(method)
                    && !("POST".equalsIgnoreCase(method)
                    && (path.equals("/api/sales/quote") || path.equals("/api/sales/checkout")
                    || path.matches("/api/sales/[0-9]+/refunds")));
        }
        // These read endpoints are used by the native purchasing UI. Their
        // controllers scope results to the authenticated tenant; keep writes
        // and supplier detail endpoints behind the legacy gate until audited.
        if ("GET".equalsIgnoreCase(method)
                && (path.equals("/api/suppliers") || path.equals("/api/outlets"))) {
            return false;
        }
        // Orithos is the live catalogue for Demo/SKR after Shopfront sync.
        // ProductController scopes list/detail reads to the authenticated outlet.
        if ("GET".equalsIgnoreCase(method)
                && (path.equals("/api/products") || path.startsWith("/api/products/"))) {
            return false;
        }
        if (path.equals("/api/supply-chain/plan")
                || path.equals("/api/supply-chain/settings")
                || path.matches("/api/supply-chain/suppliers/[0-9]+/cart")) {
            return false;
        }
        if (path.equals("/api/retail/registers") || path.startsWith("/api/retail/registers/")) {
            return false;
        }
        // Shopfront is an isolated, token-authenticated staging boundary. It
        // never writes Odoo or Classic POS business tables.
        if (path.equals("/api/integrations/shopfront") || path.startsWith("/api/integrations/shopfront/")) {
            return false;
        }
        // Only the new outlet-scoped ledger report is live; keep legacy
        // reporting routes behind the reference-API protection.
        if ("GET".equalsIgnoreCase(method)
                && (path.equals("/api/reports/native-overview")
                || path.equals("/api/reports/native-sales-history"))) {
            return false;
        }
        // Customer directory / groups / price lists are native Orithos after
        // Shopfront sync. Controllers scope rows to the authenticated outlet.
        // Keep statements/export/payment side-paths gated until audited.
        if (path.equals("/api/customers")
                || path.matches("/api/customers/[0-9]+")
                || path.matches("/api/customers/[0-9]+/(recent-sales|revisions)")
                || path.equals("/api/customers/groups")
                || path.matches("/api/customers/groups/[0-9]+")
                || path.matches("/api/customers/groups/[0-9]+/revisions")
                || path.equals("/api/price-lists")
                || path.matches("/api/price-lists/[0-9]+")) {
            return false;
        }
        if ("GET".equalsIgnoreCase(method)
                && (path.equals("/api/customer-payments")
                || path.matches("/api/customer-payments/[0-9]+")
                || path.matches("/api/customer-payments/[0-9]+/allocations"))) {
            return false;
        }
        if (path.equals("/api/integrations") || path.startsWith("/api/integrations/")) {
            return true;
        }
        return LEGACY_PREFIXES.stream().anyMatch(prefix -> path.equals(prefix) || path.startsWith(prefix + "/"));
    }
}
