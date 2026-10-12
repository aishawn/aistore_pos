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

@Component
@Order(26)
public class AiSommelierSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AiSommelierSchemaMigrator.class);

    private final DataSource dataSource;

    public AiSommelierSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (tableExists("product_wine_profile") && tableExists("ai_sommelier_feedback")) {
                return;
            }
            log.info("Applying AI Sommelier schema migration...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setContinueOnError(true);
            populator.addScript(new ClassPathResource("db/migration_ai_sommelier.sql"));
            populator.execute(dataSource);
            log.info("AI Sommelier schema migration applied.");
        } catch (Exception e) {
            log.warn("Skipped AI Sommelier schema migration: {}", e.getMessage());
        }
    }

    private boolean tableExists(String table) throws Exception {
        try (Connection conn = dataSource.getConnection();
             ResultSet rs = conn.getMetaData().getTables(conn.getCatalog(), null, table, new String[]{"TABLE"})) {
            return rs.next();
        }
    }
}
