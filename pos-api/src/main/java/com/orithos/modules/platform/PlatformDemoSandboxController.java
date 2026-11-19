package com.orithos.modules.platform;

import com.fasterxml.jackson.databind.JsonNode;
import com.orithos.common.ApiResult;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/platform/demo-sandbox")
public class PlatformDemoSandboxController {

    private final DemoSandboxService demoSandboxService;

    public PlatformDemoSandboxController(DemoSandboxService demoSandboxService) {
        this.demoSandboxService = demoSandboxService;
    }

    @GetMapping("/status")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> status() {
        return ApiResult.ok(demoSandboxService.status());
    }

    @PostMapping("/purge")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> purge() {
        return ApiResult.ok(demoSandboxService.purgeLocalWrites());
    }

    @PostMapping("/queue-sync")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> queueSync() {
        return ApiResult.ok(demoSandboxService.queueDemoSync());
    }

    @PostMapping("/clone-mappings")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> cloneMappings(
            @RequestParam(required = false) String phase,
            @RequestParam(defaultValue = "1500") int limit) {
        if (phase == null || phase.isBlank()) {
            return ApiResult.ok(demoSandboxService.cloneMappingsAllPhases(limit));
        }
        return ApiResult.ok(demoSandboxService.cloneMappingsPhase(phase, limit));
    }

    @PostMapping("/rebaseline")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> rebaseline(@RequestBody(required = false) JsonNode body) {
        List<String> steps = new ArrayList<>();
        int limit = body == null ? 1500 : body.path("limit").asInt(1500);
        if (body != null && body.path("steps").isArray()) {
            for (JsonNode step : body.path("steps")) {
                if (step != null && step.isTextual() && !step.asText().isBlank()) {
                    steps.add(step.asText());
                }
            }
        }
        if (steps.isEmpty()) {
            steps = List.of("purge", "queue_sync", "clone_mappings", "verify");
        }
        String confirm = body == null ? "" : body.path("confirm").asText("").trim();
        if (!"RESET DEMO".equals(confirm)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Type RESET DEMO in confirm to run a full rebaseline");
        }
        Map<String, Object> result = demoSandboxService.rebaseline(steps, limit);
        result.put("confirm", confirm);
        return ApiResult.ok(result);
    }

    @GetMapping("/preview")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> preview() {
        Map<String, Object> status = demoSandboxService.status();
        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("status", status);
        preview.put("limitations", List.of(
                "Rebaseline purges non-Shopfront sales on Demo outlet only; SKR is untouched.",
                "Catalog and inventory refresh follows crawler daily sync for store_key=demo.",
                "Product mappings are repaired from SKR barcodes in three bounded phases.",
                "Full historical sale replay is owned by the crawler; this job queues sync, not a full history import."));
        return ApiResult.ok(preview);
    }
}