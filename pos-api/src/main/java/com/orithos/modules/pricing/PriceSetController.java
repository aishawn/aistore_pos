package com.orithos.modules.pricing;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/price-sets")
public class PriceSetController {

    private final PriceSetMapper mapper;
    private final PermissionAccess permissions;

    public PriceSetController(PriceSetMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<PriceSet>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<PriceSet> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<PriceSet> create(@RequestBody PriceSet p) {
        permissions.requirePermission("settings.store");
        mapper.insert(p);
        return ApiResult.ok(p);
    }

    @PutMapping("/{id}")
    public ApiResult<PriceSet> update(@PathVariable Long id, @RequestBody PriceSet p) {
        permissions.requirePermission("settings.store");
        p.setId(id);
        mapper.update(p);
        return ApiResult.ok(p);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    public ApiResult<PriceSet> clone(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        PriceSet p = mapper.findById(id);
        if (p == null) return ApiResult.ok(null);
        p.setName(p.getName() + " (copy)");
        mapper.insert(p);
        return ApiResult.ok(p);
    }
}
