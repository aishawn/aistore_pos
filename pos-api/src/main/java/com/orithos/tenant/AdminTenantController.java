package com.orithos.tenant;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import com.orithos.modules.auth.AccountLifecycleService;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.UserMapper;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/admin/tenants")
public class AdminTenantController {

    private static final Set<String> STATUS_VALUES = Set.of("active", "suspended", "expired", "trial");
    private static final Map<String, Set<String>> STATUS_TRANSITIONS = Map.of(
            "active", Set.of("active", "suspended", "expired"),
            "trial", Set.of("trial", "active", "suspended", "expired"),
            "suspended", Set.of("suspended", "active"),
            "expired", Set.of("expired", "active"));

    private final TenantProvisionService provisionService;
    private final PlatformAccessService platformAccess;
    private final VendorMapper vendorMapper;
    private final UserMapper userMapper;
    private final TenantProperties tenantProperties;
    private final AccountLifecycleService accountLifecycle;
    private final OdooTenantProvisioner odooTenantProvisioner;

    public AdminTenantController(TenantProvisionService provisionService,
                                 PlatformAccessService platformAccess,
                                 VendorMapper vendorMapper,
                                 UserMapper userMapper,
                                 TenantProperties tenantProperties,
                                 AccountLifecycleService accountLifecycle,
                                 OdooTenantProvisioner odooTenantProvisioner) {
        this.provisionService = provisionService;
        this.platformAccess = platformAccess;
        this.vendorMapper = vendorMapper;
        this.userMapper = userMapper;
        this.tenantProperties = tenantProperties;
        this.accountLifecycle = accountLifecycle;
        this.odooTenantProvisioner = odooTenantProvisioner;
    }

    public record AdminProvisionRequest(
            @NotBlank String organisationName,
            @NotBlank String subdomain,
            @NotBlank String ownerName,
            @NotBlank String username,
            @NotBlank String email,
            @NotBlank String password,
            String phone,
            Integer trialDays,
            List<TenantProvisionService.OutletSpec> outlets,
            Boolean dummyData
    ) {}

    public record StatusBody(@NotBlank String status) {}

    public record TrialBody(@NotNull @Min(1) @Max(90) Integer days) {}

    public record OdooBindingBody(
            Long odooCompanyId,
            Long odooPosConfigId,
            Long odooWarehouseId,
            Long odooStockLocationId
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
        return ApiResult.ok(toDetail(requireVendor(id)));
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
                        req.trialDays(),
                        req.outlets(),
                        req.dummyData()));
        odooTenantProvisioner.provisionAsyncSafe(result.vendorId(), Boolean.TRUE.equals(req.dummyData()));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vendorId", result.vendorId());
        body.put("subdomain", result.subdomain());
        body.put("redirectHost", result.redirectHost());
        body.put("bootstrapToken", result.bootstrapToken());
        body.put("outletId", result.outletId());
        body.put("userId", result.userId());
        Vendor vendor = vendorMapper.findById(result.vendorId());
        if (vendor != null) {
            body.put("odooBinding", TenantOdooBindingController.toBinding(vendor));
        }
        return ApiResult.ok(body);
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> patchStatus(@PathVariable Long id, @Valid @RequestBody StatusBody body) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = requireVendor(id);
        forbidOperatorLifecycle(vendor);
        forbidDeleted(vendor);
        String status = body.status().trim().toLowerCase(Locale.ROOT);
        if (!STATUS_VALUES.contains(status)) {
            throw new BusinessException(40001, "status must be active, suspended, expired, or trial");
        }
        String currentStatus = vendor.getStatus() == null ? "" : vendor.getStatus().trim().toLowerCase(Locale.ROOT);
        if (!STATUS_TRANSITIONS.getOrDefault(currentStatus, Set.of()).contains(status)) {
            throw new BusinessException(40910, "Cannot change store status from " + currentStatus + " to " + status);
        }
        vendorMapper.updateStatus(id, status);
        return ApiResult.ok(toDetail(requireVendor(id)));
    }

    @PatchMapping("/{id}/trial")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> patchTrial(@PathVariable Long id, @Valid @RequestBody TrialBody body) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = requireVendor(id);
        forbidOperatorLifecycle(vendor);
        forbidDeleted(vendor);
        LocalDateTime ends = LocalDateTime.now().plusDays(body.days());
        String status = "expired".equalsIgnoreCase(vendor.getStatus()) ? "trial" : vendor.getStatus();
        if (status == null || status.isBlank()) status = "trial";
        if ("suspended".equalsIgnoreCase(status)) {
            // keep suspended but still extend trial clock for when reactivated
        } else if (!"active".equalsIgnoreCase(status)) {
            status = "trial";
        }
        vendorMapper.updateTrialEndsAt(id, ends, status);
        return ApiResult.ok(toDetail(requireVendor(id)));
    }

    @PostMapping("/{id}/owner/reset-password")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> resetOwner(@PathVariable Long id) {
        platformAccess.requirePlatformAdmin();
        forbidDeleted(requireVendor(id));
        return ApiResult.ok(accountLifecycle.issueOwnerResetForVendor(id));
    }

    @PostMapping("/{id}/owner/reinvite")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> reinviteOwner(@PathVariable Long id) {
        platformAccess.requirePlatformAdmin();
        forbidDeleted(requireVendor(id));
        return ApiResult.ok(accountLifecycle.reinviteOwnerForVendor(id));
    }

    /** One-time auto-login token for the store owner (platform ops / UAT). Does not change password. */
    @PostMapping("/{id}/owner/bootstrap")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> bootstrapOwner(@PathVariable Long id) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = requireVendor(id);
        forbidDeleted(vendor);
        return ApiResult.ok(accountLifecycle.issueOwnerBootstrapForVendor(vendor.getId()));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    @Transactional
    public ApiResult<Map<String, Object>> deleteTrialStore(@PathVariable Long id) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = requireVendor(id);
        forbidOperatorLifecycle(vendor);
        if ("deleted".equalsIgnoreCase(vendor.getStatus())) {
            return ApiResult.ok(toDetail(vendor));
        }
        if (!"trial".equalsIgnoreCase(vendor.getStatus())) {
            throw new BusinessException(40910, "Only trial stores can be deleted");
        }
        if (vendorMapper.markTrialDeleted(id) != 1) {
            throw new BusinessException(40910, "Store status changed; refresh and try again");
        }
        accountLifecycle.revokeAndDeleteVendorAccounts(id);
        return ApiResult.ok(toDetail(requireVendor(id)));
    }

    @PostMapping("/{id}/odoo-provision")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> reprovisionOdoo(@PathVariable Long id) {
        platformAccess.requirePlatformAdmin();
        forbidDeleted(requireVendor(id));
        try {
            odooTenantProvisioner.provision(id);
        } catch (Exception e) {
            // binding already marked failed; still return detail
        }
        return ApiResult.ok(toDetail(requireVendor(id)));
    }

    @PatchMapping("/{id}/odoo-binding")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> patchOdooBinding(@PathVariable Long id, @RequestBody OdooBindingBody body) {
        platformAccess.requirePlatformAdmin();
        forbidDeleted(requireVendor(id));
        odooTenantProvisioner.linkManual(
                id,
                body.odooCompanyId(),
                body.odooPosConfigId(),
                body.odooWarehouseId(),
                body.odooStockLocationId());
        return ApiResult.ok(toDetail(requireVendor(id)));
    }

    private Vendor requireVendor(Long id) {
        Vendor vendor = vendorMapper.findById(id);
        if (vendor == null) {
            throw new BusinessException(40410, "Store not found");
        }
        return vendor;
    }

    private void forbidOperatorLifecycle(Vendor vendor) {
        if (platformAccess.isPlatformOperatorVendor(vendor)) {
            throw new BusinessException(40910, "Lifecycle changes are not allowed on the platform operator store");
        }
    }

    private void forbidDeleted(Vendor vendor) {
        if ("deleted".equalsIgnoreCase(vendor.getStatus())) {
            throw new BusinessException(40910, "Deleted stores cannot be changed");
        }
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
        body.put("odooProvisionStatus", vendor.getOdooProvisionStatus());
        body.put("odooCompanyId", vendor.getOdooCompanyId());
        return body;
    }

    private Map<String, Object> toDetail(Vendor vendor) {
        Map<String, Object> body = toListItem(vendor);
        body.put("outletId", vendor.getOutletId());
        body.put("url", vendor.getUrl());
        body.put("odooBinding", TenantOdooBindingController.toBinding(vendor));
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
