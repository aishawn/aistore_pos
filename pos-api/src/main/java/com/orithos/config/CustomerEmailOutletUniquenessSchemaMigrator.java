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
@Order(34)
public class CustomerEmailOutletUniquenessSchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(CustomerEmailOutletUniquenessSchemaMigrator.class);
    private final DataSource dataSource;

    public CustomerEmailOutletUniquenessSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            if (!needsMigration()) return;
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator(
                    new ClassPathResource("db/migration_customer_email_outlet_uniqueness_postgres.sql"));
            populator.setContinueOnError(false);
            populator.execute(dataSource);
            log.info("Applied customer email outlet uniqueness migration.");
        } catch (Exception e) {
            log.error("Customer email outlet uniqueness migration failed: {}", e.getMessage(), e);
            throw new IllegalStateException("Unable to apply customer email outlet uniqueness migration", e);
        }
    }

    private boolean needsMigration() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            String product = connection.getMetaData().getDatabaseProductName();
            if (product == null || !product.toLowerCase().contains("postgresql")) return false;
            return indexExists(connection, "uq_customer_email_active")
                    || !indexExists(connection, "uq_customer_email_outlet_active");
        }
    }

    private boolean indexExists(Connection connection, String name) throws Exception {
        try (var ps = connection.prepareStatement(
                "SELECT 1 FROM pg_constraint WHERE conname = ? UNION ALL SELECT 1 FROM pg_class WHERE relname = ? LIMIT 1")) {
            ps.setString(1, name);
            ps.setString(2, name);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }
}
