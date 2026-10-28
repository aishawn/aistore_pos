package com.orithos.modules.ai.command;

import com.orithos.common.ApiResult;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

import static com.orithos.modules.ai.command.AiCommandDtos.*;

@RestController
@RequestMapping("/api/ai/commands")
public class AiCommandController {
    private final AiCommandService service;

    public AiCommandController(AiCommandService service) { this.service = service; }

    @PostMapping("/parse")
    public ApiResult<CommandResponse> parse(@Valid @RequestBody ParseRequest request) {
        return ApiResult.ok(service.parse(request));
    }

    @GetMapping("/{id}")
    public ApiResult<CommandResponse> get(@PathVariable UUID id) {
        return ApiResult.ok(service.get(id));
    }

    @PostMapping("/{id}/preview")
    public ApiResult<CommandResponse> preview(@PathVariable UUID id) {
        return ApiResult.ok(service.get(id));
    }

    @PostMapping("/{id}/confirm")
    public ApiResult<CommandResponse> confirm(@PathVariable UUID id,
                                              @Valid @RequestBody ConfirmRequest request) {
        return ApiResult.ok(service.confirm(id, request));
    }

    @PostMapping("/{id}/cancel")
    public ApiResult<CommandResponse> cancel(@PathVariable UUID id) {
        return ApiResult.ok(service.cancel(id));
    }
}
