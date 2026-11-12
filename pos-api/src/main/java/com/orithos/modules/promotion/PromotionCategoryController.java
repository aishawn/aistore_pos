package com.orithos.modules.promotion;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/promotion-categories")
public class PromotionCategoryController {

    private final PromotionCategoryMapper mapper;
    private final PermissionAccess permissions;

    public PromotionCategoryController(PromotionCategoryMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<PromotionCategory>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<PromotionCategory> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<PromotionCategory> create(@RequestBody PromotionCategory c) {
        permissions.requirePermission("settings.store");
        if (c.getShowOnOrder() == null) c.setShowOnOrder(false);
        if (c.getIncludeInIntegrations() == null) c.setIncludeInIntegrations(false);
        mapper.insert(c);
        return ApiResult.ok(c);
    }

    @PutMapping("/{id}")
    public ApiResult<PromotionCategory> update(@PathVariable Long id, @RequestBody PromotionCategory c) {
        permissions.requirePermission("settings.store");
        c.setId(id);
        mapper.update(c);
        return ApiResult.ok(c);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        mapper.softDelete(id);
        return ApiResult.ok();
    }
}
