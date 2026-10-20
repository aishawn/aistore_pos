package com.orithos.modules.ai;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.report.PlatformAiMetricsService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/platform/metrics")
public class PlatformAiMetricsController {

    private final PlatformAiMetricsService metricsService;

    public PlatformAiMetricsController(PlatformAiMetricsService metricsService) {
        this.metricsService = metricsService;
    }

    /** Cross-store AI usage aggregates for the control plane. No chat text. */
    @GetMapping("/ai")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> aiUsage(
            @RequestParam(value = "hours", defaultValue = "24") int hours) {
        return ApiResult.ok(metricsService.usage(hours));
    }

    @GetMapping("/ai/stores/{vendorId}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> storeAiKpi(
            @PathVariable long vendorId,
            @RequestParam(value = "hours", defaultValue = "24") int hours) {
        return ApiResult.ok(metricsService.storeKpi(vendorId, hours));
    }
}
