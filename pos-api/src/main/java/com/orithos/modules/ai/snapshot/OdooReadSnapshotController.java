package com.orithos.modules.ai.snapshot;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.report.TenantContextFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/snapshots")
public class OdooReadSnapshotController {
    private final OdooReadSnapshotService service;
    private final TenantContextFactory tenantFactory;

    public OdooReadSnapshotController(OdooReadSnapshotService service, TenantContextFactory tenantFactory) {
        this.service = service;
        this.tenantFactory = tenantFactory;
    }

    /** Manual, read-only sync used by the scheduler/operations layer. */
    @PostMapping("/sync")
    public ApiResult<OdooReadSnapshotService.SyncResult> sync() {
        return ApiResult.ok(service.sync(tenantFactory.fromSecurity()));
    }
}
