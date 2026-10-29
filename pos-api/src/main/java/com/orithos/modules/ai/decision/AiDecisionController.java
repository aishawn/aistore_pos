package com.orithos.modules.ai.decision;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.report.TenantContextFactory;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/ai/decisions")
public class AiDecisionController {
    private final AiDecisionService service;
    private final TenantContextFactory tenantFactory;

    public AiDecisionController(AiDecisionService service, TenantContextFactory tenantFactory) {
        this.service = service; this.tenantFactory = tenantFactory;
    }

    @PostMapping("/pricing/preview")
    public ApiResult<Map<String, Object>> pricingPreview() {
        return ApiResult.ok(service.previewPricing(tenantFactory.fromSecurity()));
    }

    @PostMapping("/replenishment/preview")
    public ApiResult<Map<String, Object>> replenishmentPreview() {
        return ApiResult.ok(service.previewReplenishment(tenantFactory.fromSecurity()));
    }

    @PostMapping("/backtest")
    public ApiResult<Map<String, Object>> backtest(@Valid @RequestBody BacktestRequest request) {
        if (request == null || request.type() == null || request.baselineVersion() == null
                || request.candidateVersion() == null) {
            throw new com.orithos.common.BusinessException(40010,
                    "Type and two snapshot versions are required");
        }
        return ApiResult.ok(service.backtest(tenantFactory.fromSecurity(), request.type(),
                request.baselineVersion(), request.candidateVersion()));
    }

    @GetMapping
    public ApiResult<List<Map<String, Object>>> list(@RequestParam(defaultValue = "PRICING") String type,
                                                      @RequestParam(defaultValue = "20") int limit) {
        return ApiResult.ok(service.list(tenantFactory.fromSecurity(), type, limit));
    }

    @PostMapping("/{id}/feedback")
    public ApiResult<Void> feedback(@PathVariable UUID id, @Valid @RequestBody AiDecisionService.FeedbackRequest request) {
        service.feedback(tenantFactory.fromSecurity(), id, request);
        return ApiResult.ok(null);
    }

    public record BacktestRequest(String type, String baselineVersion, String candidateVersion) { }
}
