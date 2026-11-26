package com.orithos.modules.ai.replenishment;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.security.PermissionAccess;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/replenishment")
public class ReplenishmentWorkspaceController {
    private final ReplenishmentWorkspaceService service;
    private final TenantContextFactory tenantContextFactory;
    private final PermissionAccess permissions;
    private final PurchaseDraftGate purchaseDraftGate;

    public ReplenishmentWorkspaceController(
            ReplenishmentWorkspaceService service,
            TenantContextFactory tenantContextFactory,
            PermissionAccess permissions,
            PurchaseDraftGate purchaseDraftGate) {
        this.service = service;
        this.tenantContextFactory = tenantContextFactory;
        this.permissions = permissions;
        this.purchaseDraftGate = purchaseDraftGate;
    }

    @GetMapping("/plan")
    public ApiResult<ReplenishmentWorkspaceView> plan(
            @RequestParam(defaultValue = "21") int coverageDays,
            @RequestParam(required = false) String mode,
            @RequestParam(required = false) String scope,
            HttpServletRequest request) {
        permissions.requirePermission("stock.replenishment");
        var tenant = tenantContextFactory.fromSecurity();
        if (tenant.requireOutletId() == null) {
            throw new BusinessException(40010, "Select a store before loading replenishment.");
        }
        boolean exceptionOnly = mode != null && "exceptions".equalsIgnoreCase(mode.trim());
        if (scope != null && !scope.isBlank() && !"alcohol".equalsIgnoreCase(scope.trim())) {
            throw new BusinessException(40010, "Unsupported replenishment scope.");
        }
        boolean alcoholOnly = "alcohol".equalsIgnoreCase(scope == null ? "" : scope.trim());
        String host = request.getHeader("x-forwarded-host");
        if (host == null || host.isBlank()) host = request.getHeader("host");
        if (host != null && host.contains(",")) host = host.split(",")[0].trim();
        boolean draftEnabled = purchaseDraftGate.draftEnabledForHost(host);
        ReplenishmentWorkspaceView view = service.plan(tenant, coverageDays, exceptionOnly, draftEnabled, alcoholOnly);
        return ApiResult.ok(view);
    }
}
