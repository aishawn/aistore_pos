package com.orithos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;

/** Tracks whether a product was observed in the current Shopfront catalogue. */
@Component
@Order(28)
public class ShopfrontProductCatalogConfirmationSchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(ShopfrontProductCatalogConfirmationSchemaMigrator.class);
    private final DataSource dataSource;

    public ShopfrontProductCatalogConfirmationSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try (Connection connection = dataSource.getConnection()) {
            DatabaseMetaData metadata = connection.getMetaData();
            try (var statement = connection.createStatement()) {
                if (!columnExists(metadata, connection.getCatalog())) {
                    statement.execute("ALTER TABLE product ADD COLUMN shopfront_catalog_confirmed BOOLEAN NULL");
                }
                if (tableExists(metadata, connection.getCatalog(), "shopfront_product_mapping")) {
                    statement.execute("UPDATE product p SET shopfront_catalog_confirmed=FALSE WHERE p.shopfront_catalog_confirmed IS NULL AND EXISTS "
                            + "(SELECT 1 FROM shopfront_product_mapping m WHERE m.pos_product_id=p.id AND m.status='MAPPED')");
                }
            }
            log.info("Ensured product.shopfront_catalog_confirmed and unconfirmed legacy Shopfront mappings");
        } catch (Exception e) {
            log.error("Could not ensure product.shopfront_catalog_confirmed exists", e);
            throw new IllegalStateException("Shopfront product catalog confirmation schema is unavailable", e);
        }
    }

    private boolean columnExists(DatabaseMetaData metadata, String catalog) throws Exception {
        for (String table : new String[]{"product", "PRODUCT"}) {
            try (ResultSet columns = metadata.getColumns(catalog, null, table, null)) {
                while (columns.next()) {
                    if ("product".equalsIgnoreCase(columns.getString("TABLE_NAME"))
                            && "shopfront_catalog_confirmed".equalsIgnoreCase(columns.getString("COLUMN_NAME"))) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private boolean tableExists(DatabaseMetaData metadata, String catalog, String table) throws Exception {
        for (String name : new String[]{table, table.toUpperCase()}) {
            try (ResultSet tables = metadata.getTables(catalog, null, name, new String[]{"TABLE"})) {
                while (tables.next()) {
                    if (table.equalsIgnoreCase(tables.getString("TABLE_NAME"))) return true;
                }
            }
        }
        return false;
    }
}
