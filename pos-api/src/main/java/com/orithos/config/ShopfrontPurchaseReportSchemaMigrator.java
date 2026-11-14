package com.orithos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

@Component
@Order(31)
public class ShopfrontPurchaseReportSchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(ShopfrontPurchaseReportSchemaMigrator.class);
    private final DataSource dataSource;

    public ShopfrontPurchaseReportSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
        populator.setContinueOnError(false);
        populator.addScript(new ClassPathResource("db/migration_shopfront_purchase_report_snapshot.sql"));
        try {
            populator.execute(dataSource);
            log.info("Shopfront purchase report snapshot schema is ready.");
        } catch (Exception e) {
            log.error("Unable to initialize Shopfront purchase report snapshot schema", e);
            throw new IllegalStateException("Purchase report snapshot schema initialization failed", e);
        }
    }
}
