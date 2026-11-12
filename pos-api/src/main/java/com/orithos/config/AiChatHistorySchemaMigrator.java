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
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 21)
public class AiChatHistorySchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AiChatHistorySchemaMigrator.class);

    private final DataSource dataSource;

    public AiChatHistorySchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setSeparator(";");
            populator.setContinueOnError(true);
            populator.addScript(new ClassPathResource("db/migration_ai_chat_history.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            ensureReportIdColumn();
            ensureSlotsJsonColumn();
            ensureProvenanceColumns();
            log.info("AI chat history tables applied.");
        } catch (Exception e) {
            log.warn("Skipped AI chat history schema migration: {}", e.getMessage());
        }
    }

    private void ensureReportIdColumn() throws SQLException {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS report_id BIGINT NULL");
        }
    }

    private void ensureSlotsJsonColumn() throws SQLException {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS slots_json TEXT NULL");
        }
    }

    private void ensureProvenanceColumns() throws SQLException {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS source VARCHAR(40) NULL");
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS data_as_of VARCHAR(80) NULL");
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS data_source VARCHAR(160) NULL");
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS store_scope VARCHAR(255) NULL");
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS report_period_from VARCHAR(40) NULL");
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS report_period_to VARCHAR(40) NULL");
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS report_time_zone VARCHAR(80) NULL");
            statement.executeUpdate("ALTER TABLE ai_chat_message ADD COLUMN IF NOT EXISTS report_data_status VARCHAR(40) NULL");
        }
    }
}
