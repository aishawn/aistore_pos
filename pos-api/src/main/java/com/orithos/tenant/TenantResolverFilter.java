package com.orithos.tenant;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.ApiResult;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
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
import java.time.LocalDateTime;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class TenantResolverFilter extends OncePerRequestFilter {

    private final TenantSlugParser slugParser;
    private final VendorMapper vendorMapper;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TenantResolverFilter(TenantSlugParser slugParser, VendorMapper vendorMapper) {
        this.slugParser = slugParser;
        this.vendorMapper = vendorMapper;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        try {
            TenantSlugParser.HostTenant hostTenant = slugParser.resolve(request);
            if (hostTenant.controlPlane()) {
                TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());
                filterChain.doFilter(request, response);
                return;
            }

            Vendor vendor = vendorMapper.findBySubdomain(hostTenant.slug());
            if (vendor == null) {
                writeJson(response, HttpServletResponse.SC_NOT_FOUND, 40410, "Store not found");
                return;
            }
            if (isUnavailable(vendor)) {
                writeJson(response, 402, 40200, "This trial or store is no longer available");
                return;
            }
            TenantHolder.set(TenantHolder.ResolvedTenant.of(hostTenant.slug(), vendor));
            filterChain.doFilter(request, response);
        } finally {
            TenantHolder.clear();
        }
    }

    public static boolean isUnavailable(Vendor vendor) {
        if (vendor == null) return true;
        String status = vendor.getStatus() == null ? "" : vendor.getStatus().toLowerCase();
        if ("suspended".equals(status) || "expired".equals(status)) {
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
