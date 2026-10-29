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

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 23)
public class AiCommandSchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(AiCommandSchemaMigrator.class);
    private final DataSource dataSource;

    public AiCommandSchemaMigrator(DataSource dataSource) { this.dataSource = dataSource; }

    @Override
    public void run(String... args) {
        try {
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setSeparator(";");
            // Command tables are required by the command API. Do not let a partial
            // migration leave the application running and turn every request into
            // an opaque database 500.
            populator.setContinueOnError(false);
            populator.addScript(new ClassPathResource("db/migration_ai_commands.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("AI command schema applied.");
        } catch (Exception e) {
            log.error("AI command schema migration failed: {}", e.getMessage(), e);
            throw new IllegalStateException("AI command schema migration failed", e);
        }
    }
}
