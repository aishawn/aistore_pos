package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

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
        String requestedType = scopeType == null || scopeType.isBlank()
                ? "vendor" : scopeType.trim().toLowerCase(Locale.ROOT);
        if ("vendor".equals(requestedType)) {
            Long vendorId = requireVendor();
            List<Setting> scoped = mapper.findAll("vendor", vendorId);
            Set<String> names = new HashSet<>();
            for (Setting row : scoped) names.add(row.getName());
            List<Setting> visible = new ArrayList<>(scoped);
            for (Setting legacy : mapper.findAllGlobal("vendor")) {
                if (names.add(legacy.getName())) visible.add(legacy);
            }
            return ApiResult.ok(visible);
        }
        if ("outlet".equals(requestedType)) {
            return ApiResult.ok(mapper.findAll("outlet", requireOutlet()));
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported settings scope");
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
            s.setScopeType("vendor");
            s.setScopeId(requireVendor());
            companySettings.putOwned(s.getName(), s.getValue(), s.getDatatype());
            return ApiResult.ok(s);
        }
        String scopeType = s.getScopeType() == null || s.getScopeType().isBlank()
                ? "vendor" : s.getScopeType().trim().toLowerCase(Locale.ROOT);
        s.setScopeType(scopeType);
        if ("vendor".equals(scopeType)) s.setScopeId(requireVendor());
        else if ("outlet".equals(scopeType)) s.setScopeId(requireOutlet());
        else throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported settings scope");
        mapper.upsert(s);
        return ApiResult.ok(s);
    }

    /** updateLoyalty — persists loyalty config as a vendor-scoped setting keyed "loyalty". */
    @PutMapping("/loyalty")
    public ApiResult<Setting> updateLoyalty(@RequestBody LoyaltyRequest body) {
        permissions.requirePermission("settings.store");
        Setting s = new Setting();
        s.setScopeType("vendor");
        s.setScopeId(requireVendor());
        s.setName("loyalty");
        s.setValue(body.loyalty());
        s.setDatatype("json");
        companySettings.putOwned("loyalty", body.loyalty(), "json");
        return ApiResult.ok(s);
    }

    public record LoyaltyRequest(String loyalty) {}

    private Long requireVendor() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "A vendor is required");
        return vendorId;
    }

    private Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "An outlet is required");
        return outletId;
    }
}
