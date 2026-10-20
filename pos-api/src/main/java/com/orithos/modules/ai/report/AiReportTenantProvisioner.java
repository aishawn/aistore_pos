package com.orithos.modules.ai.report;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Creates {@code orithos_o{outletId}} schemas, views hardcoded to that outlet,
 * and a RO MySQL user that can SELECT only those views.
 */
@Component
public class AiReportTenantProvisioner {

    private static final Logger log = LoggerFactory.getLogger(AiReportTenantProvisioner.class);
    static final String[] VIEWS = {
            "ai_rpt_sale_item", "ai_rpt_product", "ai_rpt_inventory", "ai_rpt_customer_sale"
    };

    private static final Map<String, String> VIEW_COLUMNS = Map.of(
            "ai_rpt_sale_item", "id, outlet_id, sold_at, product_id, qty, amount, customer_id, sale_id, business_date",
            "ai_rpt_product", "id, outlet_id, name, status, category_id, category_name",
            "ai_rpt_inventory", "product_id, outlet_id, quantity, reorder_level, on_order",
            "ai_rpt_customer_sale", "sale_id, outlet_id, sold_at, customer_id, amount, business_date"
    );

    private final DataSource adminDataSource;
    private final AiReportProperties props;

    public AiReportTenantProvisioner(DataSource adminDataSource, AiReportProperties props) {
        this.adminDataSource = adminDataSource;
        this.props = props;
    }

    public void ensureOutlet(long outletId) {
        AiReportTenantSchema.requireOutletId(outletId);
        provision(outletId);
    }

    public List<Long> listOutletIds() {
        List<Long> ids = new ArrayList<>();
        String sql = "SELECT id FROM outlet WHERE deleted_at IS NULL";
        try (Connection c = adminDataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                long id = rs.getLong(1);
                if (id > 0) {
                    ids.add(id);
                }
            }
        } catch (Exception e) {
            log.warn("Could not list outlets for AI report schemas type={}", e.getClass().getSimpleName());
        }
        return ids;
    }

    private void provision(long outletId) {
        if (props.getPassword() == null || props.getPassword().isBlank()) {
            throw new IllegalStateException(
                    "AI_REPORT_RO_PASSWORD must be configured before provisioning AI report access");
        }
        String schema = AiReportTenantSchema.schemaName(outletId);
        String user = AiReportTenantSchema.username(props.getUsername(), outletId);
        String pass = escapeMysqlString(props.getPassword());
        try (Connection c = adminDataSource.getConnection(); Statement st = c.createStatement()) {
            String primary = c.getCatalog();
            st.execute("CREATE DATABASE IF NOT EXISTS `" + schema
                    + "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            for (String view : VIEWS) {
                String cols = VIEW_COLUMNS.get(view);
                // TEMPTABLE + named columns so tenant views always read the current primary view.
                st.execute("CREATE OR REPLACE ALGORITHM = TEMPTABLE SQL SECURITY DEFINER VIEW `"
                        + schema + "`.`" + view + "` AS SELECT " + cols
                        + " FROM `" + primary + "`.`" + view + "` WHERE outlet_id = " + outletId);
            }
            ensureUser(st, user, pass, "%");
            ensureUser(st, user, pass, "localhost");
            for (String view : VIEWS) {
                st.execute("GRANT SELECT ON `" + schema + "`.`" + view + "` TO '" + user + "'@'%'");
                st.execute("GRANT SELECT ON `" + schema + "`.`" + view + "` TO '" + user + "'@'localhost'");
            }
            st.execute("FLUSH PRIVILEGES");
            log.info("Ensured AI report tenant schema {} user={}", schema, user);
        } catch (SqlGuardException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Could not provision AI report schema for outlet " + outletId
                    + " type=" + e.getClass().getSimpleName());
        }
    }

    private static void ensureUser(Statement st, String user, String pass, String host) throws Exception {
        st.execute("CREATE USER IF NOT EXISTS '" + user + "'@'" + host + "' IDENTIFIED BY '" + pass + "'");
        st.execute("ALTER USER '" + user + "'@'" + host + "' IDENTIFIED BY '" + pass + "'");
    }

    static String escapeMysqlString(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("\\", "\\\\").replace("'", "''");
    }
}
