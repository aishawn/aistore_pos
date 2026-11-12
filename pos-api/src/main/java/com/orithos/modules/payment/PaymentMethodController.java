package com.orithos.modules.payment;

import com.orithos.common.ApiResult;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payment-methods")
public class PaymentMethodController {

    private final PaymentMethodMapper mapper;
    private final PermissionAccess permissions;

    public PaymentMethodController(PaymentMethodMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<PaymentMethod>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<PaymentMethod> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<PaymentMethod> create(@RequestBody PaymentMethod p) {
        permissions.requirePermission("settings.store");
        if (p.getName() != null && !p.getName().isBlank() && mapper.findByName(p.getName()) != null) {
            throw new IllegalArgumentException("payment_method_name_exists");
        }
        if (p.getOutletId() == null) {
            Long outletId = CurrentUser.outletId();
            p.setOutletId(outletId != null ? outletId : 1L);
        }
        mapper.insert(p);
        return ApiResult.ok(p);
    }

    @PutMapping("/{id}")
    public ApiResult<PaymentMethod> update(@PathVariable Long id, @RequestBody PaymentMethod p) {
        permissions.requirePermission("settings.store");
        p.setId(id);
        mapper.update(p);
        return ApiResult.ok(p);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        mapper.softDelete(id);
        return ApiResult.ok();
    }
}
