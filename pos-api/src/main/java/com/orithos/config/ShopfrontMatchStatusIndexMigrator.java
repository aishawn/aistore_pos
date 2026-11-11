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
    private static final String MATCH_STATUS_INDEX_SQL = "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            + "idx_shopfront_sale_item_store_product_sale "
            + "ON shopfront_sale_item (store_key, source_product_id, external_sale_id)";
    private static final String SALES_BUSINESS_DATE_INDEX_SQL = "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
            + "idx_shopfront_sale_store_biz_ext "
            + "ON shopfront_sale (store_key, business_date, external_id)";

    private final DataSource dataSource;

    public ShopfrontMatchStatusIndexMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try (Connection connection = dataSource.getConnection()) {
            String database = connection.getMetaData().getDatabaseProductName();
            if (database == null || !database.toLowerCase().contains("postgres")) {
                return;
            }
            if (!connection.getAutoCommit()) connection.setAutoCommit(true);
            try (Statement statement = connection.createStatement()) {
                if (tableExists(connection, "shopfront_sale")) {
                    if (ensureBusinessDateColumn(connection)) {
                        createIndex(statement, SALES_BUSINESS_DATE_INDEX_SQL, "Shopfront sales business-date");
                    }
                }
                if (tableExists(connection, "shopfront_sale_item")) {
                    createIndex(statement, MATCH_STATUS_INDEX_SQL, "Shopfront match-status");
                }
            }
        } catch (Exception error) {
            // CONCURRENTLY builds on large sale_item tables can take longer than a
            // deploy health window; never take the API down for an optional index.
            log.warn("Shopfront match-status index migration deferred: {}", error.toString());
        }
    }

    private static boolean tableExists(Connection connection, String table) throws Exception {
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("SELECT to_regclass('" + table + "') IS NOT NULL")) {
            return result.next() && result.getBoolean(1);
        }
    }

    private static boolean ensureBusinessDateColumn(Connection connection) throws Exception {
        if (columnExists(connection, "shopfront_sale", "business_date")) {
            return true;
        }

        try (Statement statement = connection.createStatement()) {
            statement.execute("SET lock_timeout = '2s'");
            try {
                statement.execute("ALTER TABLE shopfront_sale ADD COLUMN business_date DATE");
            } finally {
                statement.execute("RESET lock_timeout");
            }
        } catch (Exception error) {
            log.warn("Shopfront sales business-date column migration deferred: {}", error.toString());
        }
        return columnExists(connection, "shopfront_sale", "business_date");
    }

    private static boolean columnExists(Connection connection, String table, String column) throws Exception {
        String sql = "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
                + "WHERE table_schema = current_schema() AND table_name = '" + table
                + "' AND column_name = '" + column + "')";
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(sql)) {
            return result.next() && result.getBoolean(1);
        }
    }

    private static void createIndex(Statement statement, String sql, String label) {
        try {
            statement.execute(sql);
            log.info("{} supporting index is ready.", label);
        } catch (Exception error) {
            log.warn("{} index build deferred: {}", label, error.toString());
        }
    }
}
