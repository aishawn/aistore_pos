package com.orithos.config;

import com.orithos.tenant.TenantHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ShardRoutingDataSourceTest {

    private final Method lookupKey = lookupKeyMethod();

    @AfterEach
    void clearTenant() {
        TenantHolder.clear();
    }

    @Test
    void routesControlAndTenantContextsToTheirExplicitTargets() throws Exception {
        ShardRoutingDataSource dataSource = new ShardRoutingDataSource(java.util.Map.of());

        TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());
        assertThat(lookupKey.invoke(dataSource)).isEqualTo(ShardRoutingConfiguration.CONTROL_ROUTE);

        TenantHolder.set(TenantHolder.ResolvedTenant.forShard(41L, "shard_02"));
        assertThat(lookupKey.invoke(dataSource)).isEqualTo("shard_02");
    }

    @Test
    void failsClosedWithoutContextOrShardAssignment() {
        ShardRoutingDataSource dataSource = new ShardRoutingDataSource(java.util.Map.of());

        assertThatThrownBy(() -> lookupKey.invoke(dataSource))
                .isInstanceOf(InvocationTargetException.class)
                .hasCauseInstanceOf(IllegalStateException.class);

        TenantHolder.set(TenantHolder.ResolvedTenant.of("skr", new com.orithos.modules.vendor.Vendor()));
        assertThatThrownBy(() -> lookupKey.invoke(dataSource))
                .isInstanceOf(InvocationTargetException.class)
                .hasCauseInstanceOf(IllegalStateException.class);
    }

    private static Method lookupKeyMethod() {
        try {
            Method method = ShardRoutingDataSource.class.getDeclaredMethod("determineCurrentLookupKey");
            method.setAccessible(true);
            return method;
        } catch (ReflectiveOperationException ex) {
            throw new AssertionError(ex);
        }
    }
}
