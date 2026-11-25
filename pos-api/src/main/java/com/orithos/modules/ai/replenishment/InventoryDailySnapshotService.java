package com.orithos.modules.ai.replenishment;

import com.orithos.common.BusinessTimezoneService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.List;

@Service
public class InventoryDailySnapshotService {
    private static final Logger log = LoggerFactory.getLogger(InventoryDailySnapshotService.class);
    private static final LocalTime CAPTURE_AFTER = LocalTime.of(23, 45);
    private static final int RETENTION_DAYS = 400;

    private final JdbcTemplate jdbc;
    private final BusinessTimezoneService businessTimezone;
    private final TransactionTemplate transactionTemplate;

    public InventoryDailySnapshotService(JdbcTemplate jdbc, BusinessTimezoneService businessTimezone,
                                         TransactionTemplate transactionTemplate) {
        this.jdbc = jdbc;
        this.businessTimezone = businessTimezone;
        this.transactionTemplate = transactionTemplate;
    }

    public void captureDueOutlets() {
        List<Outlet> outlets = jdbc.query("""
                SELECT id, vendor_id FROM outlet WHERE deleted_at IS NULL ORDER BY id
                """, (rs, rowNum) -> new Outlet(rs.getLong("id"), rs.getLong("vendor_id")));
        for (Outlet outlet : outlets) {
            var zone = businessTimezone.zoneForVendor(outlet.vendorId());
            ZonedDateTime localNow = ZonedDateTime.now(zone);
            if (!shouldCaptureAt(localNow.toLocalTime())) continue;
            try {
                captureOutlet(outlet.id(), localNow.toLocalDate());
            } catch (RuntimeException error) {
                log.warn("Inventory daily snapshot failed outletId={} businessDate={} errorType={}",
                        outlet.id(), localNow.toLocalDate(), error.getClass().getSimpleName());
            }
        }
    }

    public boolean captureOutlet(long outletId, LocalDate businessDate) {
        return Boolean.TRUE.equals(transactionTemplate.execute(
                status -> captureOutletInTransaction(outletId, businessDate)));
    }

    private boolean captureOutletInTransaction(long outletId, LocalDate businessDate) {
        int expected = jdbc.queryForObject("""
                SELECT COUNT(*) FROM product
                WHERE outlet_id = ? AND deleted_at IS NULL AND status = 'ACTIVE' AND track_inventory = 1
                """, Integer.class, outletId);
        List<Long> captureIds = jdbc.query("""
                INSERT INTO inventory_snapshot_capture
                    (outlet_id, business_date, expected_products, capture_status)
                VALUES (?, ?, ?, 'CAPTURING')
                ON CONFLICT (outlet_id, business_date) DO NOTHING
                RETURNING id
                """, (rs, rowNum) -> rs.getLong(1), outletId, businessDate, expected);
        if (captureIds.isEmpty()) return false;

        int recorded = jdbc.update("""
                INSERT INTO inventory_daily_snapshot
                    (outlet_id, product_id, business_date, quantity, on_order, captured_at)
                SELECT p.outlet_id, p.id, ?, pi.quantity, COALESCE(pi.on_order, 0), CURRENT_TIMESTAMP
                FROM product p
                LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.outlet_id = p.outlet_id
                WHERE p.outlet_id = ? AND p.deleted_at IS NULL
                  AND p.status = 'ACTIVE' AND p.track_inventory = 1
                ON CONFLICT (outlet_id, product_id, business_date) DO NOTHING
                """, businessDate, outletId);
        Integer quantityProducts = jdbc.queryForObject("""
                SELECT COUNT(*) FROM inventory_daily_snapshot
                WHERE outlet_id = ? AND business_date = ? AND quantity IS NOT NULL
                """, Integer.class, outletId, businessDate);
        String status = expected > 0 && recorded == expected && quantityProducts == expected
                ? "COMPLETE" : expected == 0 ? "EMPTY" : "PARTIAL";
        jdbc.update("""
                UPDATE inventory_snapshot_capture
                SET recorded_products = ?, quantity_products = ?, capture_status = ?
                WHERE id = ?
                """, recorded, quantityProducts, status, captureIds.getFirst());

        LocalDate retentionCutoff = businessDate.minusDays(RETENTION_DAYS);
        jdbc.update("DELETE FROM inventory_daily_snapshot WHERE outlet_id = ? AND business_date < ?",
                outletId, retentionCutoff);
        jdbc.update("DELETE FROM inventory_snapshot_capture WHERE outlet_id = ? AND business_date < ?",
                outletId, retentionCutoff);
        log.info("Inventory daily snapshot completed outletId={} businessDate={} status={} recorded={} expected={} withQuantity={}",
                outletId, businessDate, status, recorded, expected, quantityProducts);
        return true;
    }

    static boolean shouldCaptureAt(LocalTime localTime) {
        return !localTime.isBefore(CAPTURE_AFTER);
    }

    private record Outlet(long id, long vendorId) { }
}
