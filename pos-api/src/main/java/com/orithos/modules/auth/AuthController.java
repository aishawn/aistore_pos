package com.orithos.modules.auth;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.auth.dto.ChangePasswordRequest;
import com.orithos.modules.auth.dto.ForgotPasswordRequest;
import com.orithos.modules.auth.dto.InviteUserRequest;
import com.orithos.modules.auth.dto.LoginRequest;
import com.orithos.modules.auth.dto.ResetPasswordRequest;
import com.orithos.modules.auth.dto.TokenResponse;
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
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    public AuthController(UserService userService, JwtService jwtService,
                          TokenStore tokenStore, JwtProperties props,
                          AccountLifecycleService accountLifecycle,
                          VendorMapper vendorMapper, TenantSlugParser slugParser,
                          TenantProperties tenantProperties,
                          AccountTokenStore accountTokenStore,
                          PlatformAccessService platformAccess,
                          PermissionAccess permissionAccess) {
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
    }

    @PostMapping("/login")
    public ApiResult<TokenResponse> login(@Valid @RequestBody LoginRequest req) {
        Vendor vendor = resolveLoginVendor(req.subdomain());
        if (TenantResolverFilter.isUnavailable(vendor)) {
            throw new BusinessException(40200, "This trial or store is no longer available");
        }
        User u = userService.authenticate(vendor.getId(), req.username(), req.password());
        if (u.getOutletId() == null) {
            throw new BusinessException(40104, "User is not bound to an outlet");
        }
        String redirectHost = tenantProperties.storeUrl(vendor.getSubdomain());
        TenantHolder.ResolvedTenant hostTenant = TenantHolder.get();
        boolean onControlPlane = hostTenant == null || hostTenant.controlPlane();
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

    @PostMapping("/bootstrap")
    public ApiResult<TokenResponse> bootstrap(@RequestBody Map<String, String> body) {
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
        if (!"refresh".equals(claims.get("type", String.class))
                || !tokenStore.refreshValid(userId, claims.getId())) {
            throw new BusinessException(40103, "Refresh token expired or revoked");
        }
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
        return ApiResult.ok(issueTokens(u, refreshToken));
    }

    @PostMapping("/logout")
    public ApiResult<Void> logout(@RequestHeader(value = "Authorization", required = false) String header) {
        if (header != null && header.startsWith("Bearer ")) {
            try {
                Claims claims = jwtService.parse(header.substring(7));
                tokenStore.blacklist(claims.getId(), claims.getExpiration());
                tokenStore.revokeRefresh(Long.parseLong(claims.getSubject()));
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
        body.put("outletId", u.getOutletId());
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

    private TokenResponse issueTokens(User u) {
        List<String> authorities = userService.authorities(u);
        var access = jwtService.issueAccess(u.getId(), u.getUsername(),
                Boolean.TRUE.equals(u.getIsAdmin()), u.getOutletId(), u.getVendorId(), authorities);
        var refresh = jwtService.issueRefresh(u.getId(), u.getUsername());
        tokenStore.saveRefresh(u.getId(), refresh.jti(), refresh.expiry());
        return toResponse(u, access.token(), refresh.token());
    }

    private TokenResponse issueTokens(User u, String existingRefresh) {
        List<String> authorities = userService.authorities(u);
        var access = jwtService.issueAccess(u.getId(), u.getUsername(),
                Boolean.TRUE.equals(u.getIsAdmin()), u.getOutletId(), u.getVendorId(), authorities);
        return toResponse(u, access.token(), existingRefresh);
    }

    private TokenResponse toResponse(User u, String access, String refresh) {
        return new TokenResponse(access, refresh, props.getAccessTokenTtlMinutes() * 60L, userInfo(u));
    }

    private TokenResponse.UserInfo userInfo(User u) {
        boolean admin = Boolean.TRUE.equals(u.getIsAdmin());
        return new TokenResponse.UserInfo(
                u.getId(),
                u.getName(),
                u.getUsername(),
                admin,
                u.getOutletId(),
                u.getVendorId(),
                u.getEmail(),
                Boolean.TRUE.equals(u.getPendingPasswordReset()),
                platformAccess.isPlatformAdmin(admin, u.getVendorId()),
                permissionAccess.roleCode(u),
                permissionAccess.permissionSafeNames(u));
    }

}
