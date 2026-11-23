package com.orithos.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/** Idempotent data fixes for vendor company settings. */
@Component
@Order(34)
public class CompanySettingsDataMigrator implements CommandLineRunner {
    private final DataSource dataSource;

    public CompanySettingsDataMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        var populator = new ResourceDatabasePopulator(
                new ClassPathResource("db/migration_cash_out_without_sale_default_true.sql"));
        populator.setContinueOnError(true);
        DatabasePopulatorUtils.execute(populator, dataSource);
    }
}