package com.orithos.config;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CompetitorPriceSchemaMigratorTest {
    @Test
    void migratesEveryBusinessShardWithoutTenantRoutingContext() {
        var firstShard = new HikariDataSource();
        var secondShard = new HikariDataSource();
        var routed = new ShardRoutingDataSource(Map.of("skr", firstShard, "demo", secondShard));
        try {
            Set<? extends DataSource> targets = Set.copyOf(CompetitorPriceSchemaMigrator.migrationTargets(routed));
            assertEquals(Set.of(firstShard, secondShard), targets);
        } finally {
            routed.close();
        }
    }

    @Test
    void migratesTheConfiguredDataSourceWhenShardingIsDisabled() {
        DataSource direct = new HikariDataSource();
        assertSame(direct, CompetitorPriceSchemaMigrator.migrationTargets(direct).iterator().next());
        ((HikariDataSource) direct).close();
    }

    @Test
    void serializesAndAtomicallyAppliesSchemaMigration() throws Exception {
        String sql;
        try (var input = new ClassPathResource("db/migration_competitor_price_observations.sql").getInputStream()) {
            sql = StreamUtils.copyToString(input, StandardCharsets.UTF_8).trim().toLowerCase();
        }
        assertTrue(sql.startsWith("begin;"));
        assertTrue(sql.contains("pg_advisory_xact_lock(731245, 21802)"));
        assertTrue(sql.endsWith("commit;"));
    }
}
