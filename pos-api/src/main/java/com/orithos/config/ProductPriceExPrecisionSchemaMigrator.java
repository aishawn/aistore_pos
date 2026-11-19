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

/** Preserves Shopfront's six-decimal product price tiers. */
@Component
@Order(28)
public class ProductPriceExPrecisionSchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(ProductPriceExPrecisionSchemaMigrator.class);
    private final DataSource dataSource;

    public ProductPriceExPrecisionSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try (Connection connection = dataSource.getConnection()) {
            DatabaseMetaData metadata = connection.getMetaData();
            String catalog = connection.getCatalog();
            int priceScale = columnScale(metadata, catalog, "price");
            int priceExScale = columnScale(metadata, catalog, "price_ex");
            if (priceScale < 0 || priceExScale < 0) {
                throw new IllegalStateException("product_price price columns do not exist");
            }
            if (priceScale >= 6 && priceExScale >= 6) return;
            String database = metadata.getDatabaseProductName();
            String normalizedDatabase = database == null ? "" : database.toLowerCase(java.util.Locale.ROOT);
            String alter = normalizedDatabase.contains("mysql") || normalizedDatabase.contains("mariadb")
                    ? "ALTER TABLE product_price MODIFY COLUMN price DECIMAL(14,6) NOT NULL, "
                    + "MODIFY COLUMN price_ex DECIMAL(14,6) NULL"
                    : "ALTER TABLE product_price ALTER COLUMN price TYPE DECIMAL(14,6), "
                    + "ALTER COLUMN price_ex TYPE DECIMAL(14,6)";
            try (var statement = connection.createStatement()) {
                statement.execute(alter);
            }
            log.info("Ensured product_price price and price_ex use six decimal places (previous scales: {}, {})",
                    priceScale, priceExScale);
        } catch (Exception e) {
            log.error("Could not ensure product_price.price_ex precision", e);
            throw new IllegalStateException("Shopfront product price precision schema is unavailable", e);
        }
    }

    private int columnScale(DatabaseMetaData metadata, String catalog, String columnName) throws Exception {
        for (String table : new String[]{"product_price", "PRODUCT_PRICE"}) {
            try (ResultSet columns = metadata.getColumns(catalog, null, table, null)) {
                while (columns.next()) {
                    if ("product_price".equalsIgnoreCase(columns.getString("TABLE_NAME"))
                            && columnName.equalsIgnoreCase(columns.getString("COLUMN_NAME"))) {
                        return columns.getInt("DECIMAL_DIGITS");
                    }
                }
            }
        }
        return -1;
    }
}
