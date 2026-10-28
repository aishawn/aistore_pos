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

/** Expands product image storage so source image URLs are not truncated. */
@Component
@Order(26)
public class ProductImageSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ProductImageSchemaMigrator.class);
    private final DataSource dataSource;

    public ProductImageSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (!needsWidening()) return;
            log.info("Applying product image storage migration...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setContinueOnError(false);
            populator.addScript(new ClassPathResource("db/migration_shopfront_product_image_text.sql"));
            populator.execute(dataSource);
            log.info("Product image storage migration applied.");
        } catch (Exception e) {
            log.warn("Skipped product image storage migration: {}", e.getMessage());
        }
    }

    private boolean needsWidening() throws Exception {
        try (Connection connection = dataSource.getConnection();
             ResultSet columns = connection.getMetaData().getColumns(connection.getCatalog(), null, "product", "image")) {
            if (!columns.next()) return false;
            String type = columns.getString("TYPE_NAME");
            return type != null && (type.equalsIgnoreCase("varchar") || type.equalsIgnoreCase("character varying"));
        }
    }
}
