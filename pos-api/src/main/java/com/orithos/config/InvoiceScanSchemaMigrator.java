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
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 22)
public class InvoiceScanSchemaMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(InvoiceScanSchemaMigrator.class);

    private final DataSource dataSource;
    private final JdbcTemplate jdbc;

    public InvoiceScanSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @Override
    public void run(String... args) {
        try {
            ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
            populator.setSeparator(";");
            populator.setContinueOnError(true);
            populator.addScript(new ClassPathResource("db/migration_invoice_scan.sql"));
            DatabasePopulatorUtils.execute(populator, dataSource);
            retireLegacyInvoiceReferences();
            log.info("Invoice scan tables applied.");
        } catch (Exception e) {
            log.warn("Skipped invoice scan schema migration: {}", e.getMessage());
        }
    }

    private void retireLegacyInvoiceReferences() {
        if (columnExists("invoice_supplier_abn_map", "odoo_supplier_id")) {
            mapUniqueSupplierAbnReferences();
            jdbc.update("DELETE FROM invoice_supplier_abn_map WHERE supplier_id IS NULL");
            dropColumn("invoice_supplier_abn_map", "odoo_supplier_id");
        }
        if (columnExists("invoice_scan_session", "odoo_supplier_id")) {
            jdbc.update("""
                    UPDATE invoice_scan_session session
                    SET supplier_id = COALESCE(session.supplier_id, matched.supplier_id),
                        outlet_id = COALESCE(session.outlet_id, matched.outlet_id),
                        purchase_order_id = NULL,
                        purchase_order_name = NULL, receipt_id = NULL, receipt_name = NULL,
                        status = CASE WHEN status IN ('matched', 'po_created', 'received') THEN 'draft' ELSE status END,
                        updated_at = CURRENT_TIMESTAMP
                    FROM (
                        SELECT session.id, MIN(supplier.id) AS supplier_id, MIN(outlet.id) AS outlet_id
                        FROM invoice_scan_session session
                        JOIN outlet ON outlet.vendor_id = session.vendor_id AND outlet.deleted_at IS NULL
                        JOIN supplier ON supplier.outlet_id = outlet.id AND supplier.deleted_at IS NULL
                        WHERE session.supplier_abn IS NOT NULL AND TRIM(session.supplier_abn) <> ''
                          AND regexp_replace(UPPER(COALESCE(supplier.business_number, '')), '[^0-9]', '', 'g')
                              = regexp_replace(UPPER(session.supplier_abn), '[^0-9]', '', 'g')
                        GROUP BY session.id
                        HAVING COUNT(supplier.id) = 1
                    ) matched
                    WHERE session.id = matched.id
                    """);
            dropColumn("invoice_scan_session", "odoo_supplier_id");
        }
        if (columnExists("invoice_scan_session", "odoo_outlet_id")) dropColumn("invoice_scan_session", "odoo_outlet_id");
        if (columnExists("invoice_scan_session", "odoo_po_id")) dropColumn("invoice_scan_session", "odoo_po_id");
        if (columnExists("invoice_scan_session", "odoo_po_name")) dropColumn("invoice_scan_session", "odoo_po_name");
        if (columnExists("invoice_scan_session", "odoo_picking_id")) dropColumn("invoice_scan_session", "odoo_picking_id");
        if (columnExists("invoice_scan_session", "odoo_picking_name")) dropColumn("invoice_scan_session", "odoo_picking_name");
        if (columnExists("invoice_scan_line", "odoo_product_id")) {
            jdbc.update("""
                    UPDATE invoice_scan_line
                    SET product_name = COALESCE(product_name, odoo_product_name),
                        product_id = NULL, match_status = 'unmatched'
                    """);
            dropColumn("invoice_scan_line", "odoo_product_id");
        }
        if (columnExists("invoice_scan_line", "odoo_product_name")) dropColumn("invoice_scan_line", "odoo_product_name");
    }

    private void mapUniqueSupplierAbnReferences() {
        jdbc.update("""
                UPDATE invoice_supplier_abn_map mapping
                SET supplier_id = matches.supplier_id,
                    supplier_name = COALESCE(matches.supplier_name, mapping.supplier_name)
                FROM (
                    SELECT mapping.id, MIN(supplier.id) AS supplier_id, MIN(supplier.name) AS supplier_name
                    FROM invoice_supplier_abn_map mapping
                    JOIN outlet ON outlet.vendor_id = mapping.vendor_id AND outlet.deleted_at IS NULL
                    JOIN supplier ON supplier.outlet_id = outlet.id AND supplier.deleted_at IS NULL
                    WHERE mapping.supplier_abn IS NOT NULL AND TRIM(mapping.supplier_abn) <> ''
                      AND regexp_replace(UPPER(COALESCE(supplier.business_number, '')), '[^0-9]', '', 'g')
                          = regexp_replace(UPPER(mapping.supplier_abn), '[^0-9]', '', 'g')
                    GROUP BY mapping.id
                    HAVING COUNT(supplier.id) = 1
                ) matches
                WHERE mapping.id = matches.id
                """);
    }

    private boolean columnExists(String table, String column) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?
                )
                """, Boolean.class, table, column));
    }

    private void dropColumn(String table, String column) {
        jdbc.execute("ALTER TABLE " + table + " DROP COLUMN IF EXISTS " + column);
    }
}
