package com.orithos.modules.payment;

import com.orithos.common.ApiResult;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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
        return ApiResult.ok(mapper.findAll(requireOutlet()));
    }

    @GetMapping("/{id}")
    public ApiResult<PaymentMethod> get(@PathVariable Long id) {
        PaymentMethod method = mapper.findById(id, requireOutlet());
        if (method == null) throw notFound();
        return ApiResult.ok(method);
    }

    @PostMapping
    public ApiResult<PaymentMethod> create(@RequestBody PaymentMethod p) {
        permissions.requirePermission("settings.store");
        Long outletId = requireOutlet();
        if (p.getName() != null && !p.getName().isBlank() && mapper.findByName(p.getName(), outletId) != null) {
            throw new IllegalArgumentException("payment_method_name_exists");
        }
        p.setOutletId(outletId);
        mapper.insert(p);
        return ApiResult.ok(p);
    }

    @PutMapping("/{id}")
    public ApiResult<PaymentMethod> update(@PathVariable Long id, @RequestBody PaymentMethod p) {
        permissions.requirePermission("settings.store");
        Long outletId = requireOutlet();
        p.setId(id);
        p.setOutletId(outletId);
        if (mapper.update(p, outletId) != 1) throw notFound();
        return ApiResult.ok(p);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        if (mapper.softDelete(id, requireOutlet()) != 1) throw notFound();
        return ApiResult.ok();
    }

    private Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "An outlet is required");
        return outletId;
    }

    private ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment method not found");
    }
}
