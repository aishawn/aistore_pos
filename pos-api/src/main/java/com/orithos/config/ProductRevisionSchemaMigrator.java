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
 * Ensures {@code product_revision} exists on databases created before this feature.
 */
@Component
@Order(25)
public class ProductRevisionSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ProductRevisionSchemaMigrator.class);

    private final DataSource dataSource;

    public ProductRevisionSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (tableExists("product_revision")) {
                return;
            }
            log.info("Applying product_revision migration...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setContinueOnError(false);
            populator.addScript(new ClassPathResource("db/migration_product_revision.sql"));
            populator.execute(dataSource);
            log.info("product_revision migration applied.");
        } catch (Exception e) {
            log.warn("Skipped product_revision migration: {}", e.getMessage());
        }
    }

    private boolean tableExists(String table) throws Exception {
        try (Connection conn = dataSource.getConnection();
             ResultSet rs = conn.getMetaData().getTables(conn.getCatalog(), null, table, new String[]{"TABLE"})) {
            return rs.next();
        }
    }
}
