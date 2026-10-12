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
 * Ensures the AI supply-chain tables exist on databases created before this feature.
 */
@Component
@Order(30)
public class SupplyChainSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SupplyChainSchemaMigrator.class);

    private final DataSource dataSource;

    public SupplyChainSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (tableExists("sc_purchase_plan") && tableExists("sc_supplier_price")) {
                return;
            }
            log.info("Applying supply chain migration...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setContinueOnError(false);
            populator.addScript(new ClassPathResource("db/migration_supply_chain.sql"));
            populator.execute(dataSource);
            log.info("Supply chain migration applied.");
        } catch (Exception e) {
            log.warn("Skipped supply chain migration: {}", e.getMessage());
        }
    }

    private boolean tableExists(String table) throws Exception {
        try (Connection conn = dataSource.getConnection();
             ResultSet rs = conn.getMetaData().getTables(conn.getCatalog(), null, table, new String[]{"TABLE"})) {
            return rs.next();
        }
    }
}
