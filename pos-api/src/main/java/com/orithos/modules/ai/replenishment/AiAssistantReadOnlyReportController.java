package com.orithos.modules.ai.replenishment;

import com.orithos.common.ApiResult;
import com.orithos.common.AustraliaTime;
import com.orithos.modules.ai.report.TenantContextFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/assistant")
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class AiAssistantReadOnlyReportController {
    private final TenantContextFactory tenantContextFactory;
    private final NativeReplenishmentService replenishmentService;

    public AiAssistantReadOnlyReportController(TenantContextFactory tenantContextFactory,
                                               NativeReplenishmentService replenishmentService) {
        this.tenantContextFactory = tenantContextFactory;
        this.replenishmentService = replenishmentService;
    }

    @GetMapping("/replenishment-report")
    public ApiResult<AssistantReplenishmentPreviewResponse> replenishmentReport() {
        ReplenishmentPlan plan = replenishmentService.plan(tenantContextFactory.fromSecurity());
        return ApiResult.ok(AssistantReplenishmentPreviewResponse.from(plan, AustraliaTime.today()));
    }
}
