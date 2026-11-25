package com.orithos.modules.ai.replenishment;

import org.junit.jupiter.api.Test;

import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InventoryDailySnapshotServiceTest {
    @Test
    void dailyCaptureStartsNearStoreCloseAndStaysOnTheBusinessDate() {
        assertFalse(InventoryDailySnapshotService.shouldCaptureAt(LocalTime.of(23, 44, 59)));
        assertTrue(InventoryDailySnapshotService.shouldCaptureAt(LocalTime.of(23, 45)));
        assertTrue(InventoryDailySnapshotService.shouldCaptureAt(LocalTime.of(23, 59, 59)));
        assertFalse(InventoryDailySnapshotService.shouldCaptureAt(LocalTime.MIDNIGHT));
    }
}
