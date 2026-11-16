package com.orithos.modules.account;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.auth.OutletAccessService;
import com.orithos.modules.user.UserService;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.CurrentUser;
import com.orithos.tenant.TenantHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Account-scoped store list. Today each user belongs to one vendor; response shape
 * matches a future {@code user_vendor_membership} multi-store portal.
 */
@RestController
@RequestMapping("/api/account")
public class AccountStoresController {

    private final UserService userService;
    private final VendorMapper vendorMapper;

    public AccountStoresController(UserService userService, VendorMapper vendorMapper) {
        this.userService = userService;
        this.vendorMapper = vendorMapper;
    }

    @GetMapping("/stores")
    public ApiResult<Map<String, Object>> listAccessibleStores() {
        Long userId = CurrentUser.id();
        if (userId == null) {
            throw new BusinessException(40100, "Unauthorized");
        }
        User user = userService.require(userId);
        if (user.getVendorId() == null) {
            throw new BusinessException(40001, "No store is linked to this account");
        }
        Vendor vendor = vendorMapper.findById(user.getVendorId());
        if (vendor == null) {
            throw new BusinessException(40410, "Store not found");
        }
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("vendorId", vendor.getId());
        entry.put("slug", vendor.getSubdomain());
        entry.put("name", vendor.getName());
        entry.put("url", vendor.getUrl());
        entry.put("role", Boolean.TRUE.equals(user.getIsAdmin()) ? "admin" : "staff");
        entry.put("defaultOutletId", user.getOutletId());
        List<Map<String, Object>> stores = new ArrayList<>();
        stores.add(entry);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("stores", stores);
        body.put("multiVendorMembershipEnabled", false);
        TenantHolder.ResolvedTenant tenant = TenantHolder.get();
        if (tenant != null && !tenant.controlPlane() && tenant.slug() != null) {
            body.put("activeSlug", tenant.slug());
        }
        return ApiResult.ok(body);
    }
}