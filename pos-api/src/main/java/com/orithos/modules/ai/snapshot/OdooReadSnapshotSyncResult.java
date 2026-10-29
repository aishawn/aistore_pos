package com.orithos.modules.ai.snapshot;

import java.time.Instant;
import java.util.Map;

/** Result of one tenant-scoped, read-only Odoo snapshot pull. */
public record OdooReadSnapshotSyncResult(
        String status,
        long vendorId,
        long outletId,
        String sourceVersion,
        Instant dataAsOf,
        int products,
        int inventory,
        int prices,
        int sales,
        Map<String, String> dataQuality
) {
}
