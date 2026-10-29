package com.orithos.modules.ai.snapshot;

import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

/**
 * Opt-in read-only snapshot refresh. It deliberately uses a trusted internal
 * tenant context and never shares the caller's security context.
 */
@Component
@ConditionalOnProperty(prefix = "app.ai.snapshot", name = "sync-enabled", havingValue = "true")
public final class OdooReadSnapshotScheduler {
    private static final Logger log = LoggerFactory.getLogger(OdooReadSnapshotScheduler.class);

    private final VendorMapper vendors;
    private final OdooReadSnapshotService snapshots;

    public OdooReadSnapshotScheduler(VendorMapper vendors, OdooReadSnapshotService snapshots) {
        this.vendors = vendors;
        this.snapshots = snapshots;
    }

    @Scheduled(
            initialDelayString = "${app.ai.snapshot.sync-initial-delay-ms:60000}",
            fixedDelayString = "${app.ai.snapshot.sync-delay-ms:21600000}")
    public void refresh() {
        List<Vendor> active = vendors.page(null, "active", 1000, 0);
        int attempted = 0;
        int succeeded = 0;
        for (Vendor vendor : active == null ? List.<Vendor>of() : active) {
            if (vendor == null || vendor.getId() == null || vendor.getOutletId() == null) continue;
            attempted++;
            try {
                TenantContext trusted = new TenantContext(vendor.getId(), 0L, vendor.getOutletId(),
                        List.of(vendor.getOutletId()), Set.of("ROLE_ADMIN"));
                snapshots.sync(trusted);
                succeeded++;
            } catch (RuntimeException failure) {
                log.warn("AI snapshot refresh skipped vendorId={} outletId={} causeType={}",
                        vendor.getId(), vendor.getOutletId(), failure.getClass().getSimpleName());
            }
        }
        log.info("AI snapshot refresh completed attempted={} succeeded={}", attempted, succeeded);
    }
}
