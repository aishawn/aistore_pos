package com.orithos.config;

import com.orithos.modules.ai.report.AiReportTenantProvisioner;
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
import java.sql.Statement;

/**
 * Shared {@code ai_rpt_*} views, audit table, and per-outlet RO schemas.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class AiReportSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AiReportSchemaMigrator.class);

    private final DataSource dataSource;
    private final AiReportTenantProvisioner provisioner;

    public AiReportSchemaMigrator(DataSource dataSource, AiReportTenantProvisioner provisioner) {
        this.dataSource = dataSource;
        this.provisioner = provisioner;
    }

    @Override
    public void run(String... args) {
        try {
            log.info("Refreshing AI report views...");
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setSeparator(";");
            populator.setContinueOnError(true);
            populator.addScript(new ClassPathResource("db/migration_ai_report_views.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            log.info("AI report views applied.");
            seedPermissions();
            ensureAuditTable();
            ensureSnapshotTable();
            provisionTenantSchemas();
        } catch (Exception e) {
            log.warn("Skipped AI report schema migration: {}", e.getMessage());
        }
    }

    private void seedPermissions() throws Exception {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.executeUpdate("""
                    INSERT IGNORE INTO permission (id, name, safe_name, section)
                    VALUES (9101, 'AI Report Query', 'ai.report.query', 'AI'),
                           (9102, 'AI Report Cost', 'ai.report.cost', 'AI')
                    """);
            st.executeUpdate("""
                    INSERT IGNORE INTO role_permission (role_id, permission_id)
                    SELECT r.id, 9101 FROM role r
                    """);
        }
    }

    private void provisionTenantSchemas() {
        for (Long outletId : provisioner.listOutletIds()) {
            try {
                provisioner.ensureOutlet(outletId);
            } catch (Exception e) {
                log.warn("Could not provision AI report schema for outlet {}: {}", outletId, e.getMessage());
            }
        }
    }

    private void ensureAuditTable() throws Exception {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("""
                    CREATE TABLE IF NOT EXISTS ai_report_audit (
                      id BIGINT PRIMARY KEY AUTO_INCREMENT,
                      vendor_id BIGINT NOT NULL,
                      user_id BIGINT NOT NULL,
                      outlet_id BIGINT NULL,
                      outlet_ids VARCHAR(255) NULL,
                      question TEXT NULL,
                      sql_text TEXT NULL,
                      path VARCHAR(32) NULL,
                      allowed TINYINT(1) NOT NULL DEFAULT 0,
                      reject_reason VARCHAR(512) NULL,
                      row_count INT NULL,
                      latency_ms INT NULL,
                      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      KEY idx_ai_report_audit_created (created_at),
                      KEY idx_ai_report_audit_outlet (outlet_id, created_at),
                      KEY idx_ai_report_audit_vendor (vendor_id, created_at)
                    )
                    """);
            log.info("Ensured ai_report_audit table");
        }
    }

    private void ensureSnapshotTable() throws Exception {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute("""
                    CREATE TABLE IF NOT EXISTS ai_report_snapshot (
                      id BIGINT PRIMARY KEY AUTO_INCREMENT,
                      vendor_id BIGINT NOT NULL,
                      user_id BIGINT NOT NULL,
                      outlet_id BIGINT NULL,
                      intent VARCHAR(64) NULL,
                      question TEXT NULL,
                      title VARCHAR(512) NULL,
                      result_json MEDIUMTEXT NOT NULL,
                      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                      KEY idx_ai_report_snapshot_user (vendor_id, user_id, created_at)
                    )
                    """);
            log.info("Ensured ai_report_snapshot table");
        }
    }
}
