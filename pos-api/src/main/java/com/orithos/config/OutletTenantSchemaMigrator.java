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

/**
 * Applies {@code db/migration_outlet_id_tenant.sql} on existing databases that
 * were created before outlet_id became the SaaS tenant column. Runs before
 * {@link DataInitializer} so admin seeding can write outlet_id.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class OutletTenantSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(OutletTenantSchemaMigrator.class);

    private final DataSource dataSource;

    public OutletTenantSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (columnExists("app_user", "outlet_id") && columnExists("sale", "outlet_id")) {
                return;
            }
            log.info("Applying outlet_id tenant migration...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setSeparator(";");
            populator.addScript(new ClassPathResource("db/migration_outlet_id_tenant.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("outlet_id tenant migration applied.");
        } catch (Exception e) {
            log.warn("Skipped outlet_id tenant migration: {}", e.getMessage());
        }
    }

    private boolean columnExists(String table, String column) throws Exception {
        String sql = """
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = current_schema() AND TABLE_NAME = ? AND COLUMN_NAME = ?
                """;
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }
}
