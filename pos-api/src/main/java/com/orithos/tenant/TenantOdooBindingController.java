package com.orithos.tenant;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/tenant")
public class TenantOdooBindingController {

    private final VendorMapper vendorMapper;

    public TenantOdooBindingController(VendorMapper vendorMapper) {
        this.vendorMapper = vendorMapper;
    }

    @GetMapping("/odoo-binding")
    @PreAuthorize("isAuthenticated()")
    public ApiResult<Map<String, Object>> currentBinding() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) {
            TenantHolder.ResolvedTenant tenant = TenantHolder.get();
            if (tenant != null && tenant.vendor() != null) {
                vendorId = tenant.vendor().getId();
            }
        }
        if (vendorId == null) {
            throw new BusinessException(40100, "Unauthorized");
        }
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) {
            throw new BusinessException(40410, "Store not found");
        }
        return ApiResult.ok(toBinding(vendor));
    }

    static Map<String, Object> toBinding(Vendor vendor) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vendorId", vendor.getId());
        body.put("subdomain", vendor.getSubdomain());
        body.put("odooCompanyId", vendor.getOdooCompanyId());
        body.put("odooPosConfigId", vendor.getOdooPosConfigId());
        body.put("odooWarehouseId", vendor.getOdooWarehouseId());
        body.put("odooStockLocationId", vendor.getOdooStockLocationId());
        body.put("odooProvisionStatus", vendor.getOdooProvisionStatus() == null ? "unmapped" : vendor.getOdooProvisionStatus());
        body.put("odooProvisionError", vendor.getOdooProvisionError());
        body.put("r2Prefix", vendor.getR2Prefix());
        return body;
    }
}
