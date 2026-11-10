package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/settings/push")
public class PushSettingsController {

    private final CompanySettingsService companySettings;
    private final PermissionAccess permissions;

    public PushSettingsController(CompanySettingsService companySettings, PermissionAccess permissions) {
        this.companySettings = companySettings;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<Map<String, String>> get() {
        permissions.requirePermission("settings.view");
        Map<String, CompanySettingsService.SettingView> bundle = companySettings.companyBundle();
        Map<String, String> out = new LinkedHashMap<>();
        for (var entry : bundle.entrySet()) {
            if (entry.getKey().startsWith("push.")) {
                out.put(entry.getKey(), entry.getValue().value());
            }
        }
        return ApiResult.ok(out);
    }

    @PutMapping
    public ApiResult<Map<String, String>> put(@RequestBody Map<String, String> body) {
        permissions.requirePermission("settings.store");
        if (body != null) {
            Map<String, String> filtered = new LinkedHashMap<>();
            for (var entry : body.entrySet()) {
                String key = entry.getKey();
                if (key != null && key.startsWith("push.")) {
                    filtered.put(key, entry.getValue());
                }
            }
            companySettings.putManyOwned(filtered);
        }
        return get();
    }
}
