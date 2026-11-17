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

/** Stores the exact Shopfront case amount independently from POS unit cost. */
@Component
@Order(29)
public class ShopfrontProductCaseCostSchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(ShopfrontProductCaseCostSchemaMigrator.class);
    private final DataSource dataSource;

    public ShopfrontProductCaseCostSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try (Connection connection = dataSource.getConnection()) {
            if (columnExists(connection.getMetaData(), connection.getCatalog())) return;
            try (var statement = connection.createStatement()) {
                statement.execute("ALTER TABLE product ADD COLUMN case_cost DECIMAL(14,4) NULL");
            } catch (Exception migrationFailure) {
                if (columnExists(connection.getMetaData(), connection.getCatalog())) return;
                throw migrationFailure;
            }
            log.info("Added product.case_cost for exact Shopfront case amounts");
        } catch (Exception e) {
            log.error("Could not ensure product.case_cost exists", e);
            throw new IllegalStateException("Shopfront case-cost schema is unavailable", e);
        }
    }

    private boolean columnExists(DatabaseMetaData metadata, String catalog) throws Exception {
        for (String table : new String[]{"product", "PRODUCT"}) {
            try (ResultSet columns = metadata.getColumns(catalog, null, table, null)) {
                while (columns.next()) {
                    if ("product".equalsIgnoreCase(columns.getString("TABLE_NAME"))
                            && "case_cost".equalsIgnoreCase(columns.getString("COLUMN_NAME"))) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
