package com.orithos.tenant;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.orithos.common.ApiResult;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;
import java.time.LocalDateTime;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class TenantResolverFilter extends OncePerRequestFilter {

    private final TenantSlugParser slugParser;
    private final VendorMapper vendorMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private TenantShardRegistry shardRegistry;

    public TenantResolverFilter(TenantSlugParser slugParser, VendorMapper vendorMapper) {
        this.slugParser = slugParser;
        this.vendorMapper = vendorMapper;
    }

    @Autowired(required = false)
    public void setShardRegistry(TenantShardRegistry shardRegistry) {
        this.shardRegistry = shardRegistry;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        try {
            TenantSlugParser.HostTenant hostTenant = slugParser.resolve(request);
            // The Next BFF derives this header from the public Host before it
            // forwards the request. Some Dokploy/Cloudflare routes overwrite
            // X-Forwarded-Host with the control-plane host, so retain the
            // tenant boundary from the trusted internal BFF header.
            if (hostTenant.controlPlane()) {
                String forwardedSlug = slugParser.normalizeSlug(
                        request.getHeader("X-Orithos-Tenant-Slug"));
                if (forwardedSlug == null) {
                    forwardedSlug = slugParser.forwardedTenantSlug(
                            request.getHeader("X-Forwarded-Host"));
                }
                // Keep infrastructure hosts on the control plane. A legacy
                // deployment may incorrectly reserve the real pilot slug
                // `skr`, so allow that one tenant through the stale list.
                if (forwardedSlug != null
                        && (!slugParser.isReserved(forwardedSlug) || "skr".equals(forwardedSlug))) {
                    hostTenant = TenantSlugParser.HostTenant.tenant(forwardedSlug);
                }
            }
            if (shardRegistry != null && isAdminProvisionEndpoint(request)) {
                writeJson(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, 50312,
                        "Tenant provisioning is not available while database sharding is enabled");
                return;
            }
            if (isPublicControlPlaneEndpoint(request)) {
                if (shardRegistry != null && isTenantProvisioningEndpoint(request)) {
                    writeJson(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, 50312,
                            "Tenant provisioning is not available while database sharding is enabled");
                    return;
                }
                TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());
                filterChain.doFilter(request, response);
                return;
            }

            if (isServiceIntegrationEndpoint(request)) {
                if (shardRegistry == null) {
                    TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());
                    filterChain.doFilter(request, response);
                    return;
                }
                handleShardedIntegration(request, response, filterChain);
                return;
            }

            if (hostTenant.controlPlane()) {
                if (shardRegistry != null && isTenantScopedRecoveryEndpoint(request)) {
                    writeJson(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, 50313,
                            "Account recovery must be requested on the assigned store domain");
                    return;
                }
                TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());
                filterChain.doFilter(request, response);
                return;
            }

            Vendor vendor = findVendorOnControl(hostTenant.slug());
            if (vendor == null) {
                writeJson(response, HttpServletResponse.SC_NOT_FOUND, 40410, "Store not found");
                return;
            }
            if (isUnavailable(vendor)) {
                writeJson(response, 402, 40200, "This trial or store is no longer available");
                return;
            }
            String shardKey = shardRegistry == null ? null : shardRegistry.findShardKey(vendor.getId()).orElse(null);
            if (shardRegistry != null && shardKey == null) {
                writeJson(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, 50310,
                        "Store database shard is not configured");
                return;
            }
            TenantHolder.set(TenantHolder.ResolvedTenant.of(hostTenant.slug(), vendor, shardKey));
            filterChain.doFilter(request, response);
        } finally {
            TenantHolder.clear();
        }
    }

    private Vendor findVendorOnControl(String slug) {
        if (shardRegistry == null) return vendorMapper.findBySubdomain(slug);
        TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());
        try {
            return vendorMapper.findBySubdomain(slug);
        } finally {
            TenantHolder.clear();
        }
    }

    private void handleShardedIntegration(HttpServletRequest request,
                                         HttpServletResponse response,
                                         FilterChain filterChain) throws IOException, ServletException {
        if (isMappingManagementRequest(request)) {
            if (!"GET".equalsIgnoreCase(request.getMethod())) {
                writeJson(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, 50314,
                        "Shopfront mapping updates are unavailable until cross-shard synchronization is enabled");
                return;
            }
            TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());
            filterChain.doFilter(request, response);
            return;
        }

        CachedBodyRequest wrapped = new CachedBodyRequest(request);
        Set<String> storeKeys = findStoreKeys(wrapped);
        if (storeKeys.isEmpty()) {
            writeJson(response, HttpServletResponse.SC_SERVICE_UNAVAILABLE, 50311,
                    "Shopfront requests must identify one store_key when database sharding is enabled");
            return;
        }

        TenantShardRegistry.Route selected = null;
        for (String storeKey : storeKeys) {
            TenantShardRegistry.Route route = shardRegistry.findShopfrontRoute(storeKey).orElse(null);
            if (route == null) {
                writeJson(response, HttpServletResponse.SC_CONFLICT, 40911,
                        "Shopfront store_key has no enabled merchant shard mapping");
                return;
            }
            if (selected != null && selected.vendorId() != route.vendorId()) {
                writeJson(response, HttpServletResponse.SC_CONFLICT, 40912,
                        "A Shopfront request cannot span multiple merchants");
                return;
            }
            selected = route;
        }

        TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());
        Vendor vendor;
        try {
            vendor = vendorMapper.findById(selected.vendorId());
        } finally {
            TenantHolder.clear();
        }
        if (vendor == null || isUnavailable(vendor)) {
            writeJson(response, HttpServletResponse.SC_NOT_FOUND, 40410, "Store not found");
            return;
        }
        TenantHolder.set(TenantHolder.ResolvedTenant.of(vendor.getSubdomain(), vendor, selected.shardKey()));
        filterChain.doFilter(wrapped, response);
    }

    private Set<String> findStoreKeys(HttpServletRequest request) throws IOException {
        Set<String> keys = new LinkedHashSet<>();
        addStoreKey(keys, request.getParameter("store_key"));
        addStoreKey(keys, request.getParameter("storeKey"));
        String contentType = request.getContentType();
        if (contentType == null || !contentType.toLowerCase().contains("json")) return keys;
        byte[] body = ((CachedBodyRequest) request).getCachedBody();
        if (body.length == 0) return keys;
        if (body.length > 8 * 1024 * 1024) {
            throw new IOException("Shopfront integration request body exceeds the configured limit");
        }
        JsonNode root = objectMapper.readTree(body);
        collectStoreKeys(root, keys);
        return keys;
    }

    private static void collectStoreKeys(JsonNode node, Set<String> keys) {
        if (node == null) return;
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                String name = entry.getKey().toLowerCase();
                if (name.equals("store_key") || name.equals("storekey")
                        || name.equals("source_store_key") || name.equals("target_store_key")) {
                    if (entry.getValue().isTextual()) addStoreKey(keys, entry.getValue().asText());
                }
                collectStoreKeys(entry.getValue(), keys);
            });
        } else if (node.isArray()) {
            node.forEach(child -> collectStoreKeys(child, keys));
        }
    }

    private static void addStoreKey(Set<String> keys, String value) {
        if (value != null && !value.isBlank()) keys.add(value.trim());
    }

    private static boolean isMappingManagementRequest(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.endsWith("/mappings") || path.contains("/mappings/");
    }

    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        private CachedBodyRequest(HttpServletRequest request) throws IOException {
            super(request);
            this.body = request.getInputStream().readAllBytes();
        }

        private byte[] getCachedBody() {
            return body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override public int read() { return input.read(); }
                @Override public boolean isFinished() { return input.available() == 0; }
                @Override public boolean isReady() { return true; }
                @Override public void setReadListener(ReadListener listener) {
                    if (listener == null) return;
                    try {
                        if (isFinished()) listener.onAllDataRead();
                        else listener.onDataAvailable();
                    } catch (IOException ex) {
                        listener.onError(ex);
                    }
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
        }
    }

    private static boolean isPublicControlPlaneEndpoint(HttpServletRequest request) {
        if (!"GET".equalsIgnoreCase(request.getMethod()) && !"POST".equalsIgnoreCase(request.getMethod())) {
            return false;
        }
        String path = request.getRequestURI();
        return "/api/public/signup".equals(path)
                || "/api/public/subdomain-available".equals(path);
    }

    private static boolean isServiceIntegrationEndpoint(HttpServletRequest request) {
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (contextPath != null && !contextPath.isBlank() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        return path.equals("/api/integrations/shopfront")
                || path.startsWith("/api/integrations/shopfront/");
    }

    private static boolean isTenantProvisioningEndpoint(HttpServletRequest request) {
        return "/api/public/signup".equals(request.getRequestURI());
    }

    private static boolean isAdminProvisionEndpoint(HttpServletRequest request) {
        return "/api/admin/tenants".equals(request.getRequestURI())
                && "POST".equalsIgnoreCase(request.getMethod());
    }

    private static boolean isTenantScopedRecoveryEndpoint(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.equals("/api/auth/forgot-password")
                || path.equals("/api/auth/reset-password")
                || path.equals("/api/auth/reset-token");
    }

    public static boolean isUnavailable(Vendor vendor) {
        if (vendor == null) return true;
        String status = vendor.getStatus() == null ? "" : vendor.getStatus().toLowerCase();
        if ("deleted".equals(status) || "suspended".equals(status) || "expired".equals(status)) {
            return true;
        }
        if ("trial".equals(status) && vendor.getTrialEndsAt() != null
                && vendor.getTrialEndsAt().isBefore(LocalDateTime.now())) {
            return true;
        }
        return false;
    }

    private void writeJson(HttpServletResponse response, int httpStatus, int code, String message)
            throws IOException {
        response.setStatus(httpStatus);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(ApiResult.fail(code, message)));
    }
}
