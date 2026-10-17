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

/** Ensures the DB-backed AI intent configuration exists before it is seeded. */
@Component
@Order(25)
public class AiIntentSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AiIntentSchemaMigrator.class);
    private static final String[] TABLES = {"ai_intent", "ai_slot", "ai_slot_value", "ai_prompt"};

    private final DataSource dataSource;

    public AiIntentSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            boolean complete = true;
            for (String table : TABLES) {
                if (!tableExists(table)) {
                    complete = false;
                    break;
                }
            }
            if (complete) {
                return;
            }

            log.info("Applying AI intent configuration schema migration...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setContinueOnError(false);
            populator.addScript(new ClassPathResource("db/migration_ai_intent.sql"));
            populator.execute(dataSource);
            log.info("AI intent configuration schema migration applied.");
        } catch (Exception e) {
            // Keep startup available for stores that intentionally run with AI disabled;
            // the config initializer will report the same migration requirement if needed.
            log.warn("Skipped AI intent configuration schema migration: {}", e.getMessage());
        }
    }

    private boolean tableExists(String table) throws Exception {
        try (Connection connection = dataSource.getConnection();
             ResultSet result = connection.getMetaData().getTables(connection.getCatalog(), null, table, new String[]{"TABLE"})) {
            return result.next();
        }
    }
}
