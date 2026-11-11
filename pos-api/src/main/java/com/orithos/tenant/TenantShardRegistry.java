package com.orithos.tenant;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

@Component
@ConditionalOnProperty(name = "app.sharding.enabled", havingValue = "true")
public class TenantShardRegistry {

    private final JdbcTemplate controlJdbc;

    public TenantShardRegistry(@Qualifier("controlJdbcTemplate") JdbcTemplate controlJdbc) {
        this.controlJdbc = controlJdbc;
    }

    public Optional<String> findShardKey(long vendorId) {
        List<String> keys = controlJdbc.query(
                "SELECT shard_key FROM tenant_shard_registry WHERE vendor_id = ?",
                (rs, row) -> rs.getString("shard_key"), vendorId);
        return keys.stream().findFirst();
    }

    public Optional<Route> findShopfrontRoute(String storeKey) {
        if (storeKey == null || storeKey.isBlank()) return Optional.empty();
        List<Route> routes = controlJdbc.query("""
                SELECT r.vendor_id, r.shard_key
                FROM shopfront_store_mapping m
                JOIN tenant_shard_registry r
                  ON r.vendor_id = CASE WHEN m.company_id ~ '^[0-9]+$' THEN m.company_id::bigint END
                WHERE m.store_key = ? AND m.enabled IS TRUE
                """, (rs, row) -> new Route(rs.getLong("vendor_id"), rs.getString("shard_key")), storeKey);
        return routes.stream().findFirst();
    }

    public record Route(long vendorId, String shardKey) {}
}
