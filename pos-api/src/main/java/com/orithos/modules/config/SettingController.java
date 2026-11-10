package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/settings")
public class SettingController {

    private final SettingMapper mapper;
    private final CompanySettingsService companySettings;
    private final PermissionAccess permissions;

    public SettingController(SettingMapper mapper,
                             CompanySettingsService companySettings,
                             PermissionAccess permissions) {
        this.mapper = mapper;
        this.companySettings = companySettings;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<Setting>> list(@RequestParam(required = false) String scopeType,
                                         @RequestParam(required = false) Long scopeId) {
        permissions.requirePermission("settings.view");
        return ApiResult.ok(mapper.findAll(scopeType, scopeId));
    }

    @GetMapping("/company")
    public ApiResult<Map<String, CompanySettingsService.SettingView>> companyBundle() {
        permissions.requirePermission("settings.view");
        return ApiResult.ok(companySettings.companyBundle());
    }

    @PutMapping("/company")
    public ApiResult<Map<String, CompanySettingsService.SettingView>> putCompany(@RequestBody Map<String, String> body) {
        permissions.requirePermission("settings.store");
        companySettings.putManyOwned(body);
        return ApiResult.ok(companySettings.companyBundle());
    }

    @PutMapping("/company/{name}")
    public ApiResult<CompanySettingsService.SettingView> putCompanyOne(@PathVariable String name,
                                                                        @RequestBody Setting body) {
        permissions.requirePermission("settings.store");
        return ApiResult.ok(companySettings.putOwned(name, body.getValue(), body.getDatatype()));
    }

    @PutMapping
    public ApiResult<Setting> upsert(@RequestBody Setting s) {
        permissions.requirePermission("settings.store");
        if (s.getName() != null && (s.getName().startsWith("company.")
                || s.getName().startsWith("enterprise.")
                || s.getName().startsWith("push."))) {
            companySettings.putOwned(s.getName(), s.getValue(), s.getDatatype());
            return ApiResult.ok(s);
        }
        mapper.upsert(s);
        return ApiResult.ok(s);
    }

    /** updateLoyalty — persists loyalty config as a vendor-scoped setting keyed "loyalty". */
    @PutMapping("/loyalty")
    public ApiResult<Setting> updateLoyalty(@RequestBody LoyaltyRequest body) {
        permissions.requirePermission("settings.store");
        Setting s = new Setting();
        s.setScopeType("vendor");
        s.setScopeId(null);
        s.setName("loyalty");
        s.setValue(body.loyalty());
        s.setDatatype("json");
        companySettings.putOwned("loyalty", body.loyalty(), "json");
        return ApiResult.ok(s);
    }

    public record LoyaltyRequest(String loyalty) {}
}
