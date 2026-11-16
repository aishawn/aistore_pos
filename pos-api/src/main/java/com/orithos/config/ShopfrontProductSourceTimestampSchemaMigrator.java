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

/** Stores Shopfront's source update timestamp separately from the POS row timestamp. */
@Component
@Order(27)
public class ShopfrontProductSourceTimestampSchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(ShopfrontProductSourceTimestampSchemaMigrator.class);
    private final DataSource dataSource;

    public ShopfrontProductSourceTimestampSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try (Connection connection = dataSource.getConnection()) {
            if (columnExists(connection.getMetaData(), connection.getCatalog())) return;
            try (var statement = connection.createStatement()) {
                statement.execute("ALTER TABLE product ADD COLUMN shopfront_source_updated_at VARCHAR(80) NULL");
            } catch (Exception migrationFailure) {
                if (columnExists(connection.getMetaData(), connection.getCatalog())) return;
                throw migrationFailure;
            }
            log.info("Added product.shopfront_source_updated_at");
        } catch (Exception e) {
            log.error("Could not ensure product.shopfront_source_updated_at exists", e);
            throw new IllegalStateException("Shopfront source timestamp schema is unavailable", e);
        }
    }

    private boolean columnExists(DatabaseMetaData metadata, String catalog) throws Exception {
        for (String table : new String[]{"product", "PRODUCT"}) {
            try (ResultSet columns = metadata.getColumns(catalog, null, table, null)) {
                while (columns.next()) {
                    if ("product".equalsIgnoreCase(columns.getString("TABLE_NAME"))
                            && "shopfront_source_updated_at".equalsIgnoreCase(columns.getString("COLUMN_NAME"))) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
