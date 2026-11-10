package com.orithos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;

/**
 * Adds sale.source_system / sale.external_id so Shopfront imports can upsert
 * the native ledger without relying on invoice_id alone.
 */
@Component
@Order(34)
public class SaleExternalIdentitySchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SaleExternalIdentitySchemaMigrator.class);
    private final DataSource dataSource;

    public SaleExternalIdentitySchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (!needsMigration()) {
                return;
            }
            log.info("Applying sale external identity migration...");
            var populator = new ResourceDatabasePopulator(
                    new ClassPathResource("db/migration_sale_external_identity.sql"));
            populator.setContinueOnError(false);
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("Sale external identity migration applied.");
        } catch (Exception e) {
            // This column pair is the idempotency boundary for imported sales.
            // Starting without it would silently turn retries into duplicate
            // ledger rows, so fail startup and let deployment health checks stop.
            log.error("Sale external identity migration failed", e);
            throw new IllegalStateException("Sale external identity migration failed", e);
        }
    }

    private boolean needsMigration() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            String product = connection.getMetaData().getDatabaseProductName();
            if (product == null || !product.toLowerCase().contains("postgres")) {
                return false;
            }
            return !columnExists(connection, "sale", "source_system")
                    || !columnExists(connection, "sale", "external_id")
                    || !columnExists(connection, "sale", "source_store_key")
                    || !columnExists(connection, "sale_item", "external_line_id")
                    || !columnExists(connection, "sale_payment", "external_payment_id");
        }
    }

    private static boolean columnExists(Connection connection, String table, String column) throws Exception {
        try (ResultSet rs = connection.getMetaData().getColumns(connection.getCatalog(), null, table, column)) {
            if (rs.next()) {
                return true;
            }
        }
        try (ResultSet rs = connection.getMetaData().getColumns(connection.getCatalog(), null, table.toLowerCase(), column.toLowerCase())) {
            return rs.next();
        }
    }
}
