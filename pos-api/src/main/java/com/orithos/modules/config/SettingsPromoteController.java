package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/** Store-admin trigger for on-demand settings promote from staged Shopfront rows. */
@RestController
@RequestMapping("/api/settings/import")
public class SettingsPromoteController {

    private final SettingsImportService importService;
    private final CompanySettingsService companySettings;
    private final PermissionAccess permissions;
    private final JdbcTemplate jdbc;

    public SettingsPromoteController(SettingsImportService importService,
                                     CompanySettingsService companySettings,
                                     PermissionAccess permissions,
                                     JdbcTemplate jdbc) {
        this.importService = importService;
        this.companySettings = companySettings;
        this.permissions = permissions;
        this.jdbc = jdbc;
    }

    @PostMapping("/promote")
    public ApiResult<Map<String, Object>> promote(@RequestBody(required = false) Map<String, String> body) {
        permissions.requirePermission("settings.integrations");
        String storeKey = "";
        if (body != null) {
            if (body.get("storeKey") != null) storeKey = body.get("storeKey").trim();
            else if (body.get("store_key") != null) storeKey = body.get("store_key").trim();
        }
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "An outlet is required");
        if (storeKey.isBlank()) {
            var mappings = jdbc.queryForList(
                    "SELECT store_key FROM shopfront_store_mapping WHERE outlet_id = ? AND enabled = TRUE", outletId);
            if (mappings.size() != 1) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Exactly one enabled Shopfront mapping is required for this outlet");
            }
            storeKey = String.valueOf(mappings.getFirst().get("store_key"));
        }
        Integer mapped = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_store_mapping WHERE store_key = ? AND outlet_id = ? AND enabled = TRUE",
                Integer.class, storeKey, outletId);
        if (mapped == null || mapped != 1) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "The Shopfront mapping is not assigned to this outlet");
        }
        throw new ResponseStatusException(HttpStatus.GONE,
                "Shopfront settings are now imported from the crawler source database; run settings sync in Shopfront Crawler");
    }

    @PostMapping("/dedupe")
    public ApiResult<Map<String, Object>> dedupe() {
        if (!permissions.hasPermission("settings.store") && !permissions.hasPermission("settings.integrations")) {
            permissions.requirePermission("settings.store");
        }
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "An outlet is required");
        return ApiResult.ok(importService.dedupeCatalogues(outletId));
    }

    @GetMapping("/status")
    public ApiResult<Map<String, String>> status() {
        permissions.requirePermission("settings.view");
        return ApiResult.ok(Map.of(
                "last_store_key", companySettings.getString("settings.import.last_store_key", ""),
                "last_at", companySettings.getString("settings.import.last_at", "")
        ));
    }
}
