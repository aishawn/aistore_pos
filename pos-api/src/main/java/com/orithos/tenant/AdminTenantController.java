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
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Supplier;

@RestController
@RequestMapping("/api/admin/tenants")
public class AdminTenantController {

    private static final Logger log = LoggerFactory.getLogger(AdminTenantController.class);

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

    @Autowired
    private PlatformAdminAuditService adminAudit;
    @Autowired
    private TenantProvisionAttemptService provisionAttempts;

    public AdminTenantController(TenantProvisionService provisionService,
                                 PlatformAccessService platformAccess,
                                 VendorMapper vendorMapper,
                                 UserMapper userMapper,
                                 TenantProperties tenantProperties,
                                 AccountLifecycleService accountLifecycle) {
        this.provisionService = provisionService;
        this.platformAccess = platformAccess;
        this.vendorMapper = vendorMapper;
        this.userMapper = userMapper;
        this.tenantProperties = tenantProperties;
        this.accountLifecycle = accountLifecycle;
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

    public record StatusBody(@NotBlank String status, String reason) {
        public StatusBody(String status) { this(status, null); }
    }

    public record TrialBody(@NotNull @Min(1) @Max(90) Integer days, String reason) {
        public TrialBody(Integer days) { this(days, null); }
    }

    public record ReasonBody(String reason) {}

    @GetMapping("/{id}/audit")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<PageResult<PlatformAdminAuditEntry>> auditHistory(
            @PathVariable Long id,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        platformAccess.requirePlatformAdmin();
        requireVendor(id);
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        return ApiResult.ok(PageResult.of(adminAudit.pageForTenant(id, safePage, safeSize),
                adminAudit.countForTenant(id), safePage, safeSize));
    }

    @GetMapping("/{id}/provision-attempts")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<PageResult<TenantProvisionAttemptDetails>> provisionAttempts(
            @PathVariable Long id,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size) {
        platformAccess.requirePlatformAdmin();
        requireVendor(id);
        int safePage = Math.max(1, page);
        int safeSize = Math.min(50, Math.max(1, size));
        return ApiResult.ok(PageResult.of(provisionAttempts.pageForTenant(id, safePage, safeSize),
                provisionAttempts.countForTenant(id), safePage, safeSize));
    }

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
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("vendorId", result.vendorId());
        body.put("subdomain", result.subdomain());
        body.put("redirectHost", result.redirectHost());
        body.put("bootstrapToken", result.bootstrapToken());
        body.put("outletId", result.outletId());
        body.put("userId", result.userId());
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
        String fromStatus = currentStatus;
        String toStatus = status;
        return ApiResult.ok(audited(vendor, "TENANT_STATUS_CHANGED", "vendor", String.valueOf(id), body.reason(),
                summary("status", fromStatus), () -> {
                    if (vendorMapper.updateStatusIfCurrent(id, toStatus, fromStatus) != 1) {
                        throw new BusinessException(40910, "Store status changed; refresh and try again");
                    }
                    return toDetail(requireVendor(id));
                }, result -> summary("status", result.get("status"))));
    }

    @PatchMapping("/{id}/trial")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> patchTrial(@PathVariable Long id, @Valid @RequestBody TrialBody body) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = requireVendor(id);
        forbidOperatorLifecycle(vendor);
        forbidDeleted(vendor);
        LocalDateTime ends = LocalDateTime.now().plusDays(body.days());
        String currentStatus = vendor.getStatus() == null ? "" : vendor.getStatus().trim().toLowerCase(Locale.ROOT);
        String status = "expired".equalsIgnoreCase(currentStatus) ? "trial" : vendor.getStatus();
        if (status == null || status.isBlank()) status = "trial";
        if ("suspended".equalsIgnoreCase(status)) {
            // keep suspended but still extend trial clock for when reactivated
        } else if (!"active".equalsIgnoreCase(status)) {
            status = "trial";
        }
        String nextStatus = status;
        return ApiResult.ok(audited(vendor, "TENANT_TRIAL_EXTENDED", "vendor", String.valueOf(id), body.reason(),
                summary("status", currentStatus, "trialEndsAt", vendor.getTrialEndsAt()), () -> {
                    if (vendorMapper.updateTrialEndsAtIfCurrent(id, ends, nextStatus, currentStatus) != 1) {
                        throw new BusinessException(40910, "Store status changed; refresh and try again");
                    }
                    return toDetail(requireVendor(id));
                }, result -> summary("status", result.get("status"), "trialEndsAt", result.get("trialEndsAt"))));
    }

    @PostMapping("/{id}/owner/reset-password")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> resetOwner(@PathVariable Long id,
                                                     @RequestBody(required = false) ReasonBody body) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = requireVendor(id);
        forbidDeleted(vendor);
        User owner = userMapper.findPrimaryByVendor(id);
        return ApiResult.ok(audited(vendor, "OWNER_RESET_ISSUED", "store_owner", ownerId(vendor), reason(body),
                summary("pendingPasswordReset", owner == null ? null : owner.getPendingPasswordReset()),
                () -> accountLifecycle.issueOwnerResetForVendor(id),
                result -> summary("pendingPasswordReset", true, "emailSent", result.get("emailSent"))));
    }

    public ApiResult<Map<String, Object>> resetOwner(Long id) {
        return resetOwner(id, null);
    }

    @PostMapping("/{id}/owner/reinvite")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> reinviteOwner(@PathVariable Long id,
                                                         @RequestBody(required = false) ReasonBody body) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = requireVendor(id);
        forbidDeleted(vendor);
        return ApiResult.ok(audited(vendor, "OWNER_REINVITED", "store_owner", ownerId(vendor), reason(body),
                summary("ownerExists", true),
                () -> accountLifecycle.reinviteOwnerForVendor(id),
                result -> summary("ownerExists", true, "emailSent", result.get("emailSent"))));
    }

    /** One-time auto-login token for the store owner (platform ops / UAT). Does not change password. */
    @PostMapping("/{id}/owner/bootstrap")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ApiResult<Map<String, Object>> bootstrapOwner(@PathVariable Long id,
                                                          @RequestBody(required = false) ReasonBody body) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = requireVendor(id);
        forbidDeleted(vendor);
        return ApiResult.ok(audited(vendor, "OWNER_BOOTSTRAP_ISSUED", "store_owner", ownerId(vendor), reason(body),
                summary("ownerExists", true),
                () -> accountLifecycle.issueOwnerBootstrapForVendor(vendor.getId()),
                result -> summary("ownerExists", true, "tokenIssued", result.containsKey("bootstrapToken"))));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    @Transactional
    public ApiResult<Map<String, Object>> deleteTrialStore(@PathVariable Long id,
                                                            @RequestBody(required = false) ReasonBody body) {
        platformAccess.requirePlatformAdmin();
        Vendor vendor = requireVendor(id);
        forbidOperatorLifecycle(vendor);
        if (!"trial".equalsIgnoreCase(vendor.getStatus())) {
            throw new BusinessException(40910, "Only trial stores can be deleted");
        }
        return ApiResult.ok(audited(vendor, "TRIAL_TENANT_DELETED", "vendor", String.valueOf(id), reason(body),
                summary("status", vendor.getStatus()), () -> {
                    if (vendorMapper.markTrialDeleted(id) != 1) {
                        throw new BusinessException(40910, "Store status changed; refresh and try again");
                    }
                    accountLifecycle.revokeAndDeleteVendorAccounts(id);
                    return toDetail(requireVendor(id));
                }, result -> summary("status", result.get("status"))));
    }

    public ApiResult<Map<String, Object>> deleteTrialStore(Long id) {
        return deleteTrialStore(id, null);
    }

    private <T> T audited(Vendor tenant, String action, String targetType, String targetId,
                          String reason, Map<String, ?> before, Supplier<T> operation,
                          Function<T, Map<String, ?>> after) {
        if (adminAudit == null) return operation.get();
        String eventId = adminAudit.begin(tenant, action, targetType, targetId, reason, before);
        try {
            T result = operation.get();
            Map<String, ?> afterSummary = after.apply(result);
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        completeAudit(eventId, action, afterSummary);
                    }

                    @Override
                    public void afterCompletion(int status) {
                        if (status == STATUS_ROLLED_BACK) {
                            failAudit(eventId, action, null, "TransactionRolledBack");
                        }
                    }
                });
            } else {
                completeAudit(eventId, action, afterSummary);
            }
            return result;
        } catch (RuntimeException operationError) {
            failAudit(eventId, action, PlatformAdminAuditService.errorCode(operationError),
                    operationError.getClass().getSimpleName());
            throw operationError;
        }
    }

    private void completeAudit(String eventId, String action, Map<String, ?> after) {
        try {
            adminAudit.succeeded(eventId, after);
        } catch (RuntimeException auditError) {
            log.error("Platform audit event completion failed eventId={} action={}", eventId, action);
        }
    }

    private void failAudit(String eventId, String action, Integer errorCode, String errorType) {
        try {
            adminAudit.failed(eventId, errorCode, errorType);
        } catch (RuntimeException auditError) {
            log.error("Platform audit failure recording failed eventId={} action={}", eventId, action);
        }
    }

    private static Map<String, Object> summary(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) result.put((String) values[i], values[i + 1]);
        return result;
    }

    private String ownerId(Vendor vendor) {
        User owner = userMapper.findPrimaryByVendor(vendor.getId());
        return owner == null ? null : String.valueOf(owner.getId());
    }

    private static String reason(ReasonBody body) { return body == null ? null : body.reason(); }
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
