package com.orithos.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

@Component
public class ShopfrontStoreMappingSchemaMigrator implements ApplicationRunner {
    private final DataSource dataSource;
    private final boolean enabled;

    public ShopfrontStoreMappingSchemaMigrator(
            DataSource dataSource,
            @Value("${app.shopfront.integration-enabled:false}") boolean enabled) {
        this.dataSource = dataSource;
        this.enabled = enabled;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) {
            return;
        }
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
        populator.setSeparator(ScriptUtils.EOF_STATEMENT_SEPARATOR);
        populator.addScript(new ClassPathResource("db/migration_shopfront_store_mapping_boolean_postgres.sql"));
        populator.execute(dataSource);
    }
}
