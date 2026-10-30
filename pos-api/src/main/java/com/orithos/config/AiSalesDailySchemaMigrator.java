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
@Order(Ordered.HIGHEST_PRECEDENCE + 25)
public class AiSalesDailySchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(AiSalesDailySchemaMigrator.class);
    private final DataSource dataSource;

    public AiSalesDailySchemaMigrator(DataSource dataSource) { this.dataSource = dataSource; }

    @Override
    public void run(String... args) {
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
        populator.setContinueOnError(false);
        populator.addScript(new ClassPathResource("db/migration_ai_sales_daily.sql"));
        DatabasePopulatorUtils.execute(populator, dataSource);
        log.info("AI daily sales and forecast schema applied.");
    }
}
