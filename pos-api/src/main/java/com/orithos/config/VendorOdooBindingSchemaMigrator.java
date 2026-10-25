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
 * Applies {@code db/migration_vendor_odoo_binding.sql} for multi-store Odoo mapping.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class VendorOdooBindingSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(VendorOdooBindingSchemaMigrator.class);

    private final DataSource dataSource;

    public VendorOdooBindingSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (columnExists("vendor", "odoo_company_id")
                    && columnExists("vendor", "odoo_provision_status")
                    && columnExists("vendor", "r2_prefix")) {
                return;
            }
            log.info("Applying vendor Odoo binding migration...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setSeparator(";");
            populator.addScript(new ClassPathResource("db/migration_vendor_odoo_binding.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("Vendor Odoo binding migration applied.");
        } catch (Exception e) {
            log.warn("Skipped vendor Odoo binding migration: {}", e.getMessage());
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
