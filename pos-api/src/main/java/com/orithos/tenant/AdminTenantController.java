package com.orithos.tenant;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.UserMapper;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/tenants")
public class AdminTenantController {

    private final TenantProvisionService provisionService;
    private final PlatformAccessService platformAccess;
    private final VendorMapper vendorMapper;
    private final UserMapper userMapper;
    private final TenantProperties tenantProperties;

    public AdminTenantController(TenantProvisionService provisionService,
                                 PlatformAccessService platformAccess,
                                 VendorMapper vendorMapper,
                                 UserMapper userMapper,
                                 TenantProperties tenantProperties) {
        this.provisionService = provisionService;
        this.platformAccess = platformAccess;
        this.vendorMapper = vendorMapper;
        this.userMapper = userMapper;
        this.tenantProperties = tenantProperties;
    }

    public record AdminProvisionRequest(
            @NotBlank String organisationName,
            @NotBlank String subdomain,
            @NotBlank String ownerName,
            @NotBlank String username,
            @NotBlank String email,
            @NotBlank String password,
            String phone,
            Integer trialDays
    ) {}

    @GetMapping
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<PageResult<Map<String, Object>>> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        platformAccess.requirePlatformAdmin();
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        int offset = (safePage - 1) * safeSize;
        String query = blankToNull(q);
        String statusFilter = blankToNull(status);
        if (statusFilter != null) {
            statusFilter = statusFilter.toLowerCase(Locale.ROOT);
        }
        List<Vendor> vendors = vendorMapper.page(query, statusFilter, safeSize, offset);
        long total = vendorMapper.countFiltered(query, statusFilter);
        List<Map<String, Object>> items = vendors.stream().map(this::toListItem).toList();
        return ApiResult.ok(PageResult.of(items, total, safePage, safeSize));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> get(@PathVariable Long id) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = vendorMapper.findById(id);
        if (vendor == null) {
            throw new BusinessException(40410, "Store not found");
        }
        return ApiResult.ok(toDetail(vendor));
    }

    @PostMapping
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> create(@Valid @RequestBody AdminProvisionRequest req) {
        platformAccess.requirePlatformAdmin();
        TenantProvisionService.ProvisionResult result = provisionService.provision(
                new TenantProvisionService.ProvisionRequest(
                        req.organisationName(),
                        req.subdomain(),
                        req.ownerName(),
                        req.username(),
                        req.email(),
                        req.password(),
                        req.phone(),
                        req.trialDays()));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vendorId", result.vendorId());
        body.put("subdomain", result.subdomain());
        body.put("redirectHost", result.redirectHost());
        body.put("bootstrapToken", result.bootstrapToken());
        body.put("outletId", result.outletId());
        body.put("userId", result.userId());
        return ApiResult.ok(body);
    }

    private Map<String, Object> toListItem(Vendor vendor) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", vendor.getId());
        body.put("name", vendor.getName());
        body.put("subdomain", vendor.getSubdomain());
        body.put("status", vendor.getStatus());
        body.put("contactName", vendor.getContactName());
        body.put("storeUrl", storeUrl(vendor));
        body.put("trialEndsAt", vendor.getTrialEndsAt());
        body.put("createdAt", vendor.getCreatedAt());
        body.put("platformOperator", platformAccess.isPlatformOperatorVendor(vendor));
        return body;
    }

    private Map<String, Object> toDetail(Vendor vendor) {
        Map<String, Object> body = toListItem(vendor);
        body.put("outletId", vendor.getOutletId());
        body.put("url", vendor.getUrl());
        User owner = vendor.getId() == null ? null : userMapper.findPrimaryByVendor(vendor.getId());
        if (owner != null) {
            Map<String, Object> ownerBody = new LinkedHashMap<>();
            ownerBody.put("id", owner.getId());
            ownerBody.put("username", owner.getUsername());
            ownerBody.put("name", owner.getName());
            ownerBody.put("email", owner.getEmail());
            ownerBody.put("isAdmin", Boolean.TRUE.equals(owner.getIsAdmin()));
            body.put("owner", ownerBody);
        } else {
            body.put("owner", null);
        }
        return body;
    }

    private String storeUrl(Vendor vendor) {
        if (vendor.getSubdomain() == null || vendor.getSubdomain().isBlank()) return null;
        return tenantProperties.storeUrl(vendor.getSubdomain());
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
