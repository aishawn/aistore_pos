package com.orithos.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

@Component
@Order(32)
public class PurchaseOrderSourcePrecisionSchemaMigrator implements CommandLineRunner {
    private final DataSource dataSource;

    public PurchaseOrderSourcePrecisionSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        var populator = new ResourceDatabasePopulator(
                new ClassPathResource("db/migration_purchase_order_source_precision.sql"));
        populator.setContinueOnError(false);
        DatabasePopulatorUtils.execute(populator, dataSource);
    }
}
