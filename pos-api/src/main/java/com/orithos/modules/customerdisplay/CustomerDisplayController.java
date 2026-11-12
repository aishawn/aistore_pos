package com.orithos.modules.customerdisplay;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/customer-displays")
public class CustomerDisplayController {

    private final CustomerDisplayMapper mapper;
    private final PermissionAccess permissions;

    public CustomerDisplayController(CustomerDisplayMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<CustomerDisplay>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<CustomerDisplay> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<CustomerDisplay> create(@RequestBody CustomerDisplay c) {
        permissions.requirePermission("settings.store");
        mapper.insert(c);
        return ApiResult.ok(c);
    }

    @PutMapping("/{id}")
    public ApiResult<CustomerDisplay> update(@PathVariable Long id, @RequestBody CustomerDisplay c) {
        permissions.requirePermission("settings.store");
        c.setId(id);
        mapper.update(c);
        return ApiResult.ok(c);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    public ApiResult<CustomerDisplay> clone(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        CustomerDisplay c = mapper.findById(id);
        if (c == null) return ApiResult.ok(null);
        c.setName(c.getName() + " (copy)");
        mapper.insert(c);
        return ApiResult.ok(c);
    }
}
