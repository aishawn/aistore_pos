package com.orithos.tenant;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.ApiResult;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * After JWT auth: on a tenant Host, the access token vendor must match the Host vendor.
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 20)
public class TenantMatchFilter extends OncePerRequestFilter {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private TenantShardRegistry shardRegistry;
    private VendorMapper vendorMapper;

    @Autowired(required = false)
    public void setShardRegistry(TenantShardRegistry shardRegistry) {
        this.shardRegistry = shardRegistry;
    }

    @Autowired(required = false)
    public void setVendorMapper(VendorMapper vendorMapper) {
        this.vendorMapper = vendorMapper;
    }

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/public/")
                || path.startsWith("/api/auth/login")
                || path.startsWith("/api/auth/refresh")
                || path.startsWith("/api/auth/forgot-password")
                || path.startsWith("/api/auth/reset-password")
                || path.startsWith("/api/auth/reset-token")
                || path.startsWith("/api/auth/bootstrap")
                || path.startsWith("/actuator/")
                || path.equals("/error")
                || path.equals("/authorized");
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        TenantHolder.ResolvedTenant tenant = TenantHolder.get();
        AuthUser user = CurrentUser.get();
        if (tenant != null && tenant.controlPlane() && user != null && shardRegistry != null
                && user.vendorId() != null && !isGlobalControlEndpoint(request)) {
            String shardKey = shardRegistry.findShardKey(user.vendorId()).orElse(null);
            if (shardKey == null || vendorMapper == null) {
                writeUnavailable(response);
                return;
            }
            Vendor vendor = vendorMapper.findById(user.vendorId());
            if (vendor == null || TenantResolverFilter.isUnavailable(vendor)) {
                writeUnavailable(response);
                return;
            }
            TenantHolder.set(TenantHolder.ResolvedTenant.of(vendor.getSubdomain(), vendor, shardKey));
            tenant = TenantHolder.get();
        }
        if (tenant != null && !tenant.controlPlane() && user != null) {
            Long hostVendor = tenant.vendorId();
            Long tokenVendor = user.vendorId();
            if (hostVendor == null || tokenVendor == null || !hostVendor.equals(tokenVendor)) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                response.setCharacterEncoding("UTF-8");
                response.getWriter().write(objectMapper.writeValueAsString(
                        ApiResult.fail(40310, "Token does not belong to this store")));
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private static boolean isGlobalControlEndpoint(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.startsWith("/api/admin/")
                || path.startsWith("/api/platform/")
                || path.startsWith("/api/public/")
                || path.startsWith("/api/integrations/shopfront/")
                || path.startsWith("/api/auth/login")
                || path.startsWith("/api/auth/refresh")
                || path.startsWith("/api/auth/forgot-password")
                || path.startsWith("/api/auth/reset-password")
                || path.startsWith("/api/auth/reset-token")
                || path.startsWith("/api/auth/bootstrap")
                || path.startsWith("/actuator/")
                || path.equals("/api/openapi.json")
                || path.equals("/error")
                || path.equals("/authorized");
    }

    private void writeUnavailable(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(objectMapper.writeValueAsString(
                ApiResult.fail(50310, "Store database shard is not configured")));
    }
}
