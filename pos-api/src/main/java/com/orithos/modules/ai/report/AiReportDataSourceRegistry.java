package com.orithos.modules.ai.report;

import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-outlet RO pools. Catalog is {@code orithos_o{outletId}}; never sets {@code @outlet_id}.
 */
@Component
public class AiReportDataSourceRegistry {

    private static final Logger log = LoggerFactory.getLogger(AiReportDataSourceRegistry.class);

    private final String primaryJdbcUrl;
    private final AiReportProperties props;
    private final AiReportTenantProvisioner provisioner;
    private final ConcurrentHashMap<Long, JdbcTemplate> templates = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<Long, HikariDataSource> pools = new ConcurrentHashMap<>();

    public AiReportDataSourceRegistry(
            @Value("${spring.datasource.url}") String primaryJdbcUrl,
            AiReportProperties props,
            AiReportTenantProvisioner provisioner) {
        this.primaryJdbcUrl = primaryJdbcUrl;
        this.props = props;
        this.provisioner = provisioner;
    }

    public JdbcTemplate jdbc(long outletId) {
        AiReportTenantSchema.requireOutletId(outletId);
        return templates.computeIfAbsent(outletId, this::createTemplate);
    }

    private JdbcTemplate createTemplate(long outletId) {
        provisioner.ensureOutlet(outletId);
        HikariDataSource ds = new HikariDataSource();
        ds.setPoolName("orithos-ai-ro-o" + outletId);
        ds.setJdbcUrl(AiReportTenantSchema.jdbcUrl(primaryJdbcUrl, outletId));
        ds.setUsername(AiReportTenantSchema.username(props.getUsername(), outletId));
        ds.setPassword(props.getPassword());
        ds.setMaximumPoolSize(4);
        ds.setMinimumIdle(0);
        ds.setConnectionTimeout(5_000);
        ds.setInitializationFailTimeout(-1);
        // Isolation is the catalog + GRANT, not session variables.
        ds.setConnectionInitSql(null);
        pools.put(outletId, ds);
        log.info("Opened AI report pool schema={} user={}",
                AiReportTenantSchema.schemaName(outletId), ds.getUsername());
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.setQueryTimeout(Math.max(1, props.getQueryTimeoutSeconds()));
        jdbc.setMaxRows(Math.max(1, props.getMaxRows()));
        return jdbc;
    }

    @PreDestroy
    public void close() {
        pools.values().forEach(HikariDataSource::close);
        pools.clear();
        templates.clear();
    }
}
