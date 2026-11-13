package com.orithos.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

@Component
@Order(36)
public class ProductInventoryFreshnessSchemaMigrator implements CommandLineRunner {
    private final DataSource dataSource;

    public ProductInventoryFreshnessSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
        populator.setContinueOnError(false);
        populator.setSeparator(ScriptUtils.EOF_STATEMENT_SEPARATOR);
        populator.addScript(new ClassPathResource("db/migration_product_inventory_freshness.sql"));
        DatabasePopulatorUtils.execute(populator, dataSource);
    }
}
