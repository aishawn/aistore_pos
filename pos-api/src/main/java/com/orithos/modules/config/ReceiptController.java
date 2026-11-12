package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/receipts")
public class ReceiptController {

    private final ReceiptMapper mapper;
    private final PermissionAccess permissions;

    public ReceiptController(ReceiptMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<Receipt>> list(@RequestParam(required = false) String type) {
        return ApiResult.ok(mapper.findAll(type));
    }

    @GetMapping("/{id}")
    public ApiResult<Receipt> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<Receipt> create(@RequestBody Receipt r) {
        permissions.requirePermission("settings.store");
        if (r.getAccountReceipt() == null) r.setAccountReceipt(false);
        mapper.insert(r);
        return ApiResult.ok(r);
    }

    @PutMapping("/{id}")
    public ApiResult<Receipt> update(@PathVariable Long id, @RequestBody Receipt r) {
        permissions.requirePermission("settings.store");
        r.setId(id);
        mapper.update(r);
        return ApiResult.ok(r);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    public ApiResult<Receipt> clone(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        Receipt r = mapper.findById(id);
        if (r == null) return ApiResult.ok(null);
        r.setName(r.getName() + " (copy)");
        mapper.insert(r);
        return ApiResult.ok(r);
    }
}
