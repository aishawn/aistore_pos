package com.orithos.tenant;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TenantShardExecutorTest {

    @AfterEach
    void clearTenant() {
        TenantHolder.clear();
    }

    @Test
    void restoresPriorContextAfterWorkCompletes() {
        TenantHolder.ResolvedTenant prior = TenantHolder.ResolvedTenant.controlPlaneTenant();
        TenantHolder.set(prior);
        TenantShardRegistry registry = mock(TenantShardRegistry.class);
        when(registry.findShardKey(12L)).thenReturn(Optional.of("shard_01"));
        TenantShardExecutor executor = new TenantShardExecutor(registry);

        String shard = executor.withVendor(12L, () -> TenantHolder.get().shardKey());

        assertThat(shard).isEqualTo("shard_01");
        assertThat(TenantHolder.get()).isSameAs(prior);
    }

    @Test
    void restoresContextWhenBackgroundWorkFails() {
        TenantShardRegistry registry = mock(TenantShardRegistry.class);
        when(registry.findShardKey(12L)).thenReturn(Optional.of("shard_01"));
        TenantShardExecutor executor = new TenantShardExecutor(registry);

        assertThatThrownBy(() -> executor.withVendor(12L, () -> {
            assertThat(TenantHolder.get().vendorId()).isEqualTo(12L);
            throw new IllegalArgumentException("failure");
        })).isInstanceOf(IllegalArgumentException.class);

        assertThat(TenantHolder.get()).isNull();
    }
}
