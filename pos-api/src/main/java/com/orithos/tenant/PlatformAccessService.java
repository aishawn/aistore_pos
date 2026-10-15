package com.orithos.tenant;

import com.orithos.common.BusinessException;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;

/**
 * Gates SaaS-wide tenant management to admins of the configured platform-operator store,
 * and only when the request Host is the control plane (app.* / localhost).
 */
@Service
public class PlatformAccessService {

    private final TenantProperties tenantProperties;
    private final VendorMapper vendorMapper;

    public PlatformAccessService(TenantProperties tenantProperties, VendorMapper vendorMapper) {
        this.tenantProperties = tenantProperties;
        this.vendorMapper = vendorMapper;
    }

    public boolean isPlatformOperatorVendor(Vendor vendor) {
        if (vendor == null || vendor.getSubdomain() == null) return false;
        return tenantProperties.platformOperatorSlugNormalized()
                .equalsIgnoreCase(vendor.getSubdomain().trim());
    }

    /**
     * SaaS-wide platform admin: admin of the configured operator vendor (default {@code demo}).
     * Distinct from store admins created by brand-site / public signup (store-scoped only).
     */
    public boolean isPlatformAdmin(boolean isAdmin, Long vendorId) {
        if (!isAdmin || vendorId == null) return false;
        Vendor platform = vendorMapper.findBySubdomain(tenantProperties.platformOperatorSlugNormalized());
        return platform != null && vendorId.equals(platform.getId());
    }

    public Vendor requirePlatformOperatorVendor() {
        Vendor platform = vendorMapper.findBySubdomain(tenantProperties.platformOperatorSlugNormalized());
        if (platform == null) {
            throw new BusinessException(40410, "Platform operator store is not provisioned");
        }
        return platform;
    }

    public void requirePlatformAdmin() {
        TenantHolder.ResolvedTenant tenant = TenantHolder.get();
        if (tenant == null || !tenant.controlPlane()) {
            throw new BusinessException(40300, "Platform admin is only available on the control plane");
        }
        AuthUser user = CurrentUser.get();
        if (user == null || !isPlatformAdmin(user.admin(), user.vendorId())) {
            throw new BusinessException(40300, "Platform operator access required");
        }
    }
}
