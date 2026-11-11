package com.orithos.tenant;

import com.orithos.modules.vendor.Vendor;

/** Request-scoped tenant resolved from Host / X-Orithos-Tenant-Slug. */
public final class TenantHolder {

    private static final ThreadLocal<ResolvedTenant> CURRENT = new ThreadLocal<>();

    private TenantHolder() {}

    public record ResolvedTenant(boolean controlPlane, String slug, Vendor vendor, String shardKey) {
        public static ResolvedTenant controlPlaneTenant() {
            return new ResolvedTenant(true, null, null, null);
        }

        public static ResolvedTenant of(String slug, Vendor vendor) {
            return of(slug, vendor, null);
        }

        public static ResolvedTenant of(String slug, Vendor vendor, String shardKey) {
            return new ResolvedTenant(false, slug, vendor, shardKey);
        }

        public static ResolvedTenant forShard(Long vendorId, String shardKey) {
            Vendor vendor = null;
            if (vendorId != null) {
                vendor = new Vendor();
                vendor.setId(vendorId);
            }
            return new ResolvedTenant(false, null, vendor, shardKey);
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
