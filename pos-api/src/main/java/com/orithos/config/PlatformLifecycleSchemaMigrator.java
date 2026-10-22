package com.orithos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

/** Applies platform tenant lifecycle tables to existing installations. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class PlatformLifecycleSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(PlatformLifecycleSchemaMigrator.class);
    private final DataSource dataSource;

    public PlatformLifecycleSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (!tableExists("platform_admin_audit")) {
                apply("db/migration_platform_admin_audit.sql");
            }
            if (!tableExists("platform_alert")) {
                apply("db/migration_platform_alerts.sql");
            }
            if (!tableExists("platform_failure_event")) {
                apply("db/migration_platform_failure_events.sql");
            }
            if (!tableExists("tenant_provision_attempt") || !tableExists("tenant_provision_attempt_step")) {
                apply("db/migration_tenant_provision_attempts.sql");
            }
        } catch (Exception error) {
            // Startup remains available; the next restart retries the idempotent migrations.
            log.warn("Skipped platform lifecycle schema migration: {}", error.getMessage());
        }
    }

    private void apply(String script) {
        log.info("Applying {}...", script);
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
        populator.setSeparator(";");
        populator.addScript(new ClassPathResource(script));
        DatabasePopulatorUtils.execute(populator, dataSource);
        log.info("Applied {}.", script);
    }

    private boolean tableExists(String table) throws Exception {
        String sql = """
                SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                """;
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, table);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() && result.getInt(1) > 0;
            }
        }
    }
}
