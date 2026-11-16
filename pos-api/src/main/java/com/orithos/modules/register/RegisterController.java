package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import com.orithos.modules.auth.OutletAccessService;
import com.orithos.modules.user.UserService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/registers")
public class RegisterController {

    private final RegisterMapper mapper;
    private final OutletMapper outlets;
    private final PermissionAccess permissions;
    private final OutletAccessService outletAccess;
    private final UserService users;

    public RegisterController(RegisterMapper mapper, OutletMapper outlets, PermissionAccess permissions,
                              OutletAccessService outletAccess, UserService users) {
        this.mapper = mapper;
        this.outlets = outlets;
        this.permissions = permissions;
        this.outletAccess = outletAccess;
        this.users = users;
    }

    @GetMapping
    public ApiResult<List<Register>> list() {
        Long vendorId = requireVendor();
        var user = users.require(CurrentUser.id());
        if (Boolean.TRUE.equals(user.getIsAdmin())) return ApiResult.ok(mapper.findByVendorId(vendorId));
        return ApiResult.ok(user.getOutletId() == null ? List.of() : mapper.findByOutletId(user.getOutletId()));
    }

    @GetMapping("/{id}")
    public ApiResult<Register> get(@PathVariable Long id) {
        return ApiResult.ok(requireRegister(id));
    }

    @PostMapping
    public ApiResult<Register> create(@RequestBody Register r) {
        permissions.requirePermission("settings.store");
        requireOutlet(r.getOutletId());
        if (r.getClosed() == null) r.setClosed(false);
        mapper.insert(r);
        return ApiResult.ok(r);
    }

    @PutMapping("/{id}")
    public ApiResult<Register> update(@PathVariable Long id, @RequestBody Register r) {
        permissions.requirePermission("settings.store");
        requireRegister(id);
        requireOutlet(r.getOutletId());
        r.setId(id);
        mapper.update(r, requireVendor());
        return ApiResult.ok(r);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        requireRegister(id);
        mapper.softDelete(id, requireVendor());
        return ApiResult.ok();
    }

    @PutMapping("/{id}/invoice-number")
    public ApiResult<Void> overrideInvoiceNumber(@PathVariable Long id,
                                                 @RequestBody InvoiceNumberRequest body) {
        permissions.requirePermission("settings.store");
        requireRegister(id);
        mapper.overrideInvoiceNumber(id, requireVendor(), body.invoiceNumber());
        return ApiResult.ok();
    }

    @PutMapping("/{id}/surcharging")
    public ApiResult<Void> updateRegisterSurcharging(@PathVariable Long id,
                                                     @RequestBody SurchargingRequest body) {
        permissions.requirePermission("settings.store");
        requireRegister(id);
        mapper.updateSurcharging(id, requireVendor(), body.surcharging());
        return ApiResult.ok();
    }

    public record InvoiceNumberRequest(String invoiceNumber) {}

    public record SurchargingRequest(String surcharging) {}

    private Register requireRegister(Long id) {
        Register register = mapper.findByIdAndVendor(id, requireVendor());
        if (register == null) throw new BusinessException(40400, "Register not found.");
        outletAccess.requireOutletAccess(register.getOutletId(), users.require(CurrentUser.id()), requireVendor());
        return register;
    }

    private void requireOutlet(Long outletId) {
        if (outletId == null || outlets.findByIdAndVendor(outletId, requireVendor()) == null) {
            throw new BusinessException(40410, "Outlet not found.");
        }
        outletAccess.requireOutletAccess(outletId, users.require(CurrentUser.id()), requireVendor());
    }

    private Long requireVendor() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40100, "Authenticated tenant is required.");
        return vendorId;
    }
}
