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
 * Applies {@code db/migration_vendor_subdomain.sql} so existing databases gain
 * vendor.subdomain and vendor-scoped users/outlets.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class VendorSubdomainSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(VendorSubdomainSchemaMigrator.class);

    private final DataSource dataSource;

    public VendorSubdomainSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (columnExists("vendor", "subdomain")
                    && columnExists("outlet", "vendor_id")
                    && columnExists("app_user", "vendor_id")
                    && indexExists("app_user", "uq_user_vendor_username")) {
                return;
            }
            log.info("Applying vendor subdomain migration...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setSeparator(";");
            populator.addScript(new ClassPathResource(isPostgres()
                    ? "db/migration_vendor_subdomain_postgres.sql"
                    : "db/migration_vendor_subdomain.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("Vendor subdomain migration applied.");
        } catch (Exception e) {
            log.warn("Skipped vendor subdomain migration: {}", e.getMessage());
        }
    }

    private boolean isPostgres() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            return c.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres");
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

    private boolean indexExists(String table, String index) throws Exception {
        try (Connection c = dataSource.getConnection();
             ResultSet indexes = c.getMetaData().getIndexInfo(c.getCatalog(), c.getSchema(), table, false, false)) {
            while (indexes.next()) {
                if (index.equalsIgnoreCase(indexes.getString("INDEX_NAME"))) {
                    return true;
                }
            }
            return false;
        }
    }
}
