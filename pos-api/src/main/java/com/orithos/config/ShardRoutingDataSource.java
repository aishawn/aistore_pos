package com.orithos.config;

import com.orithos.tenant.TenantHolder;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.jdbc.datasource.lookup.AbstractRoutingDataSource;

import java.util.Map;

/** Routes MyBatis and JdbcTemplate connections using the resolved request tenant. */
public final class ShardRoutingDataSource extends AbstractRoutingDataSource implements AutoCloseable {

    private final Map<String, HikariDataSource> shardPools;

    public ShardRoutingDataSource(Map<String, HikariDataSource> shardPools) {
        this.shardPools = Map.copyOf(shardPools);
    }

    @Override
    protected Object determineCurrentLookupKey() {
        TenantHolder.ResolvedTenant tenant = TenantHolder.get();
        if (tenant == null) {
            throw new IllegalStateException("Database access requires an explicit tenant or control-plane context");
        }
        if (tenant.controlPlane()) {
            return ShardRoutingConfiguration.CONTROL_ROUTE;
        }
        if (tenant.shardKey() == null || tenant.shardKey().isBlank()) {
            throw new IllegalStateException("Tenant has no assigned database shard");
        }
        return tenant.shardKey();
    }

    @Override
    public void close() {
        shardPools.values().forEach(HikariDataSource::close);
    }
}
