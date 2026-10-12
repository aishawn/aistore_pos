package com.orithos.modules.ai.report;

import java.util.List;
import java.util.Set;

/**
 * Tenant / store identity for AI reports. Built from JWT, never from the model.
 */
public record TenantContext(
        long vendorId,
        long userId,
        Long currentOutletId,
        List<Long> outletIds,
        Set<String> authorities
) {
    public static final long DEFAULT_VENDOR_ID = 1L;
    public static final String PERM_QUERY = "perm:ai.report.query";
    public static final String PERM_COST = "perm:ai.report.cost";

    public boolean canQueryReport() {
        return has(PERM_QUERY) || has("ROLE_ADMIN");
    }

    public boolean canQueryCost() {
        return has(PERM_COST) || has("ROLE_ADMIN");
    }

    public Long requireOutletId() {
        if (currentOutletId != null) {
            return currentOutletId;
        }
        if (outletIds != null && !outletIds.isEmpty()) {
            return outletIds.get(0);
        }
        return null;
    }

    private boolean has(String authority) {
        return authorities != null && authorities.contains(authority);
    }
}
