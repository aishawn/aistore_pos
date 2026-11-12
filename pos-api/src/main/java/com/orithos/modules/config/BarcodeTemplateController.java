package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/barcode-templates")
public class BarcodeTemplateController {

    private final BarcodeTemplateMapper mapper;
    private final PermissionAccess permissions;

    public BarcodeTemplateController(BarcodeTemplateMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<BarcodeTemplate>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @PostMapping
    public ApiResult<BarcodeTemplate> create(@RequestBody BarcodeTemplate b) {
        permissions.requirePermission("settings.store");
        if (b.getRecalculateQuantity() == null) b.setRecalculateQuantity(false);
        mapper.insert(b);
        return ApiResult.ok(b);
    }

    @PutMapping("/{id}")
    public ApiResult<BarcodeTemplate> update(@PathVariable Long id, @RequestBody BarcodeTemplate b) {
        permissions.requirePermission("settings.store");
        b.setId(id);
        mapper.update(b);
        return ApiResult.ok(b);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        mapper.delete(id);
        return ApiResult.ok();
    }
}
