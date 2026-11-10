package com.orithos.modules.integration;

import com.orithos.common.ApiResult;
import com.orithos.modules.config.SettingsImportService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * One-shot / on-demand Shopfront settings promote into Orithos-native tables.
 * Does not run on daily sync; never overwrites Orithos-owned settings.
 */
@RestController
@RequestMapping("/api/integrations/shopfront")
public class SettingsImportController {

    private final SettingsImportService importService;
    private final String token;
    private final boolean enabled;

    public SettingsImportController(
            SettingsImportService importService,
            @Value("${app.shopfront.integration-token:}") String token,
            @Value("${app.shopfront.integration-enabled:false}") boolean enabled) {
        this.importService = importService;
        this.token = token;
        this.enabled = enabled;
    }

    @PostMapping("/settings:import")
    public ApiResult<Map<String, Object>> importSettings(
            @RequestHeader("X-Shopfront-Integration-Token") String supplied,
            @RequestBody Map<String, Object> body) {
        authorize(supplied);
        String storeKey = body == null ? "" : String.valueOf(body.getOrDefault("store_key", "")).trim();
        if (storeKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "store_key is required");
        }
        boolean forceEmptyOnly = body.get("force_empty_only") == null
                || Boolean.parseBoolean(String.valueOf(body.get("force_empty_only")));
        return ApiResult.ok(importService.promote(storeKey, forceEmptyOnly));
    }

    private void authorize(String supplied) {
        if (!enabled) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Shopfront integration is disabled");
        }
        if (token == null || token.isBlank() || supplied == null || !token.equals(supplied)) {
            throw new AccessDeniedException("Invalid Shopfront integration token");
        }
    }
}
