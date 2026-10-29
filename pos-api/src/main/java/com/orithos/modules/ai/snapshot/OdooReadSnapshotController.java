package com.orithos.modules.ai.snapshot;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/snapshots")
public class OdooReadSnapshotController {
    private final OdooReadSnapshotService service;
    private final TenantContextFactory tenantFactory;
    private final PermissionAccess permissions;

    public OdooReadSnapshotController(OdooReadSnapshotService service, TenantContextFactory tenantFactory,
                                      PermissionAccess permissions) {
        this.service = service;
        this.tenantFactory = tenantFactory;
        this.permissions = permissions;
    }

    @PostMapping("/sync")
    public ApiResult<OdooReadSnapshotSyncResult> sync(
            @RequestParam(defaultValue = "56") int historyDays) {
        permissions.requirePermission("ai.report.query");
        return ApiResult.ok(service.sync(tenantFactory.fromSecurity(), historyDays));
    }
}
