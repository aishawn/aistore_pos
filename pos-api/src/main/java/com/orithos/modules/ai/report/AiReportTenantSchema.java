package com.orithos.modules.ai.report;

/**
 * Per-outlet SaaS schema names. Tenant id is {@code outletId}, not vendorId.
 */
public final class AiReportTenantSchema {

    public static final String SCHEMA_PREFIX = "orithos_o";

    private AiReportTenantSchema() {}

    public static String schemaName(long outletId) {
        requireOutletId(outletId);
        return SCHEMA_PREFIX + outletId;
    }

    public static String username(String baseUser, long outletId) {
        requireOutletId(outletId);
        String base = (baseUser == null || baseUser.isBlank()) ? "orithos_ai_ro" : baseUser.trim();
        return base + "_o" + outletId;
    }

    public static String jdbcUrl(String primaryUrl, long outletId) {
        requireOutletId(outletId);
        if (primaryUrl == null || primaryUrl.isBlank()) {
            throw new IllegalArgumentException("JDBC URL is required");
        }
        String schema = schemaName(outletId);
        int q = primaryUrl.indexOf('?');
        String base = q >= 0 ? primaryUrl.substring(0, q) : primaryUrl;
        String qs = q >= 0 ? primaryUrl.substring(q) : "";
        int slash = base.lastIndexOf('/');
        if (slash < 0) {
            throw new IllegalArgumentException("JDBC URL has no database name");
        }
        return base.substring(0, slash + 1) + schema + qs;
    }

    static void requireOutletId(long outletId) {
        if (outletId <= 0) {
            throw new SqlGuardException("Query must filter by outlet_id");
        }
    }
}
