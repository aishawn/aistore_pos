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
@Order(Ordered.HIGHEST_PRECEDENCE + 22)
public class AiGatewaySchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(AiGatewaySchemaMigrator.class);
    private final DataSource dataSource;

    public AiGatewaySchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.addScript(new ClassPathResource("db/migration_ai_gateway.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("AI gateway usage schema applied.");
        } catch (Exception e) {
            log.error("AI gateway usage schema migration failed: {}", e.getClass().getSimpleName());
            throw new IllegalStateException("AI gateway usage schema migration failed", e);
        }
    }
}
