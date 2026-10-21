package com.orithos.tenant;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.regex.Pattern;

@Component
public class TenantSlugParser {

    private static final Pattern SLUG_PATTERN =
            Pattern.compile("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$");

    private final TenantProperties props;

    public TenantSlugParser(TenantProperties props) {
        this.props = props;
    }

    public record HostTenant(boolean controlPlane, String slug) {
        public static HostTenant controlPlaneTenant() {
            return new HostTenant(true, null);
        }

        public static HostTenant tenant(String slug) {
            return new HostTenant(false, slug);
        }
    }

    public HostTenant resolve(HttpServletRequest request) {
        // The Host header is the tenant boundary. Never let a client-supplied
        // tenant slug override it; callers must be rejected by the host resolver
        // rather than selecting another store with an arbitrary request header.
        String host = firstHost(request.getHeader("X-Forwarded-Host"));
        if (host == null || host.isBlank()) {
            host = firstHost(request.getHeader("Host"));
        }
        return resolveHost(host);
    }

    public HostTenant resolveHost(String hostHeader) {
        if (hostHeader == null || hostHeader.isBlank()) {
            return HostTenant.controlPlaneTenant();
        }
        String host = hostHeader.trim().toLowerCase(Locale.ROOT);
        int colon = host.indexOf(':');
        if (colon >= 0) {
            host = host.substring(0, colon);
        }
        String base = props.getBaseDomain().trim().toLowerCase(Locale.ROOT);
        if (host.equals(base) || host.equals("www." + base) || host.equals("app." + base)
                || host.equals("localhost") || host.equals("127.0.0.1")) {
                return HostTenant.controlPlaneTenant();
        }
        String suffix = "." + base;
        if (host.endsWith(suffix) && host.length() > suffix.length()) {
            String slug = host.substring(0, host.length() - suffix.length());
            if (slug.contains(".")) {
                return HostTenant.controlPlaneTenant();
            }
            String normalized = normalizeSlug(slug);
            if (normalized == null || props.reservedSlugSet().contains(normalized)) {
                return HostTenant.controlPlaneTenant();
            }
            return HostTenant.tenant(normalized);
        }
        return HostTenant.controlPlaneTenant();
    }

    public String normalizeSlug(String raw) {
        if (raw == null) return null;
        String slug = raw.trim().toLowerCase(Locale.ROOT);
        if (!SLUG_PATTERN.matcher(slug).matches()) {
            return null;
        }
        return slug;
    }

    public boolean isValidSlugFormat(String slug) {
        return normalizeSlug(slug) != null;
    }

    public boolean isReserved(String slug) {
        String normalized = normalizeSlug(slug);
        return normalized == null || props.reservedSlugSet().contains(normalized);
    }

    private static String firstHost(String header) {
        if (header == null || header.isBlank()) return null;
        return header.split(",")[0].trim();
    }
}
