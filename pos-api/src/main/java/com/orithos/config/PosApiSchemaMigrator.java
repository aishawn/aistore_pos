package com.orithos.config;

import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;
import javax.sql.DataSource;

@Component
public class PosApiSchemaMigrator implements CommandLineRunner {
    private final DataSource dataSource;
    public PosApiSchemaMigrator(DataSource dataSource) { this.dataSource = dataSource; }
    @Override public void run(String... args) {
        var populator = new ResourceDatabasePopulator(new ClassPathResource("db/migration_pos_api.sql"));
        populator.setContinueOnError(true);
        DatabasePopulatorUtils.execute(populator, dataSource);
    }
}
