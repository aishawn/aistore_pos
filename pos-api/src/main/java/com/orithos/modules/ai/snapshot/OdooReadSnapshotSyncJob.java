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

/** Optional background refresh. Disabled unless explicitly enabled per environment. */
@Component
@ConditionalOnProperty(name = "app.ai.snapshot.sync-enabled", havingValue = "true")
public class OdooReadSnapshotSyncJob {
    private static final Logger log = LoggerFactory.getLogger(OdooReadSnapshotSyncJob.class);

    private final VendorMapper vendors;
    private final OdooReadSnapshotService snapshots;

    public OdooReadSnapshotSyncJob(VendorMapper vendors, OdooReadSnapshotService snapshots) {
        this.vendors = vendors;
        this.snapshots = snapshots;
    }

    @Scheduled(
            fixedDelayString = "${app.ai.snapshot.sync-delay-ms:21600000}",
            initialDelayString = "${app.ai.snapshot.sync-initial-delay-ms:60000}")
    public void refresh() {
        List<Vendor> bindings;
        try {
            bindings = vendors.readyOdooBindings();
        } catch (RuntimeException error) {
            log.warn("AI snapshot refresh could not load Odoo tenant bindings causeType={}",
                    error.getClass().getSimpleName());
            return;
        }
        for (Vendor vendor : bindings) {
            if (vendor.getId() == null || vendor.getOutletId() == null) continue;
            TenantContext systemTenant = new TenantContext(vendor.getId(), 0L, vendor.getOutletId(),
                    List.of(vendor.getOutletId()), Set.of("ROLE_ADMIN"));
            try {
                snapshots.sync(systemTenant, 56);
            } catch (RuntimeException error) {
                log.warn("AI snapshot refresh failed vendorId={} outletId={} causeType={}",
                        vendor.getId(), vendor.getOutletId(), error.getClass().getSimpleName());
            }
        }
    }
}
