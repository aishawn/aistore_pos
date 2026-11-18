package com.orithos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;

/**
 * Scopes product active-name and barcode uniqueness to outlet_id so Demo and
 * SKR can hold the same Shopfront catalogue without moving rows between outlets.
 */
@Component
@Order(33)
public class ProductOutletUniquenessSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ProductOutletUniquenessSchemaMigrator.class);
    private final DataSource dataSource;

    public ProductOutletUniquenessSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (!needsMigration()) return;
            log.info("Applying product outlet uniqueness migration...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setContinueOnError(false);
            populator.addScript(new ClassPathResource("db/migration_product_outlet_uniqueness_postgres.sql"));
            populator.execute(dataSource);
            log.info("Product outlet uniqueness migration applied.");
        } catch (Exception e) {
            log.warn("Skipped product outlet uniqueness migration: {}", e.getMessage());
        }
    }

    private boolean needsMigration() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            String product = connection.getMetaData().getDatabaseProductName();
            if (product == null || !product.toLowerCase().contains("postgresql")) {
                return false;
            }
            boolean hasLegacyName = indexOrConstraintExists(connection, "uq_product_active_name");
            boolean hasLegacyBarcode = indexOrConstraintExists(connection, "uq_barcode_code");
            boolean hasOutletName = hasShopfrontAwareNameIndex(connection);
            boolean hasOutletBarcode = indexOrConstraintExists(connection, "uq_barcode_outlet_code");
            return !columnExists(connection, "product", "shopfront_managed")
                    || hasLegacyName || hasLegacyBarcode || !hasOutletName || !hasOutletBarcode;
        }
    }

    private boolean columnExists(Connection connection, String table, String column) throws Exception {
        try (var ps = connection.prepareStatement(
                "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=? AND column_name=?")) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    private boolean hasShopfrontAwareNameIndex(Connection connection) throws Exception {
        try (var ps = connection.prepareStatement(
                "SELECT pg_get_indexdef(c.oid) FROM pg_class c WHERE c.relname='uq_product_outlet_active_name'")) {
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getString(1) != null
                        && rs.getString(1).contains("shopfront_managed IS NOT TRUE");
            }
        }
    }

    private boolean indexOrConstraintExists(Connection connection, String name) throws Exception {
        try (var ps = connection.prepareStatement(
                "SELECT 1 FROM pg_constraint WHERE conname = ? UNION ALL SELECT 1 FROM pg_class WHERE relname = ? LIMIT 1")) {
            ps.setString(1, name);
            ps.setString(2, name);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }
}
