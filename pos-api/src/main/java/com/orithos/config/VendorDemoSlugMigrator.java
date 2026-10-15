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
 * Renames the legacy pilot vendor slug {@code default} → {@code demo}
 * so the store host is {@code demo.orithos.com.au}. Runs after the
 * subdomain schema migration.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
public class VendorDemoSlugMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(VendorDemoSlugMigrator.class);

    private final DataSource dataSource;

    public VendorDemoSlugMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (!columnExists("vendor", "subdomain")) {
                return;
            }
            if (!hasSubdomain("default")) {
                return;
            }
            if (hasSubdomain("demo")) {
                log.info("Vendor slug 'demo' already present; leaving 'default' unchanged.");
                return;
            }
            log.info("Renaming vendor subdomain default → demo...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setSeparator(";");
            populator.addScript(new ClassPathResource("db/migration_vendor_demo_slug.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("Vendor subdomain renamed to demo.");
        } catch (Exception e) {
            log.warn("Skipped vendor demo slug migration: {}", e.getMessage());
        }
    }

    private boolean columnExists(String table, String column) throws Exception {
        String sql = """
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
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

    private boolean hasSubdomain(String subdomain) throws Exception {
        String sql = "SELECT COUNT(*) FROM vendor WHERE subdomain = ?";
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, subdomain);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }
}
