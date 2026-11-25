package com.orithos.config;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;
import org.springframework.boot.CommandLineRunner;

import javax.sql.DataSource;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 27)
public class InventoryDailySnapshotSchemaMigrator implements CommandLineRunner {
    private final DataSource dataSource;

    public InventoryDailySnapshotSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        var populator = new ResourceDatabasePopulator(
                new ClassPathResource("db/migration_inventory_daily_snapshot.sql"));
        populator.setContinueOnError(false);
        DatabasePopulatorUtils.execute(populator, dataSource);
    }
}
