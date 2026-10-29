package com.orithos.modules.ai.command;

import com.orithos.common.ApiResult;
import com.orithos.modules.ai.report.TenantContextFactory;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/ai/commands")
public class AiCommandController {
    private final AiCommandService service;
    private final TenantContextFactory tenantFactory;

    public AiCommandController(AiCommandService service, TenantContextFactory tenantFactory) {
        this.service = service; this.tenantFactory = tenantFactory;
    }

    @PostMapping("/parse")
    public ApiResult<AiCommandDtos.CommandResponse> parse(@Valid @RequestBody AiCommandDtos.ParseRequest request) {
        return ApiResult.ok(service.parse(tenantFactory.fromSecurity(), request));
    }

    @GetMapping("/{id}")
    public ApiResult<AiCommandDtos.CommandResponse> get(@PathVariable UUID id) {
        return ApiResult.ok(service.get(tenantFactory.fromSecurity(), id));
    }

    @PostMapping("/{id}/preview")
    public ApiResult<AiCommandDtos.CommandResponse> preview(@PathVariable UUID id) {
        return ApiResult.ok(service.get(tenantFactory.fromSecurity(), id));
    }

    @PostMapping("/{id}/confirm")
    public ApiResult<AiCommandDtos.CommandResponse> confirm(@PathVariable UUID id, @Valid @RequestBody AiCommandDtos.ConfirmRequest request) {
        return ApiResult.ok(service.confirm(tenantFactory.fromSecurity(), id, request));
    }

    @PostMapping("/{id}/cancel")
    public ApiResult<AiCommandDtos.CommandResponse> cancel(@PathVariable UUID id) {
        return ApiResult.ok(service.cancel(tenantFactory.fromSecurity(), id));
    }
}
