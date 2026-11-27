package com.orithos.modules.ai.managerbrief;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.security.PermissionAccess;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/manager/daily-brief")
public class AiManagerDailyBriefController {
    private final AiManagerDailyBriefService service;
    private final TenantContextFactory tenants;
    private final PermissionAccess permissions;

    public AiManagerDailyBriefController(AiManagerDailyBriefService service, TenantContextFactory tenants,
                                         PermissionAccess permissions) {
        this.service = service;
        this.tenants = tenants;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<AiManagerDailyBriefResponse> get() {
        permissions.requirePermission("ai.manager.brief.read");
        return ApiResult.ok(service.getOrRefresh(tenants.fromSecurity(), false));
    }

    @PostMapping("/refresh")
    public ApiResult<AiManagerDailyBriefResponse> refresh() {
        permissions.requirePermission("ai.manager.brief.read");
        return ApiResult.ok(service.getOrRefresh(tenants.fromSecurity(), true));
    }

    @PostMapping("/{id}/feedback")
    public ApiResult<Void> feedback(@PathVariable long id, @Valid @RequestBody FeedbackRequest request) {
        permissions.requirePermission("ai.manager.brief.read");
        service.recordFeedback(tenants.fromSecurity(), id, request.cardId(), request.status());
        return ApiResult.ok(null);
    }

    public record FeedbackRequest(@NotBlank @Size(max = 96) String cardId,
                                  @NotBlank @Pattern(regexp = "CONFIRMED|INVALID|RESOLVED") String status) { }
}
