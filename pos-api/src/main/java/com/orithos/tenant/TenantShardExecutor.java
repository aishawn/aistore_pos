package com.orithos.tenant;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

/** Explicit tenant context for scheduled work and one-off maintenance jobs. */
@Component
@ConditionalOnProperty(name = "app.sharding.enabled", havingValue = "true")
public class TenantShardExecutor {

    private final TenantShardRegistry registry;

    public TenantShardExecutor(TenantShardRegistry registry) {
        this.registry = registry;
    }

    public <T> T withVendor(long vendorId, Supplier<T> work) {
        String shardKey = registry.findShardKey(vendorId)
                .orElseThrow(() -> new IllegalStateException("Vendor has no database shard assignment"));
        TenantHolder.ResolvedTenant previous = TenantHolder.get();
        TenantHolder.set(TenantHolder.ResolvedTenant.forShard(vendorId, shardKey));
        try {
            return work.get();
        } finally {
            restore(previous);
        }
    }

    public void withVendor(long vendorId, Runnable work) {
        withVendor(vendorId, () -> {
            work.run();
            return null;
        });
    }

    public <T> T withControlPlane(Supplier<T> work) {
        TenantHolder.ResolvedTenant previous = TenantHolder.get();
        TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());
        try {
            return work.get();
        } finally {
            restore(previous);
        }
    }

    public void withControlPlane(Runnable work) {
        withControlPlane(() -> {
            work.run();
            return null;
        });
    }

    private static void restore(TenantHolder.ResolvedTenant previous) {
        if (previous == null) TenantHolder.clear();
        else TenantHolder.set(previous);
    }
}
