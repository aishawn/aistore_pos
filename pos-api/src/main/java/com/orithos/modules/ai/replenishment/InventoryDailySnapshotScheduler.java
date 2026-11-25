package com.orithos.modules.ai.replenishment;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class InventoryDailySnapshotScheduler {
    private final InventoryDailySnapshotService snapshots;

    public InventoryDailySnapshotScheduler(InventoryDailySnapshotService snapshots) {
        this.snapshots = snapshots;
    }

    @Scheduled(cron = "${AI_INVENTORY_DAILY_SNAPSHOT_CRON:0 * * * * *}")
    public void captureAtStoreClose() {
        snapshots.captureDueOutlets();
    }
}
