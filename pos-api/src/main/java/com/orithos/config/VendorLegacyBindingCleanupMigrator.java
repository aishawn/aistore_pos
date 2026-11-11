package com.orithos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

/** Drops retired ERP binding columns from existing tenant records. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class VendorLegacyBindingCleanupMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(VendorLegacyBindingCleanupMigrator.class);

    private final DataSource dataSource;

    public VendorLegacyBindingCleanupMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setSeparator(";");
            populator.addScript(new ClassPathResource("db/migration_retired_erp_bindings.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("Retired ERP binding columns removed.");
        } catch (Exception e) {
            log.warn("Skipped retired ERP binding cleanup: {}", e.getMessage());
        }
    }
}
