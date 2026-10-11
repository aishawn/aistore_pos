package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/settings")
public class SettingController {

    private final SettingMapper mapper;

    public SettingController(SettingMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<Setting>> list(@RequestParam(required = false) String scopeType,
                                         @RequestParam(required = false) Long scopeId) {
        return ApiResult.ok(mapper.findAll(scopeType, scopeId));
    }

    @PutMapping
    public ApiResult<Setting> upsert(@RequestBody Setting s) {
        mapper.upsert(s);
        return ApiResult.ok(s);
    }

    /** updateLoyalty — persists loyalty config as a vendor-scoped setting keyed "loyalty". */
    @PutMapping("/loyalty")
    public ApiResult<Setting> updateLoyalty(@RequestBody LoyaltyRequest body) {
        Setting s = new Setting();
        s.setScopeType("vendor");
        s.setScopeId(null);
        s.setName("loyalty");
        s.setValue(body.loyalty());
        s.setDatatype("json");
        mapper.upsert(s);
        return ApiResult.ok(s);
    }

    public record LoyaltyRequest(String loyalty) {}
}
