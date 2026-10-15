package com.orithos.tenant;

import com.orithos.modules.vendor.Vendor;

/** Request-scoped tenant resolved from Host / X-Orithos-Tenant-Slug. */
public final class TenantHolder {

    private static final ThreadLocal<ResolvedTenant> CURRENT = new ThreadLocal<>();

    private TenantHolder() {}

    public record ResolvedTenant(boolean controlPlane, String slug, Vendor vendor) {
        public static ResolvedTenant controlPlaneTenant() {
            return new ResolvedTenant(true, null, null);
        }

        public static ResolvedTenant of(String slug, Vendor vendor) {
            return new ResolvedTenant(false, slug, vendor);
        }

        public Long vendorId() {
            return vendor == null ? null : vendor.getId();
        }
    }

    public static void set(ResolvedTenant tenant) {
        CURRENT.set(tenant);
    }

    public static ResolvedTenant get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
