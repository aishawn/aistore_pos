package com.orithos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

@Component
@Order(36)
public class ShopfrontMatchStatusIndexMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(ShopfrontMatchStatusIndexMigrator.class);
    private static final String INDEX_SQL = "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            + "idx_shopfront_sale_item_store_product_sale "
            + "ON shopfront_sale_item (store_key, source_product_id, external_sale_id)";

    private final DataSource dataSource;

    public ShopfrontMatchStatusIndexMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try (Connection connection = dataSource.getConnection()) {
            String database = connection.getMetaData().getDatabaseProductName();
            if (database == null || !database.toLowerCase().contains("postgres") || !tableExists(connection)) {
                return;
            }
            if (!connection.getAutoCommit()) connection.setAutoCommit(true);
            try (Statement statement = connection.createStatement()) {
                statement.execute(INDEX_SQL);
            }
            log.info("Shopfront match-status supporting index is ready.");
        } catch (Exception error) {
            log.error("Shopfront match-status index migration failed", error);
            throw new IllegalStateException("Shopfront match-status index migration failed", error);
        }
    }

    private static boolean tableExists(Connection connection) throws Exception {
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT to_regclass('shopfront_sale_item') IS NOT NULL")) {
            return result.next() && result.getBoolean(1);
        }
    }
}
