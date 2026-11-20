package com.orithos.modules.auth;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.auth.dto.ChangePasswordRequest;
import com.orithos.modules.auth.dto.ForgotPasswordRequest;
import com.orithos.modules.auth.dto.InviteUserRequest;
import com.orithos.modules.auth.dto.LoginRequest;
import com.orithos.modules.auth.dto.ResetPasswordRequest;
import com.orithos.modules.auth.dto.TokenResponse;
import com.orithos.modules.auth.dto.WorkContextRequest;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.user.UserService;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.AccountTokenStore;
import com.orithos.security.AdminAccess;
import com.orithos.security.CurrentUser;
import com.orithos.security.JwtProperties;
import com.orithos.security.JwtService;
import com.orithos.security.PermissionAccess;
import com.orithos.security.TokenStore;
import com.orithos.tenant.PlatformAccessService;
import com.orithos.tenant.TenantHolder;
import com.orithos.tenant.TenantProperties;
import com.orithos.tenant.TenantResolverFilter;
import com.orithos.tenant.TenantSlugParser;
import com.orithos.tenant.TenantShardRegistry;
import org.springframework.beans.factory.annotation.Autowired;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;
    private final JwtService jwtService;
    private final TokenStore tokenStore;
    private final JwtProperties props;
    private final AccountLifecycleService accountLifecycle;
    private final VendorMapper vendorMapper;
    private final TenantSlugParser slugParser;
    private final TenantProperties tenantProperties;
    private final AccountTokenStore accountTokenStore;
    private final PlatformAccessService platformAccess;
    private final PermissionAccess permissionAccess;
    private final OutletAccessService outletAccess;
    private TenantShardRegistry tenantShardRegistry;
    private CompanySettingsService companySettings;

    public AuthController(UserService userService, JwtService jwtService,
                          TokenStore tokenStore, JwtProperties props,
                          AccountLifecycleService accountLifecycle,
                          VendorMapper vendorMapper, TenantSlugParser slugParser,
                          TenantProperties tenantProperties,
                          AccountTokenStore accountTokenStore,
                          PlatformAccessService platformAccess,
                          PermissionAccess permissionAccess,
                          OutletAccessService outletAccess) {
        this.userService = userService;
        this.jwtService = jwtService;
        this.tokenStore = tokenStore;
        this.props = props;
        this.accountLifecycle = accountLifecycle;
        this.vendorMapper = vendorMapper;
        this.slugParser = slugParser;
        this.tenantProperties = tenantProperties;
        this.accountTokenStore = accountTokenStore;
        this.platformAccess = platformAccess;
        this.permissionAccess = permissionAccess;
        this.outletAccess = outletAccess;
    }

    @Autowired(required = false)
    public void setTenantShardRegistry(TenantShardRegistry tenantShardRegistry) {
        this.tenantShardRegistry = tenantShardRegistry;
    }

    @Autowired(required = false)
    public void setCompanySettings(CompanySettingsService companySettings) {
        this.companySettings = companySettings;
    }

    @PostMapping("/login")
    public ApiResult<TokenResponse> login(@Valid @RequestBody LoginRequest req) {
        TenantHolder.ResolvedTenant requestTenant = TenantHolder.get();
        boolean onControlPlane = requestTenant == null || requestTenant.controlPlane();
        Vendor vendor = resolveLoginVendor(req.subdomain());
        if (TenantResolverFilter.isUnavailable(vendor)) {
            throw new BusinessException(40200, "This trial or store is no longer available");
        }
        routeToVendor(vendor);
        String requirePasswordValue = companySettings == null ? "true" : companySettings.getString(
                CompanySettingsKeys.LOGIN_REQUIRE_PASSWORD, vendor.getId(), "true");
        boolean requirePassword = onControlPlane || loginRequiresPassword(requirePasswordValue);
        User u = userService.authenticate(vendor.getId(), req.username(), req.password(), requirePassword);
        if (u.getOutletId() == null) {
            throw new BusinessException(40104, "User is not bound to an outlet");
        }
        String redirectHost = tenantProperties.storeUrl(vendor.getSubdomain());
        if (onControlPlane && platformAccess.isPlatformOperatorVendor(vendor)
                && Boolean.TRUE.equals(u.getIsAdmin())) {
            // Platform operators stay on app.* so they can manage all stores.
            TokenResponse tokens = issueTokens(u);
            return ApiResult.ok(new TokenResponse(
                    tokens.accessToken(), tokens.refreshToken(), tokens.expiresIn(), tokens.user(),
                    null, null));
        }
        if (onControlPlane) {
            // Cookies set on app.* cannot be read on {slug}.* — hand off via one-time token.
            String bootstrap = accountTokenStore.issue(
                    u.getId(), AccountTokenStore.PURPOSE_BOOTSTRAP, java.time.Duration.ofMinutes(5));
            var info = userInfo(u);
            return ApiResult.ok(new TokenResponse(null, null, 0, info, redirectHost, bootstrap));
        }
        TokenResponse tokens = issueTokens(u);
        return ApiResult.ok(new TokenResponse(
                tokens.accessToken(), tokens.refreshToken(), tokens.expiresIn(), tokens.user(),
                redirectHost, null));
    }

    @GetMapping("/staff")
    public ApiResult<LoginStaffResponse> loginStaff() {
        TenantHolder.ResolvedTenant tenant = TenantHolder.get();
        if (tenant == null || tenant.controlPlane() || tenant.vendor() == null) {
            throw new BusinessException(40001, "Staff selection is available on a store login page");
        }
        routeToVendor(tenant.vendor());
        String required = companySettings == null ? "true" : companySettings.getString(
                CompanySettingsKeys.LOGIN_REQUIRE_PASSWORD, tenant.vendorId(), "true");
        boolean requirePassword = loginRequiresPassword(required);
        return ApiResult.ok(new LoginStaffResponse(userService.loginOptions(tenant.vendorId()), requirePassword));
    }

    public record LoginStaffResponse(List<com.orithos.modules.user.mapper.LoginStaffOption> staff,
                                    boolean requirePassword) {}

    private static boolean loginRequiresPassword(String value) {
        return !("false".equalsIgnoreCase(value) || "0".equals(value) || "no".equalsIgnoreCase(value));
    }

    @PostMapping("/bootstrap")
    public ApiResult<TokenResponse> bootstrap(@RequestBody Map<String, String> body) {
        if (tenantShardRegistry != null) {
            TenantHolder.ResolvedTenant requestTenant = TenantHolder.get();
            if (requestTenant == null || requestTenant.controlPlane() || requestTenant.shardKey() == null) {
                throw new BusinessException(40001, "Bootstrap must be completed on the assigned store domain");
            }
        }
        String token = body == null ? null : body.get("token");
        if (token == null || token.isBlank()) {
            throw new BusinessException(40001, "Missing bootstrap token");
        }
        Long userId = accountTokenStore.consume(token, AccountTokenStore.PURPOSE_BOOTSTRAP);
        if (userId == null) {
            throw new BusinessException(40103, "Bootstrap token expired or invalid");
        }
        User u = userService.require(userId);
        TenantHolder.ResolvedTenant tenant = TenantHolder.get();
        if (tenant != null && !tenant.controlPlane()) {
            if (u.getVendorId() == null || !u.getVendorId().equals(tenant.vendorId())) {
                throw new BusinessException(40310, "Bootstrap token does not belong to this store");
            }
        }
        if (u.getOutletId() == null) {
            throw new BusinessException(40104, "User is not bound to an outlet");
        }
        return ApiResult.ok(issueTokens(u));
    }

    @PostMapping("/refresh")
    public ApiResult<TokenResponse> refresh(@RequestBody Map<String, String> body) {
        String refreshToken = body.get("refreshToken");
        if (refreshToken == null) throw new BusinessException(40102, "Missing refreshToken");
        Claims claims;
        try {
            claims = jwtService.parse(refreshToken);
        } catch (Exception e) {
            throw new BusinessException(40103, "Invalid refresh token");
        }
        Long userId = Long.parseLong(claims.getSubject());
        String sessionId = claims.get("sid", String.class);
        Long sessionVersion = JwtService.claimAsLong(claims, "sessionVersion");
        if (!"refresh".equals(claims.get("type", String.class))
                || !tokenStore.refreshValid(userId, sessionId, claims.getId(), sessionVersion)) {
            throw new BusinessException(40103, "Refresh token expired or revoked");
        }
        routeRefreshContext();
        User u = userService.require(userId);
        if (u.getOutletId() == null) {
            throw new BusinessException(40104, "User is not bound to an outlet");
        }
        if (u.getVendorId() != null) {
            Vendor vendor = vendorMapper.findById(u.getVendorId());
            if (TenantResolverFilter.isUnavailable(vendor)) {
                tokenStore.revokeRefresh(userId);
                throw new BusinessException(40323, "This trial or store is no longer available");
            }
        }
        // Rotate refresh tokens so active sessions keep their sliding expiry.
        Long sessionOutletId = JwtService.claimAsLong(claims, "outletId");
        if (sessionOutletId == null) sessionOutletId = u.getOutletId();
        outletAccess.requireOutletAccess(sessionOutletId, u, u.getVendorId());
        return ApiResult.ok(issueTokens(u, sessionOutletId, sessionId));
    }

    @PostMapping("/logout")
    public ApiResult<Void> logout(@RequestHeader(value = "Authorization", required = false) String header) {
        if (header != null && header.startsWith("Bearer ")) {
            try {
                Claims claims = jwtService.parse(header.substring(7));
                tokenStore.blacklist(claims.getId(), claims.getExpiration());
                tokenStore.revokeRefreshSession(Long.parseLong(claims.getSubject()), claims.get("sid", String.class));
            } catch (Exception ignored) {
            }
        }
        return ApiResult.ok();
    }

    @PostMapping("/change-password")
    public ApiResult<TokenResponse> changePassword(
            @RequestHeader(value = "Authorization", required = false) String header,
            @Valid @RequestBody ChangePasswordRequest req) {
        Long userId = CurrentUser.id();
        if (userId == null) throw new BusinessException(40100, "Unauthorized");
        userService.changePassword(userId, req.currentPassword(), req.newPassword());
        tokenStore.revokeRefresh(userId);
        if (header != null && header.startsWith("Bearer ")) {
            try {
                Claims current = jwtService.parse(header.substring(7));
                if (userId.equals(Long.parseLong(current.getSubject()))) {
                    tokenStore.blacklist(current.getId(), current.getExpiration());
                }
            } catch (Exception ignored) {
                // The credential change remains successful; a fresh session is issued below.
            }
        }
        User user = userService.require(userId);
        return ApiResult.ok(issueTokens(user));
    }

    @PostMapping("/forgot-password")
    public ApiResult<Map<String, Object>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
        return ApiResult.ok(accountLifecycle.requestPasswordReset(req.identifier()));
    }

    @GetMapping("/reset-token")
    public ApiResult<Map<String, Object>> peekResetToken(
            @RequestParam String token,
            @RequestParam(defaultValue = "reset") String purpose) {
        if (AccountTokenStore.PURPOSE_INVITE.equalsIgnoreCase(purpose)) {
            return ApiResult.ok(accountLifecycle.peekInviteToken(token));
        }
        return ApiResult.ok(accountLifecycle.peekResetToken(token));
    }

    @PostMapping("/reset-password")
    public ApiResult<Map<String, Object>> resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        if (AccountTokenStore.PURPOSE_INVITE.equalsIgnoreCase(req.purpose())) {
            return ApiResult.ok(accountLifecycle.completeInvite(req.token(), req.newPassword()));
        }
        return ApiResult.ok(accountLifecycle.completePasswordReset(req.token(), req.newPassword()));
    }

    @PostMapping("/invite")
    public ApiResult<Map<String, Object>> invite(@Valid @RequestBody InviteUserRequest req) {
        return ApiResult.ok(accountLifecycle.inviteUser(
                req.name(), req.username(), req.email(), req.roleId(), req.isAdmin(), req.outletId()));
    }

    @PostMapping("/users/{id}/reset-link")
    public ApiResult<Map<String, Object>> issueResetLink(@PathVariable Long id) {
        return ApiResult.ok(accountLifecycle.issueResetLink(id));
    }

    /** Tenant-local account removal; the retired Classic user controller stays unavailable. */
    @DeleteMapping("/users/{id}")
    public ApiResult<Void> deleteUser(@PathVariable Long id) {
        AdminAccess.requireAdmin();
        accountLifecycle.revokeAndDeleteUser(id);
        return ApiResult.ok();
    }

  /** Switch outlet/register work context (re-issues JWT with the selected outlet). */
    @PostMapping("/work-context")
    public ApiResult<TokenResponse> workContext(@Valid @RequestBody WorkContextRequest req) {
        Long userId = CurrentUser.id();
        if (userId == null) {
            throw new BusinessException(40100, "Unauthorized");
        }
        User u = userService.require(userId);
        Long vendorId = outletAccess.requireVendor();
        outletAccess.requireOutletAccess(req.outletId(), u, vendorId);
        outletAccess.requireRegisterForOutlet(req.registerId(), req.outletId(), vendorId);
        if (req.globalMode()) throw new BusinessException(40001, "Global work mode is not available");
        return ApiResult.ok(issueTokens(u, req.outletId(), CurrentUser.sessionId()));
    }

    /** Current user info — mirrors the live /user/info shape. */
    @GetMapping("/me")
    public ApiResult<Map<String, Object>> me() {
        Long id = CurrentUser.id();
        if (id == null) throw new BusinessException(40100, "Unauthorized");
        User u = userService.require(id);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", u.getId());
        body.put("name", u.getName());
        body.put("username", u.getUsername());
        body.put("isAdmin", Boolean.TRUE.equals(u.getIsAdmin()));
        body.put("roleCode", permissionAccess.roleCode(u));
        body.put("permissions", permissionAccess.permissionSafeNames(u));
        body.put("platformOperator", platformAccess.isPlatformAdmin(
                Boolean.TRUE.equals(u.getIsAdmin()), u.getVendorId()));
        body.put("darkMode", u.getDarkMode() == null ? "default" : u.getDarkMode());
        body.put("outletId", CurrentUser.outletId() != null ? CurrentUser.outletId() : u.getOutletId());
        body.put("vendorId", u.getVendorId());
        body.put("email", u.getEmail());
        body.put("roleId", u.getRoleId());
        body.put("pendingPasswordReset", Boolean.TRUE.equals(u.getPendingPasswordReset()));
        TenantHolder.ResolvedTenant tenant = TenantHolder.get();
        if (tenant != null && !tenant.controlPlane() && tenant.slug() != null) {
            body.put("subdomain", tenant.slug());
        }
        return ApiResult.ok(body);
    }

    private Vendor resolveLoginVendor(String requestSubdomain) {
        TenantHolder.ResolvedTenant tenant = TenantHolder.get();
        // Store host: tenant comes from Host ({slug}.orithos.com.au).
        if (tenant != null && !tenant.controlPlane() && tenant.vendor() != null) {
            return tenant.vendor();
        }
        // Control plane (app.*): console login only — no subdomain field.
        // Authenticate against the platform-operator vendor.
        if (tenant == null || tenant.controlPlane()) {
            if (requestSubdomain != null && !requestSubdomain.isBlank()) {
                // Backward-compatible: still accept an explicit slug if a client sends one.
                String slug = slugParser.normalizeSlug(requestSubdomain);
                if (slug == null) {
                    throw new BusinessException(40001, "Invalid store subdomain");
                }
                Vendor vendor = vendorMapper.findBySubdomain(slug);
                if (vendor == null) {
                    throw new BusinessException(40410, "Store not found");
                }
                return vendor;
            }
            return platformAccess.requirePlatformOperatorVendor();
        }
        throw new BusinessException(40001, "Store subdomain is required");
    }

    private void routeToVendor(Vendor vendor) {
        if (tenantShardRegistry == null) return;
        String shardKey = tenantShardRegistry.findShardKey(vendor.getId())
                .orElseThrow(() -> new BusinessException(50310, "Store database shard is not configured"));
        TenantHolder.set(TenantHolder.ResolvedTenant.of(vendor.getSubdomain(), vendor, shardKey));
    }

    private void routeRefreshContext() {
        if (tenantShardRegistry == null) return;
        TenantHolder.ResolvedTenant tenant = TenantHolder.get();
        if (tenant != null && !tenant.controlPlane() && tenant.shardKey() != null) return;
        // Control-plane refresh tokens are issued only to the platform-operator account.
        routeToVendor(platformAccess.requirePlatformOperatorVendor());
    }

    private TokenResponse issueTokens(User u) {
        return issueTokens(u, u.getOutletId());
    }

    private TokenResponse issueTokens(User u, Long sessionOutletId) {
        return issueTokens(u, sessionOutletId, UUID.randomUUID().toString());
    }

    private TokenResponse issueTokens(User u, Long sessionOutletId, String sessionId) {
        List<String> authorities = userService.authorities(u);
        Long outletId = sessionOutletId != null ? sessionOutletId : u.getOutletId();
        String effectiveSessionId = sessionId == null ? UUID.randomUUID().toString() : sessionId;
        var access = jwtService.issueAccess(u.getId(), u.getUsername(),
                Boolean.TRUE.equals(u.getIsAdmin()), outletId, u.getVendorId(), authorities, effectiveSessionId);
        long sessionVersion = tokenStore.currentRefreshVersion(u.getId());
        var refresh = jwtService.issueRefresh(u.getId(), u.getUsername(), outletId, effectiveSessionId, sessionVersion);
        tokenStore.saveRefresh(u.getId(), effectiveSessionId, refresh.jti(), refresh.expiry());
        return toResponse(u, access.token(), refresh.token(), outletId);
    }

    private TokenResponse toResponse(User u, String access, String refresh) {
        return toResponse(u, access, refresh, u.getOutletId());
    }

    private TokenResponse toResponse(User u, String access, String refresh, Long sessionOutletId) {
        return new TokenResponse(access, refresh, props.getAccessTokenTtlMinutes() * 60L,
                userInfo(u, sessionOutletId));
    }

    private TokenResponse.UserInfo userInfo(User u) {
        return userInfo(u, u.getOutletId());
    }

    private TokenResponse.UserInfo userInfo(User u, Long sessionOutletId) {
        boolean admin = Boolean.TRUE.equals(u.getIsAdmin());
        return new TokenResponse.UserInfo(
                u.getId(),
                u.getName(),
                u.getUsername(),
                admin,
                sessionOutletId,
                u.getVendorId(),
                u.getEmail(),
                Boolean.TRUE.equals(u.getPendingPasswordReset()),
                platformAccess.isPlatformAdmin(admin, u.getVendorId()),
                permissionAccess.roleCode(u),
                permissionAccess.permissionSafeNames(u));
    }

}
