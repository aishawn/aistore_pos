package com.orithos.config;

import com.orithos.modules.product.mapper.ProductMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * Links sale lines that only stored a product name, then applies stock once
 * for completed Orithos sales that never reduced inventory. Shopfront inventory is imported independently.
 */
@Component
@Order(36)
public class SaleStockBackfill implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SaleStockBackfill.class);

    private final DataSource dataSource;
    private final ProductMapper productMapper;

    public SaleStockBackfill(DataSource dataSource, ProductMapper productMapper) {
        this.dataSource = dataSource;
        this.productMapper = productMapper;
    }

    @Override
    public void run(String... args) {
        try (Connection conn = dataSource.getConnection()) {
            if (!tableExists(conn, "sale") || !tableExists(conn, "sale_item")) {
                return;
            }
            if (!columnExists(conn, "sale", "stock_applied")) {
                try (Statement st = conn.createStatement()) {
                    st.execute("ALTER TABLE sale ADD COLUMN stock_applied SMALLINT NOT NULL DEFAULT 0");
                }
            }
            try (Statement st = conn.createStatement()) {
                st.execute("""
                        UPDATE sale_item si
                        SET product_id = p.id
                        FROM product p, sale s
                        WHERE s.id = si.sale_id
                          AND s.source_system IS DISTINCT FROM 'shopfront'
                          AND p.outlet_id = COALESCE(s.outlet_id, si.outlet_id, 1)
                          AND p.deleted_at IS NULL
                          AND p.name = si.note
                          AND si.product_id IS NULL
                          AND si.note IS NOT NULL
                          AND si.note <> ''
                        """);
            }
            applyUnappliedSales(conn);
        } catch (Exception e) {
            log.warn("Skipped sale stock backfill: {}", e.getMessage());
        }
    }

    private void applyUnappliedSales(Connection conn) throws Exception {
        String sql = """
                SELECT s.id, COALESCE(s.outlet_id, si.outlet_id, 1) AS outlet_id,
                       si.product_id, si.quantity
                FROM sale s
                JOIN sale_item si ON si.sale_id = s.id
                WHERE s.status = 'COMPLETED'
                  AND s.source_system IS DISTINCT FROM 'shopfront'
                  AND s.stock_applied = 0
                  AND si.product_id IS NOT NULL
                  AND si.quantity IS NOT NULL
                  AND si.quantity <> 0
                ORDER BY s.id, si.id
                """;
        try (PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            Long currentSale = null;
            int lines = 0;
            while (rs.next()) {
                long saleId = rs.getLong("id");
                if (currentSale != null && saleId != currentSale) {
                    markApplied(conn, currentSale);
                }
                currentSale = saleId;
                BigDecimal qty = rs.getBigDecimal("quantity");
                productMapper.adjustInventory(rs.getLong("product_id"), rs.getLong("outlet_id"), qty.negate());
                lines++;
            }
            if (currentSale != null) {
                markApplied(conn, currentSale);
            }
            if (lines > 0) {
                log.info("Applied inventory for {} historical sale lines.", lines);
            }
        }
    }

    private static void markApplied(Connection conn, long saleId) throws Exception {
        try (PreparedStatement ps = conn.prepareStatement("UPDATE sale SET stock_applied = 1 WHERE id = ?")) {
            ps.setLong(1, saleId);
            ps.executeUpdate();
        }
    }

    private static boolean tableExists(Connection conn, String table) throws Exception {
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
