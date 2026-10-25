package com.orithos.config;

import com.orithos.common.AustraliaTime;
import com.orithos.common.LiquorProducts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.time.ZonedDateTime;

/**
 * Adds Australian retail columns on databases created before this release and
 * backfills each sale's business date from its UTC timestamp.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class AustraliaComplianceSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AustraliaComplianceSchemaMigrator.class);

    private final DataSource dataSource;

    public AustraliaComplianceSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try (Connection conn = dataSource.getConnection()) {
            addColumn(conn, "sale", "business_date",
                    "ALTER TABLE sale ADD COLUMN business_date DATE NULL COMMENT 'Australia/Sydney civil date'");
            addColumn(conn, "sale", "local_sold_at",
                    "ALTER TABLE sale ADD COLUMN local_sold_at DATETIME NULL COMMENT 'Australia/Sydney wall time'");
            addColumn(conn, "product", "abv",
                    "ALTER TABLE product ADD COLUMN abv DECIMAL(5,2) NULL COMMENT 'Alcohol by volume percent'");
            addColumn(conn, "product", "volume_ml",
                    "ALTER TABLE product ADD COLUMN volume_ml INT NULL COMMENT 'Container size in millilitres'");
            addColumn(conn, "product", "region",
                    "ALTER TABLE product ADD COLUMN region VARCHAR(128) NULL COMMENT 'Wine region or place of origin'");
            addColumn(conn, "product", "vintage",
                    "ALTER TABLE product ADD COLUMN vintage VARCHAR(16) NULL COMMENT 'Vintage year or NV'");
            int volumes = backfillVolumeFromName(conn);
            if (volumes > 0) {
                log.info("Backfilled container volume for {} products from the product name", volumes);
            }
            addColumn(conn, "product_wine_profile", "abv",
                    "ALTER TABLE product_wine_profile ADD COLUMN abv DECIMAL(5,2) NULL COMMENT 'Alcohol by volume percent'");
            ensureIndex(conn);
            int filled = backfillBusinessDates(conn);
            if (filled > 0) {
                log.info("Backfilled Australia/Sydney business dates for {} sales", filled);
            }
        } catch (Exception e) {
            log.warn("Skipped Australia compliance migration: {}", e.getMessage());
        }
    }

    private static void addColumn(Connection conn, String table, String column, String ddl) throws Exception {
        if (!tableExists(conn, table) || columnExists(conn, table, column)) {
            return;
        }
        try (Statement st = conn.createStatement()) {
            st.execute(ddl);
        }
    }

    private static void ensureIndex(Connection conn) throws Exception {
        if (!tableExists(conn, "sale")) {
            return;
        }
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT COUNT(*) FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = current_schema() AND TABLE_NAME = 'sale' AND INDEX_NAME = 'idx_sale_business_date'
                """);
             ResultSet rs = ps.executeQuery()) {
            if (rs.next() && rs.getInt(1) > 0) {
                return;
            }
        }
        try (Statement st = conn.createStatement()) {
            st.execute("CREATE INDEX idx_sale_business_date ON sale (outlet_id, business_date)");
        }
    }

    private static int backfillVolumeFromName(Connection conn) throws Exception {
        if (!columnExists(conn, "product", "volume_ml")) {
            return 0;
        }
        int updated = 0;
        try (PreparedStatement select = conn.prepareStatement("""
                SELECT id, name FROM product
                WHERE volume_ml IS NULL AND deleted_at IS NULL AND name IS NOT NULL
                """);
             ResultSet rs = select.executeQuery();
             PreparedStatement update = conn.prepareStatement("""
                UPDATE product SET volume_ml = ? WHERE id = ? AND volume_ml IS NULL
                """)) {
            while (rs.next()) {
                Integer ml = LiquorProducts.volumeMlFromName(rs.getString("name"));
                if (ml == null) {
                    continue;
                }
                update.setInt(1, ml);
                update.setLong(2, rs.getLong("id"));
                update.addBatch();
                updated++;
            }
            if (updated > 0) {
                update.executeBatch();
            }
        }
        return updated;
    }

    private static int backfillBusinessDates(Connection conn) throws Exception {
        if (!columnExists(conn, "sale", "business_date")) {
            return 0;
        }
        int updated = 0;
        while (true) {
            int batch = 0;
            try (PreparedStatement select = conn.prepareStatement("""
                    SELECT id, created_at FROM sale
                    WHERE business_date IS NULL AND created_at IS NOT NULL
                    LIMIT 500
                    """);
                 ResultSet rs = select.executeQuery();
                 PreparedStatement update = conn.prepareStatement("""
                    UPDATE sale SET business_date = ?, local_sold_at = ?
                    WHERE id = ? AND business_date IS NULL
                    """)) {
                while (rs.next()) {
                    LocalDateTime utcWall = rs.getObject("created_at", LocalDateTime.class);
                    if (utcWall == null) {
                        continue;
                    }
                    ZonedDateTime local = AustraliaTime.fromUtcWall(utcWall);
                    update.setString(1, local.toLocalDate().toString());
                    update.setString(2, local.toLocalDateTime().toString().replace('T', ' '));
                    update.setLong(3, rs.getLong("id"));
                    update.addBatch();
                    batch++;
                }
                if (batch == 0) {
                    break;
                }
                update.executeBatch();
                updated += batch;
            }
        }
        return updated;
    }

    private static boolean tableExists(Connection conn, String table) throws Exception {
        try (ResultSet rs = conn.getMetaData().getTables(conn.getCatalog(), null, table, new String[]{"TABLE"})) {
            if (rs.next()) {
                return true;
            }
        }
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = current_schema() AND TABLE_NAME = ?
                """)) {
            ps.setString(1, table);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }

    private static boolean columnExists(Connection conn, String table, String column) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = current_schema() AND TABLE_NAME = ? AND COLUMN_NAME = ?
                """)) {
            ps.setString(1, table);
            ps.setString(2, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }
}
