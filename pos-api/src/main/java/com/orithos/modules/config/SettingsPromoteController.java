package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Store-admin trigger for on-demand settings promote from staged Shopfront rows. */
@RestController
@RequestMapping("/api/settings/import")
public class SettingsPromoteController {

    private final SettingsImportService importService;
    private final CompanySettingsService companySettings;
    private final PermissionAccess permissions;

    public SettingsPromoteController(SettingsImportService importService,
                                     CompanySettingsService companySettings,
                                     PermissionAccess permissions) {
        this.importService = importService;
        this.companySettings = companySettings;
        this.permissions = permissions;
    }

    @PostMapping("/promote")
    public ApiResult<Map<String, Object>> promote(@RequestBody(required = false) Map<String, String> body) {
        permissions.requirePermission("settings.integrations");
        String storeKey = "";
        if (body != null) {
            if (body.get("storeKey") != null) storeKey = body.get("storeKey").trim();
            else if (body.get("store_key") != null) storeKey = body.get("store_key").trim();
        }
        if (storeKey.isBlank()) {
            storeKey = companySettings.getString("settings.import.last_store_key", "skr");
            if (storeKey == null || storeKey.isBlank()) storeKey = "skr";
        }
        return ApiResult.ok(importService.promote(storeKey, true));
    }

    @PostMapping("/dedupe")
    public ApiResult<Map<String, Object>> dedupe() {
        if (!permissions.hasPermission("settings.store") && !permissions.hasPermission("settings.integrations")) {
            permissions.requirePermission("settings.store");
        }
        return ApiResult.ok(importService.dedupeCatalogues());
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
