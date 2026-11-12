package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/outlets")
public class OutletController {

    private final OutletMapper mapper;
    private final PermissionAccess permissions;

    public OutletController(OutletMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<Outlet>> list() {
        Long vendorId = requireVendor();
        return ApiResult.ok(mapper.findByVendorId(vendorId));
    }

    @GetMapping("/{id}")
    public ApiResult<Outlet> get(@PathVariable Long id) {
        Outlet outlet = mapper.findByIdAndVendor(id, requireVendor());
        if (outlet == null) throw new BusinessException(40410, "Outlet not found");
        return ApiResult.ok(outlet);
    }

    @PostMapping
    public ApiResult<Outlet> create(@RequestBody Outlet o) {
        permissions.requirePermission("settings.store");
        o.setVendorId(requireVendor());
        if (o.getLoyaltyEnabled() == null) o.setLoyaltyEnabled(false);
        if (o.getHasKitchenScreen() == null) o.setHasKitchenScreen(false);
        mapper.insert(o);
        return ApiResult.ok(o);
    }

    @PutMapping("/{id}")
    public ApiResult<Outlet> update(@PathVariable Long id, @RequestBody Outlet o) {
        permissions.requirePermission("settings.store");
        Outlet existing = mapper.findByIdAndVendor(id, requireVendor());
        if (existing == null) throw new BusinessException(40410, "Outlet not found");
        o.setId(id);
        o.setVendorId(existing.getVendorId());
        mapper.update(o, existing.getVendorId());
        return ApiResult.ok(o);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        Outlet existing = mapper.findByIdAndVendor(id, requireVendor());
        if (existing == null) throw new BusinessException(40410, "Outlet not found");
        mapper.softDelete(id, existing.getVendorId());
        return ApiResult.ok();
    }

    private Long requireVendor() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40100, "Unauthorized");
        return vendorId;
    }
}
