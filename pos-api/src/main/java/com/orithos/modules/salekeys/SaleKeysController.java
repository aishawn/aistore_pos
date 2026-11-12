package com.orithos.modules.salekeys;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/sale-keys")
public class SaleKeysController {

    private final SaleKeysMapper mapper;
    private final PermissionAccess permissions;

    public SaleKeysController(SaleKeysMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<SaleKeys>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<SaleKeys> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<SaleKeys> create(@RequestBody SaleKeys s) {
        permissions.requirePermission("settings.store");
        mapper.insert(s);
        return ApiResult.ok(s);
    }

    @PutMapping("/{id}")
    public ApiResult<SaleKeys> update(@PathVariable Long id, @RequestBody SaleKeys s) {
        permissions.requirePermission("settings.store");
        s.setId(id);
        mapper.update(s);
        return ApiResult.ok(s);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    public ApiResult<SaleKeys> clone(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        SaleKeys s = mapper.findById(id);
        if (s == null) return ApiResult.ok(null);
        s.setName(s.getName() + " (copy)");
        mapper.insert(s);
        return ApiResult.ok(s);
    }
}
