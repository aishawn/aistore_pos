package com.orithos.modules.ai.forecast;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/ai/forecast")
public class ForecastRiskController {
    private final ForecastRiskService service;
    private final TenantContextFactory tenantFactory;
    private final PermissionAccess permissions;

    public ForecastRiskController(ForecastRiskService service, TenantContextFactory tenantFactory,
                                  PermissionAccess permissions) {
        this.service = service; this.tenantFactory = tenantFactory; this.permissions = permissions;
    }

    @PostMapping("/risks")
    public ApiResult<Map<String, Object>> risks(@RequestParam(defaultValue = "14") int horizonDays) {
        permissions.requirePermission("stock.replenishment");
        return ApiResult.ok(service.risks(tenantFactory.fromSecurity(), horizonDays));
    }
}
