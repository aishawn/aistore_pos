package com.orithos.modules.register;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.security.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/outlets")
public class OutletController {

    private final OutletMapper mapper;

    public OutletController(OutletMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ApiResult<List<Outlet>> list() {
        Long vendorId = requireVendor();
        return ApiResult.ok(mapper.findByVendorId(vendorId));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ApiResult<Outlet> get(@PathVariable Long id) {
        Outlet outlet = mapper.findById(id);
        if (outlet == null || !requireVendor().equals(outlet.getVendorId())) throw new BusinessException(40410, "Outlet not found");
        return ApiResult.ok(outlet);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Outlet> create(@RequestBody Outlet o) {
        o.setVendorId(requireVendor());
        if (o.getLoyaltyEnabled() == null) o.setLoyaltyEnabled(false);
        if (o.getHasKitchenScreen() == null) o.setHasKitchenScreen(false);
        mapper.insert(o);
        return ApiResult.ok(o);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Outlet> update(@PathVariable Long id, @RequestBody Outlet o) {
        Outlet existing = mapper.findById(id);
        if (existing == null || !requireVendor().equals(existing.getVendorId())) throw new BusinessException(40410, "Outlet not found");
        o.setId(id);
        o.setVendorId(existing.getVendorId());
        mapper.update(o);
        return ApiResult.ok(o);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Void> delete(@PathVariable Long id) {
        Outlet existing = mapper.findById(id);
        if (existing == null || !requireVendor().equals(existing.getVendorId())) throw new BusinessException(40410, "Outlet not found");
        mapper.softDelete(id);
        return ApiResult.ok();
    }

    private Long requireVendor() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40100, "Unauthorized");
        return vendorId;
    }
}
