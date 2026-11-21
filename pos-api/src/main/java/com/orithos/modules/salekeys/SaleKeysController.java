package com.orithos.modules.salekeys;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
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
        AuthUser user = requireUser();
        return ApiResult.ok(mapper.findAllByOutlet(user.outletId()));
    }

    @GetMapping("/{id}")
    public ApiResult<SaleKeys> get(@PathVariable Long id) {
        AuthUser user = requireUser();
        return ApiResult.ok(requireSaleKeys(id, user));
    }

    @PostMapping
    public ApiResult<SaleKeys> create(@RequestBody SaleKeys s) {
        permissions.requirePermission("settings.store");
        AuthUser user = requireUser();
        s.setId(null);
        s.setOutletId(user.outletId());
        mapper.insert(s);
        return ApiResult.ok(s);
    }

    @PutMapping("/{id}")
    public ApiResult<SaleKeys> update(@PathVariable Long id, @RequestBody SaleKeys s) {
        permissions.requirePermission("settings.store");
        AuthUser user = requireUser();
        requireSaleKeys(id, user);
        s.setId(id);
        s.setOutletId(user.outletId());
        if (mapper.updateByIdAndOutlet(id, user.outletId(), s.getName(), s.getSaleKeys()) == 0) {
            throw notFound();
        }
        return ApiResult.ok(s);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        AuthUser user = requireUser();
        if (mapper.deleteByIdAndOutlet(id, user.outletId()) == 0) throw notFound();
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    public ApiResult<SaleKeys> clone(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        AuthUser user = requireUser();
        SaleKeys s = mapper.findByIdAndOutlet(id, user.outletId());
        if (s == null) return ApiResult.ok(null);
        s.setId(null);
        s.setOutletId(user.outletId());
        s.setName(s.getName() + " (copy)");
        mapper.insert(s);
        return ApiResult.ok(s);
    }

    private SaleKeys requireSaleKeys(Long id, AuthUser user) {
        SaleKeys saleKeys = mapper.findByIdAndOutlet(id, user.outletId());
        if (saleKeys == null) throw notFound();
        return saleKeys;
    }

    private AuthUser requireUser() {
        AuthUser user = CurrentUser.get();
        if (user == null || user.vendorId() == null || user.outletId() == null) {
            throw new BusinessException(40100, "Authenticated store and outlet are required.");
        }
        return user;
    }

    private BusinessException notFound() {
        return new BusinessException(40400, "Sale key set not found.");
    }
}
