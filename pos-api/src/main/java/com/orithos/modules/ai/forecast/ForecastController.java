package com.orithos.modules.ai.forecast;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/forecast")
public class ForecastController {
    private final ForecastService service;
    private final TenantContextFactory tenantFactory;
    private final PermissionAccess permissions;

    public ForecastController(ForecastService service, TenantContextFactory tenantFactory,
                              PermissionAccess permissions) {
        this.service = service; this.tenantFactory = tenantFactory; this.permissions = permissions;
    }

    @PostMapping("/sales")
    public ApiResult<ForecastDtos.Response> sales(@RequestParam(defaultValue = "14") int horizonDays) {
        permissions.requirePermission("ai.report.query");
        return ApiResult.ok(service.forecast(tenantFactory.fromSecurity(), horizonDays));
    }
}
